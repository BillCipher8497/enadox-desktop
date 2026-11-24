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
