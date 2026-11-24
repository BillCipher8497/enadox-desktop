# ENADOX Desktop

Windows Electron client for Jitsi video calls with optional talking-photo cover and ENADOX video recovery.

## Development setup

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

## Windows development installer

Run `npm run dist` to build the unsigned x64 installer in `build/`. This packages the current Electron shell.

On the development machine, if electron-builder reports a symlink error extracting the Darwin libraries from winCodeSign, use the prepared Windows tool cache for this PowerShell session:

```powershell
$env:ELECTRON_BUILDER_CACHE = Join-Path $PWD '.cache/electron-builder'
npm run dist
```

## Package the Python sidecar

From the repository root, build the sidecar before running `npm run dist`:

```powershell
py -3.12 scripts/sidecar/build.py
```

The build reads the sibling `enadox-video-embed` source and RVM model, installs dependencies into `.cache/sidecar/venv`, and writes `resources/python-bundle/enadox-service.exe`. Electron Builder includes that executable at `resources/python-bundle/enadox-service.exe` in the installed application.

The executable includes Python, OpenVINO, PyAV, and the RVM model. It listens on loopback port 8011 and writes service logs under `%LOCALAPPDATA%/ENADOX/results/live_logs`. Set `ENADOX_DATA_DIR` to redirect that data directory. The Phasm endpoints still require the WSL bridge.
