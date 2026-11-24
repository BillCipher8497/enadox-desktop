# ENADOX Desktop — agent handoff doc

**Read this file FIRST every time you start a session, whether you're Claude or Codex.**
It is the single source of truth for what's built, what's next, and who is doing what.

## What this is

A Windows desktop Electron app that does everything the browser-based
`../enadox-video-embed/ext/vcav/jitsi-meet` does, but without any of the
browser-only workarounds (service workers, webpack proxy frame mangling, config.js
scheme rewrites, insertable-streams gates, forced H.264 packetization-mode fights,
Google OAuth redirect allowlist, etc.). Same end-user behavior:

- 2-browser Jitsi P2P call
- Optional cover (talking-photo) with lip-sync
- Person-direct ENADOX (RVM matte + VP9 + Phasm coefficient-domain H.264 stego)
- DEDOX recovery at the receiver

The browser version is proven working (milestone #2: end-to-end person-direct
recovery over real Jitsi P2P, 0 decode failures). Steady-state ~6 fps composited
before the persistent-VP9 refactor; micro-bench projects ~15 fps post-refactor.
Electron removes the browser overhead ceiling.

## Why Electron (not browser, not Tauri)

- Jitsi-meet is React + heavy JS; Electron reuses it with minimal churn
- Chromium renderer has WebRTC + RTCRtpScriptTransform — we need both
- Node main process can spawn the Python sidecar + talking-photo subprocess
  directly — no WS proxying, no port conflicts, no HTTPS cert dance
- Native filesystem + process control — can bundle the Python env and Rust
  phasm bridge as resources
- Ships as a `.exe` to the user. Simple.

## Existing assets we are PORTING FROM (do not modify these):

- `../enadox-video-embed/ext/vcav/jitsi-meet/` — the Jitsi fork with all our
  ENADOX video changes on branch `feat/talking-photo-cover`. Reference, source
  of code we copy/adapt.
- `../enadox-video-embed/src/enadox_service.py` — the sidecar WS server
  (persistent-VP9 refactor landed here).
- `../enadox-video-embed/src/phasm_live.py` — Phasm bridge wrapper + sender pipeline helper.
- `../enadox-video-embed/src/person_codec.py` — RVM + persistent VP9 person codec.
- `../enadox-video-embed/ext/vcav/talking-photo/` — Python talking-photo service (port 8010).
- `/home/arvin/phasm-live-bridge/` (WSL) — Rust binary used by sidecar.
- `C:/Users/Arvin/docker-jitsi-meet/` — local Jitsi backend.
- `C:/Users/Arvin/OneDrive/Desktop/CovertDefensesLLC/ShadowMeet/ShadowFive/.venv-ov/` — the
  Python environment we'll point the bundled sidecar at (openvino + PyAV + cv2 etc.).

## What the Electron app looks like at the end

```
enadox-desktop/
  package.json
  tsconfig.json
  electron-builder.json
  AGENTS.md                           ← this file
  README.md
  src/
    main/                             (Node — Electron main process)
      index.ts                        ← creates BrowserWindow, wires everything
      sidecar.ts                      ← spawns + monitors enadox_service.py
      talkingPhoto.ts                 ← spawns talking-photo/service.py
      jitsiBackend.ts                 ← checks docker-jitsi-meet health; starts if needed
      ipc.ts                          ← IPC channel definitions
    preload/
      index.ts                        ← contextBridge API to renderer
    renderer/                         (Chromium — the UI)
      index.html
      app.tsx                         ← mounts the jitsi-meet React app
      enadox/                         ← the ported, cleaned ENADOX layer
        TalkingPhotoVideoEffect.ts
        EnadoxVideoInject.ts
        EnadoxInjectSender.ts
        StegoManager.ts
        ...
      lib-jitsi-meet/                 ← vendored, patched copy (no more .min.js hack)
  resources/
    python/                           ← bundled sidecar Python
    bridge/                           ← bundled phasm-live-bridge Linux binary (ships in WSL)
    models/                           ← RVM ONNX, talking-photo weights (symlinked from
                                        the enadox-video-embed/models until packaging)
  build/
    (electron-builder output)
```

## Things we strip (do not carry over)

Each of these was a browser-specific workaround. In Electron we don't need any.

