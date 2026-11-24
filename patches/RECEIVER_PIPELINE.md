# Phase 6: Receiver-side pipeline mirror

Applied to the sibling sidecar source at
`..\enadox-video-embed\src\enadox_service.py` (untracked by its outer repo).
A snapshot of the file after this change sits next to this doc.

## What changed

The `/ws/phasm-extract` handler was strictly serial — one AU at a time through
`bridge.extract` + `PersonCodec.decode` + `decode_h264_annexb` + composite —
which capped the receiver at ~5 fps even after the sender pipeline shipped.

Refactored into the same 3-stage pattern as `/ws/phasm-embed`:

- **recv_task** — reads AUs off the WS, assigns a monotonic seq, queues
  `(seq, au_bytes)` → `work_q`
- **extract pool (N workers, N = `ENADOX_EXTRACT_BRIDGES` or `ENADOX_BRIDGES`,
  default 3)** — each owns a persistent `PhasmBridge` subprocess and runs the
  blocking bridge+decode+composite on its own thread. Stores results into a
  reorder buffer keyed by seq.
- **send_task** — emits recon JPEGs on the WS in strict seq order so the
  receiver UI's frame timeline doesn't jitter.

Non-person legacy path (`person=false`) still uses the serial `PhasmReceiver`
because it needs multi-AU segment accumulator state that doesn't parallelize
cleanly. The person-direct hot path (gop=1 = AU=segment) is fully pipelined.

## Projected impact

Pre-pipeline receiver: ~195 ms/seg → ~5 fps ceiling.
With N=3: ~65 ms effective → ~15 fps, matching the sender ceiling.

Combined with the sender pipeline that already shipped, the full round-trip
is now bound by whichever side is slower; we're within striking distance of
the 25 fps target with Tier-1 items 1.2 (cover-res drop) + 1.3 (pool to 5).

## Env knobs

- `ENADOX_EXTRACT_BRIDGES=<N>` — receiver pool size (defaults to
  `ENADOX_BRIDGES` if unset, then 3)
- `ENADOX_BRIDGES=<N>` — sender pool size (kept as before)

## Persistent VP9 decoder (Tier 2.1 — SHIPPED)

Mirror of the sender's persistent-encoder refactor, applied to the receiver.
`person_codec.py` gets two new classes:

- `_PersistentVp9Decoder` — single long-lived libvpx-vp9 CodecContext. Parses
  IVF framing by hand ([u32 size][u64 pts][bytes]) and feeds each packet to
  the kept-alive decoder. Thread-UNSAFE; must be per-worker.
- `PersistentPersonDecoder` — pair of the above (person + alpha); same return
  shape as the static `PersonCodec.decode` so `composite()` is untouched.

The extract pipeline in `enadox_service._extract_one` now takes a per-worker
decoder arg and calls `decoder.decode(body)` instead of the static path.

### Micro-bench on 240×135 random segments (10 seg)

| Path | Total | Avg/seg | vs baseline |
|---|---|---|---|
| Stateless `PersonCodec.decode` (old) | 86 ms | 8.6 ms | 1.0x |
| `PersistentPersonDecoder.decode` | 5 ms | 0.5 ms | **15.9x** |

### Receiver stage cost after both refactors

- Bridge extract (phasm Rust, WSL): 100–200 ms per call — DOMINANT.
  With 3-bridge pool: 50–70 ms effective.
- Persistent VP9 decode (person + alpha): ~0.5 ms.
- `decode_h264_annexb` (cover re-render from the segment's Annex-B): untouched,
  small enough to leave alone for now.
- Composite (numpy): ~1 ms.

Receiver ceiling: ~15–20 fps with N=3 bridges; matches the sender's. The last
5 fps to 25 come from Tier-1 cover-res (720→540) plus pool bump (3→5).

## Known follow-ups

- `decode_h264_annexb` could reuse a persistent H264 context same way; measure
  first — it may already be <5 ms.
- When we build a Windows-native phasm-live-bridge.exe (Phase 8) the per-call
  cost drops below 100 ms, at which point VP9 becomes the budget again.
