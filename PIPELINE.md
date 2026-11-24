# ENADOX Desktop — pipeline + overall plan

Answering "how does the whole thing fit together once we're in Electron?"

## Short answer

Same architecture as today. **Media still runs through the Jitsi backend**
(docker-jitsi-meet locally, or `meet.rishirajb.site` eventually). The stego
goes on top of WebRTC via RTCRtpScriptTransform exactly like it does now in
Chrome — because Electron IS Chrome in the renderer. What changes is we
delete all the browser workarounds (service workers, webpack proxy, scheme
rewrites, forced-codec SDP munging, origin allowlists, etc.) and we spawn
the Python sidecar + talking-photo IN-PROCESS so there's no cross-origin
WS fragility.

## The pipeline, left to right

```
┌──────────────── Electron app window ────────────────┐   ┌──── backend ────┐
│                                                     │   │                 │
│  ┌────────── Renderer (Chromium) ─────────────┐     │   │  docker-jitsi   │
│  │                                            │     │   │  (prosody,      │
│  │  Jitsi + ENADOX React app                  │     │   │   jicofo, jvb,  │
│  │                                            │     │   │   web)          │
│  │   camera ─► TalkingPhotoVideoEffect ─────┐ │     │   │                 │
│  │                 │                        │ │     │   │   XMPP signaling│
│  │                 ├─ raw camera (ENADOX    │ │     │   │   over WSS      │
│  │                 │    off)                │ │     │   │                 │
│  │                 └─ cover+lip-sync frames │ │     │   │   P2P:  direct  │
│  │                      (ENADOX on)         │ │     │   │   JVB:  bridge  │
│  │                                          │ │     │   │   (3+ peers)    │
│  │   PeerConnection                         │ │     │   │                 │
│  │    │                                     │ │     │   └─────────┬───────┘
│  │    │  sender RTCRtpScriptTransform ◄─────┘ │     │             │
│  │    │   (worker; enable/disable from UI)    │     │             │
│  │    │                                       │     │             │
│  │    │   ▲ swaps frame.data with phasm AU    │     │             │
│  │    │   │                                   │     │             │
│  │    │   │   WS ws://127.0.0.1:8011          │     │             │
│  │    │   │   /ws/phasm-embed                 │     │             │
│  │    │   ▼                                   │     │             │
│  │    │  ┌──────────── sidecar ────────────┐  │     │             │
│  │    │  │ pipelined; owned by main proc  │  │     │             │
│  │    │  │ (child_process.spawn)          │  │     │             │
│  │    │  │  recv → jdec → person_task →   │  │     │             │
│  │    │  │    phasm pool (3 bridges) →    │  │     │             │
│  │    │  │    send                         │  │     │             │
│  │    │  │                                 │  │     │             │
│  │    │  │  RVM matte + persistent VP9    │  │     │             │
│  │    │  │  person + alpha; Phasm STC in  │  │     │             │
│  │    │  │  H.264 coefficients            │  │     │             │
│  │    │  └──────────────┬──────────────────┘  │     │             │
│  │    │                 │ wsl.exe             │     │             │
│  │    │                 ▼                      │     │             │
│  │    │  phasm-live-bridge (Rust in WSL;      │     │             │
│  │    │  bundled Windows exe post Phase 8)    │     │             │
│  │    │                                       │     │             │
│  │    ▼                                       │     │             │
│  │   RTP H.264 out ──────────────────────────────── │─────────────┘
│  │   (cover carrying stego, or raw camera H.264     │
│  │    if ENADOX is OFF)                              │
│  │                                                  │
│  │   RTP H.264 in ◄────────────────────────── signaling + media (symmetric)
│  │    │                                             │
│  │    receiver RTCRtpScriptTransform                │
│  │    (tee encoded chunks to extractor)             │
│  │    │                                             │
│  │    │   WS ws://127.0.0.1:8011                    │
│  │    │   /ws/phasm-extract                         │
│  │    ▼                                             │
│  │   sidecar extract pipeline                       │
│  │    phasm pool → person decode → composite        │
│  │                                                  │
│  │   composited frames painted to the DEDOX         │
│  │   full-screen overlay when the user clicks       │
│  │   the DEDOX toggle                               │
│  │                                                  │
│  │   plus:                                          │
│  │   - cover voice pre-generated via                │
│  │     talking-photo:8010 (local child proc)        │
│  │   - cover-preview WS to meet.rishirajb.site/     │
│  │     enadox-codec (cloud audio codec; TBD if we   │
│  │     stand up a local one)                        │
│  └───────────────────── preload (contextBridge) ────┘     │
│                                   │                       │
│                                   ▼                       │
│  ┌──────────────── Main (Node) ──────────────────────┐    │
│  │  spawns + supervises:                             │    │
│  │   - enadox_service.py (sidecar :8011)             │    │
│  │   - talking-photo/service.py (cover :8010)        │    │
│  │  checks docker-jitsi-meet health                  │    │
│  │  rolling logs to %APPDATA%\ENADOX\logs\           │    │
│  │  config in %APPDATA%\ENADOX\config.json           │    │
│  └───────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────┘
```