1. Webpack dev-server proxy and its frame-mangling WS behavior → gone.
2. `config.js` scheme rewrite middleware → gone, config is just an object.
3. `pwa-worker.js` neutralizer → gone, no service worker.
4. `forceH264` packetization-mode=1 SDP munging → still useful but simpler
   (we control both ends; just configure Jitsi's codec preferences directly).
5. `enableInsertableStreams` lib-jitsi-meet.min.js hand-patch → replaced by
   vendoring lib-jitsi-meet source with the gate flipped properly, OR using a
   custom build.
6. JVB forced-reload suppression → gone. We ship `docker compose up` in the
   onboarding; or we point at `meet.rishirajb.site` for cloud testing. Local
   JVB ICE death on Docker-for-Windows UDP is an avoidable env issue, not
   our bug.
7. `ENADOX_VIDEO_ACTIVE` auto-setter from localStorage flag → the UI toggle
   is the single source of truth. No "dev flag that forces half the pipeline on".
8. All the `__ENADOX_SOFT_RESET__` / `__ENADOX_DIAG_RAWFEED__` operator consoles
   → rebuilt as a proper Debug menu in the app.

## Phases and task division

**Legend:**
- Owner is either `[Claude]`, `[Codex]`, or `[either]`.
- Status is `[todo]`, `[in-progress by <name>]`, `[done]`, `[blocked: <reason>]`.
- Before you start a task, flip its status to `[in-progress by <name>]` and
  add a note with the time (local). When done, flip to `[done]` and add a
  one-sentence summary of what landed.
- If you can't do a task (needs info / another task not done), set `[blocked]`
  with the reason.

### Phase 0 — scaffolding

- [done] [Codex] (started 2026-11-23 20:17 ET) `package.json` with scripts: `dev`, `build`, `dist`, `lint`. Deps:
  electron@^32, electron-builder, typescript, @types/node, @types/electron, eslint,
  react, react-dom, @types/react*, vite (renderer bundler). Added the four npm scripts and verified installation of the locked Electron 32 and React 18 toolchain.
- [done] [Codex] (started 2026-11-23 20:23 ET) `tsconfig.json` (project refs: `main`, `preload`, `renderer`).
  ES2022 target, strict, moduleResolution bundler for renderer. Verified the strict ES2022 solution build for main, preload and the Vite renderer.
- [done] [Codex] (started 2026-11-23 20:24 ET) `electron-builder.json` — Windows NSIS target, app id
  `com.covertdefenses.enadox`, bundle `resources/` as extraResources. Validated the NSIS configuration and resource mapping against electron-builder's installed schema.
- [done] [Codex] (started 2026-11-23 20:24 ET) Vite config for the renderer with React + TS. Built the Phase 1 React entry into dist/renderer with file-relative assets and verified the two Electron entry points survived the build.
- [done] [Codex] (started 2026-11-23 20:25 ET) `.gitignore`, `.eslintrc.cjs`, prettier config. Added ESLint and Prettier settings and ignored TypeScript incremental build files.
- [done] [Codex] (started 2026-11-23 20:25 ET) `README.md` with the setup commands below (the ones in this file's
  "User setup" section). Keep that section in sync. Mirrored the prerequisites, PowerShell commands and planned service startup in the README.

### Phase 1 — bare Electron shell that launches

- [todo] [Claude] `src/main/index.ts` — creates BrowserWindow with nodeIntegration off,
  contextIsolation on, preload path wired. Open DevTools in dev.
- [todo] [Claude] `src/preload/index.ts` — contextBridge exposes a stub `enadox` global
  with `platform`, `version`, `onLog` for now.
- [todo] [Claude] `src/renderer/index.html` + `src/renderer/app.tsx` — React root with
  one `<h1>ENADOX</h1>` and a placeholder tile grid. Just so we see something render.
- [done] [Codex] (started 2026-11-23 20:25 ET) Icons and branding (grab from `enadox-video-embed/static/images/` if
  anything usable there; otherwise generate a monochrome pink square 256x256). Created the fallback pink 256px icon and verified all seven Windows ICO sizes in the configured branding directory.
- [todo] [Claude] `npm run dev` wired to run main + preload (tsc watch) + renderer
  (vite dev) and launch electron against vite's URL.

### Phase 2 — port the Jitsi-meet renderer

- [todo] [Claude] Decide whether to vendor the whole jitsi-meet source or embed its
  built bundle. Trade-off: full source lets us edit; bundle is faster to get working.
  **Call:** full source. Copy from `../enadox-video-embed/ext/vcav/jitsi-meet` on branch
  `feat/talking-photo-cover`, strip webpack-dev-server config, rewire against Vite.
- [todo] [Claude] Vendor `lib-jitsi-meet` source with the ENADOX_VIDEO_ACTIVE gate in
  the right place (3 `enableInsertableStreams` sites + the `_onIceConnectionFailed`
  reload suppression). No more hand-patching the .min.js.
- [todo] [either] Remove webpack.config.js middleware (p2p override, pwa neutralizer,
  config.js scheme rewrite). Config is now a plain TS file.
- [todo] [Claude] Rewire the renderer entry to point at a local Jitsi backend. For dev,
  that's `http://localhost:8000` (docker-jitsi-meet). Configurable.
- [todo] [Claude] Wire ENADOX toggle, DEDOX button, TalkingPhotoVideoEffect — these
  mostly port as-is. Drop the `__ENADOX_*` console globals; expose them through the
  preload API.

### Phase 3 — sidecar + talking-photo as child processes

- [todo] [Claude] `src/main/sidecar.ts` — spawn `enadox_service.py` using the
  OpenVINO venv Python. Pipe stdout/stderr to Electron's main log. Health-check the
  WS at startup, restart if it crashes.
- [todo] [Claude] `src/main/talkingPhoto.ts` — same pattern for the talking-photo
  service (listens on 8010).
- [todo] [either] Expose health status and child-process logs to the renderer
  through IPC — a little status bar at the bottom.
- [todo] [Codex] A config file (`resources/config/default.yaml`) with the paths
  (Python venv, phasm bridge, docker-jitsi-meet checkout). User can override in
  `%APPDATA%/ENADOX/config.yaml`.

### Phase 4 — Jitsi backend management

- [todo] [Claude] Detect docker-jitsi-meet containers. If absent/stopped, either
  start them (`docker compose up -d`) or show a clear "backend down — start it in
  WSL first" dialog. Don't try to bundle docker itself.
- [todo] [either] Backend health panel in the Debug menu.

### Phase 5 — polish the ENADOX layer

- [todo] [Claude] Port the `/ws/phasm-embed` pipeline and `/ws/phasm-extract` paths
  from the sidecar into the renderer's WS client, keep the client-side Worker sender
  transform. Everything from `EnadoxInjectSender.ts` + `EnadoxVideoInject.ts` ports
  almost verbatim.
- [todo] [Claude] Bring over persistent-VP9 improvements (already in
  `../enadox-video-embed/src/person_codec.py`). Sidecar code doesn't change —
  Electron just runs that file.
- [todo] [Claude] Port the DEDOX full-screen overlay, the DedoxButton toggle.
- [todo] [either] UX pass: no more "name circle" when ENADOX is off (cover hidden
  by default, raw camera flows). This was the last bug we fixed before the pivot.

### Phase 6 — speed tier-1 items (from OPTIMIZATION_ROADMAP.md)

- [todo] [Claude] `/metrics` endpoint on sidecar + renderer scraping it for a real-time
  perf panel.
- [todo] [either] Cover res 1280x720 → 960x540.
- [todo] [either] Receiver-side pipeline mirror.
- [todo] [Claude] Persistent VP9 decoder on receiver.

### Phase 7 — audio

- [todo] [Claude] Local audio codec OR point at `meet.rishirajb.site` cloud. Decide
  based on where Rishi's allowlist stands when we get here.
- [todo] [either] Wire cover-voice + Google OAuth sign-in. In Electron we can
  intercept the OAuth redirect without the browser allowlist dance.

### Phase 8 — packaging

- [todo] [Codex] Figure out how to bundle the Python venv — likely `pyinstaller`
  the sidecar into a single exe that doesn't need the venv at runtime. Big task,
  can defer until the dev flow is solid.
- [todo] [Codex] Bundle a Windows-native phasm-live-bridge.exe so WSL isn't required.
  Needs cross-compiling the Rust at `/home/arvin/phasm-live-bridge`. Deferable.
- [todo] [Codex] NSIS installer via electron-builder; sign with whatever cert Arvin
  wants to use (or none for dev).

## Who does what (quick rules)

- **Claude** handles: anything that touches the WebRTC pipeline, the stego path,
  Jitsi integration, child-process management, IPC design, and debugging.
- **Codex** handles: build config, docs, tests, repetitive refactors, icons,
  Python packaging, installers.
- **Either** means pick whoever has usage. When you pick up a task, update this
  file and go. When you finish, mark it done. Don't duplicate work.

## Handoff protocol

- Agents DO NOT edit the same source file in parallel. If two tasks touch the
  same file, do them serially — flip the first to `[in-progress]`, when done
  flip the second.
- Commit after each task completes. Commit messages tag the agent:
  `[claude] feat(main): spawn sidecar on app ready` or
  `[codex] chore(build): vite config for renderer`.
- Push the branch (`enadox/desktop-app`) to GitHub when the first non-empty
  commit lands so the other agent can pull.
- If you need something the other agent should do first, make it a `[todo]`
  entry and leave a `[blocked]` note on yours.
- At end of your session (running out of usage), write a `## Session end notes`
  entry below with:
  - What's running (child procs, docker)
  - What state the tree is in (branch, dirty files)
  - What the next agent should look at first

## Status log

(Append-only. Most recent on top.)

- **2026-11-23 — Claude:** Pivot initiated. All processes killed. Folder
  scaffolded with this `AGENTS.md`. Next agent picks up Phase 0.

## User setup (to be mirrored in README.md)

Pre-requisites you already have:

- Node 18+ (verify: `node -v`)
- Python 3.12 at `C:/Users/Arvin/OneDrive/Desktop/CovertDefensesLLC/ShadowMeet/ShadowFive/.venv-ov/`
- WSL Ubuntu with `/home/arvin/phasm-live-bridge/target/release/phasm-live-bridge`
- Docker Desktop running with `C:/Users/Arvin/docker-jitsi-meet/` configured

From PowerShell, run

```powershell
cd C:/Users/Arvin/OneDrive/Desktop/CovertDefensesLLC/enadox-desktop
npm install
npm run dev
```

Once service integration lands, the Electron app's main process
spawns the Python sidecar + talking-photo for you. Docker you still start
manually once per boot.
