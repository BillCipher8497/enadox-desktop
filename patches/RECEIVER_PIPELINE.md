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

## Known follow-ups

- Persistent VP9 decoder on the receiver (Tier 2.1) — currently each
  `_vp9_decode` call still creates a fresh `av.open(...)` container. Mirror of
  the persistent-encoder refactor we did on the sender.
- Decode `decode_h264_annexb` once per segment and share with the composite
  worker (currently fine because it's fast).