## What's identical to today's browser version

- Jitsi handles signaling and media routing. P2P for 2-peer calls, JVB
  for 3+.
- The RTCRtpScriptTransform is the stego injection/extraction surface —
  renderer still runs the exact same worker code.
- Python sidecar is the same code we have now (`enadox_service.py`
  with the persistent-VP9 pipeline + 3-bridge pool).
- Talking-photo (cover generation + lip-sync) is the same Python service.
- Phasm Rust bridge in WSL stays (future: Windows-native exe, Phase 8).
- Cover voice/audio codec is cloud (`meet.rishirajb.site`) today;
  possibly local later (Phase 7).

## What goes away vs today's browser build

- **Webpack dev-server** — Vite replaces it, zero proxy.
- **Service worker / PWA / config.js scheme rewrite** — no SW, config is
  a direct object injected via preload.
- **`forceH264` SDP munging for packetization-mode=1** — we configure
  Jitsi directly; one config value, not a runtime patch.
- **lib-jitsi-meet.min.js hand-patch** — we build lib from source with
  the two gates applied in readable TypeScript.
- **JVB forced-reload suppression** — same, patched at source instead
  of in minified output.
- **`__ENADOX_SOFT_RESET__`, `__ENADOX_DIAG_RAWFEED__`, localStorage
  flags** — replaced by a Debug menu in the Electron main process menu
  bar + a proper settings UI.
- **Google OAuth allowlist wrestling** — Electron opens the OAuth URL
  in the OS browser, OAuth callback comes back via our custom
  `enadox://` scheme, we hand the token to the renderer. No browser-
  cookie domain issues.
- **Separate HTTPS/HTTP mode fight** — Electron loads via
  `file://` / `app://`, everything is "trustworthy origin".

## Overall plan (from AGENTS.md, condensed)

**Phase 0 — scaffolding** (Codex, in progress)
package.json, tsconfig, vite config, electron-builder, icons, README.

**Phase 1 — Electron shell** (Claude, in progress — just pushed)
Main process, preload, placeholder renderer. Window opens, IPC wires up,
Debug menu works.

**Phase 2 — Port the Jitsi + ENADOX renderer** (Claude)
Vite config points at `../enadox-video-embed/ext/vcav/jitsi-meet`, builds
the renderer from there. Vendor `lib-jitsi-meet` source with the two
gates applied. Strip webpack.config.js. Renderer loads, joins a room.

**Phase 3 — Child-process lifecycle** (Claude)
Main process spawns the sidecar + talking-photo. Health monitoring,
restart-on-crash, log rolling.

**Phase 4 — Jitsi backend management** (Claude)
Detect docker-jitsi-meet. If down, clear user prompt. Never try to install
or control Docker Desktop.

**Phase 5 — Polish the ENADOX layer** (Claude)
Port the sender transform worker, DedoxButton, EnadoxButton, overlay.
Cover-hidden-by-default default (the last bug we fixed before the pivot).

**Phase 6 — Speed tier 1** (both agents)
Receiver pipeline mirror, cover-res drop, bigger bridge pool, measure.

**Phase 7 — Audio** (Claude)
Cover voice via OAuth sign-in or local codec.

**Phase 8 — Packaging** (Codex)
PyInstaller on the sidecar so no venv at runtime. NSIS installer. Windows
phasm-bridge build (remove WSL dependency).

## Does it still go through Jitsi?

Yes. All media (video + audio) rides on Jitsi's WebRTC paths — P2P between
two peers, JVB bridge for 3+. Our stego runs AS PART of the WebRTC pipeline
via RTCRtpScriptTransform on the sender and receiver; the Jitsi server
never knows anything about it. From Jitsi's point of view it's just a
weirdly-encoded H.264 stream carrying a valid cover image.

In production, the user points at whichever Jitsi backend: the local docker
stack (for dev/testing), their own self-hosted Jitsi, or a cloud tenant
like the one at `meet.rishirajb.site`. The Electron app doesn't care which.
