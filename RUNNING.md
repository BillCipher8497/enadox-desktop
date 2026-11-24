# Running the ENADOX Desktop app (first launch)

**Status at time of writing:** Phases 0–4 done, plus persistent-VP9 + parallel
extract on the sidecar, plus `/metrics`. First integration run is ready; it
won't give you 25fps yet (that's after cover-res drop + bridge-pool bump), but
it will render a 2-browser call end-to-end through the Electron shell.

## One-time setup

From `enadox-desktop/`:

```powershell
# install node deps
npm install

# build the patched lib-jitsi-meet from source and install it into the fork
powershell -ExecutionPolicy Bypass -File scripts\install-lib-jitsi-meet.ps1
```

The script does `npm install` + `npm run build` + `npm pack` in the sibling
`../enadox-video-embed/ext/vcav/lib-jitsi-meet/` clone, then installs the
resulting .tgz into the fork at `../enadox-video-embed/ext/vcav/jitsi-meet/`.
That replaces the hand-patched `lib-jitsi-meet.min.js` with a source build
carrying our two patches (ENADOX_VIDEO_ACTIVE gate + JVB forced-reload no-op).

## Dev launch

Two modes. **For the real integration test**, use `dev:jitsi`:

```powershell
# terminal 1 — the Jitsi backend
cd C:\Users\Arvin\docker-jitsi-meet
docker compose up -d

# terminal 2 — the fork's webpack dev server (serves the React + ENADOX app)
cd ..\enadox-video-embed\ext\vcav\jitsi-meet
# this script is already in the fork from the browser-era work
pwsh run_jitsi_dev.ps1   # or: set WEBPACK_DEV_SERVER_PROXY_TARGET=http://localhost:8000 && node node_modules/webpack/bin/webpack.js serve --mode development

# terminal 3 — the Electron app
cd ..\..\..\..\enadox-desktop
npm run dev:jitsi
```

`dev:jitsi` runs concurrently: tsc watch for main + preload, vite (unused
when VITE_DEV_URL overrides), wait-on for `tcp:5173` + dist files, then
`electron .` with `VITE_DEV_URL=http://localhost:8080` so the window loads
the fork's Jitsi app directly. The Electron main process spawns the Python
sidecar (8011) and talking-photo (8010) as child procs on boot.

`dev` without the `:jitsi` suffix loads our tiny Phase 1 shell instead of
the full Jitsi app — useful for testing just the IPC / supervisor plumbing.

## Verify the launch

Within a few seconds of `npm run dev:jitsi`:

- Electron window opens with the Jitsi prejoin page (same as the browser flow).
- Sidecar console prints `ENADOX video sidecar starting on :8011` and the
  ServiceStatusBar in the window turns green for sidecar.
- Talking-photo console prints `Talking-photo models ready` and its status bar
  goes green.
- `GET http://127.0.0.1:8011/metrics` returns `{ embed: [], extract: [], ... }`
  before any call starts.
- Pick a cover photo in prejoin, join a room — ENADOX toggle OFF = raw camera
  to receiver (we fixed that in the browser build, same code shipped in Electron);
  toggle ON = cover + stego path.

## Services spawned by the Electron app

- sidecar at `ws://127.0.0.1:8011/ws/phasm-{embed,extract}` + `GET /metrics`
- talking-photo at `ws://127.0.0.1:8010/ws/talk` + `/ws/preview`
- docker-jitsi-meet containers you started manually (web:8000, prosody, jicofo, jvb)

Logs tee to `%APPDATA%\ENADOX\logs\{sidecar,talking-photo}.log` and rolling
in-memory buffers are reachable via `window.enadox.sidecar.recentLogs()` /
`window.enadox.talkingPhoto.recentLogs()` from the renderer DevTools.

## Known gaps vs the browser build

- Audio: still routes through `wss://meet.rishirajb.site/enadox-codec`. Returns
  403 on the preview WS from localhost origin — Rishi's allowlist hadn't landed
  last we checked. Will unblock when his change deploys (Phase 7).
- Cover-res is still 1280×720; Tier-1 drop to 960×540 is a pending change.
- Bridge pool defaults to 3; `ENADOX_BRIDGES=5` env in the Debug menu config
  bumps it further. Measure first (`/metrics`), tune second.

## If something is broken

- Electron window is black → `ctrl+shift+I` opens DevTools; check console.
- Sidecar status red → `C:\Users\Arvin\AppData\Local\ENADOX\logs\sidecar.log`
  will show the python traceback. Common cause: path in `config.yaml` is wrong.
  Edit `%APPDATA%\ENADOX\config.yaml` (Debug menu → Open Config File creates it
  from defaults).
- Talking-photo status red → same pattern, `talking-photo.log`. First-boot
  model downloads can be slow (~2 min); be patient.
- Docker status red → `docker compose up -d` in `docker-jitsi-meet` dir, or
  click Start in the backend health panel (Phase 4 UI; may not be hooked up
  yet — check PHASE status in AGENTS.md).

## When returning to work

Read [AGENTS.md](AGENTS.md) status log bottom-up for the latest handoff note.
Pull the branch: `git pull --rebase origin enadox/desktop-app`. Then pick up
the first `[todo]` task assigned to your agent in the phase order.
