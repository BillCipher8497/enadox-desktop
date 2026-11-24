# Electron IPC API

Contract between the renderer and the Electron main process. Written up front so
the preload API stays small and typed. Owned by Claude; Codex should reference
this when writing docs but not change the shape.

## Shape

The preload exposes a single `window.enadox` object via contextBridge. All calls
are promise-based and all events are subscription-based. No raw IPC channels
leak into the renderer.

```ts
declare global {
    interface Window {
        enadox: EnadoxApi;
    }
}

interface EnadoxApi {
    platform: 'win32' | 'linux' | 'darwin';
    version: string;        // app version from package.json

    config: {
        get(): Promise<AppConfig>;
        update(patch: Partial<AppConfig>): Promise<AppConfig>;
    };

    sidecar: {
        status(): Promise<ServiceStatus>;
        start(): Promise<void>;
        stop(): Promise<void>;
        onLog(cb: (line: string) => void): () => void;   // returns unsubscribe
        onStatus(cb: (s: ServiceStatus) => void): () => void;
    };

    talkingPhoto: {
        status(): Promise<ServiceStatus>;
        start(): Promise<void>;
        stop(): Promise<void>;
        onLog(cb: (line: string) => void): () => void;
        onStatus(cb: (s: ServiceStatus) => void): () => void;
    };

    jitsiBackend: {
        // docker-jitsi-meet containers
        status(): Promise<{ running: boolean; containers: string[] }>;
        start(): Promise<void>;    // docker compose up -d in $DOCKER_JITSI_DIR
    };

    // Opens an external URL in the user's default browser (never inside Electron).
    // Used for OAuth flows that should land back in the app via a custom scheme.
    openExternal(url: string): Promise<void>;

    // Dev-only: dump internal state for debugging.
    diag(): Promise<DiagSnapshot>;
}

interface AppConfig {
    pythonVenvPath: string;         // ".../ShadowMeet/.venv-ov/Scripts/python.exe"
    sidecarScript: string;           // "../enadox-video-embed/src/enadox_service.py"
    talkingPhotoScript: string;      // "../enadox-video-embed/ext/vcav/talking-photo/service.py"
    dockerJitsiDir: string;          // "C:/Users/Arvin/docker-jitsi-meet"
    jitsiUrl: string;                // "http://localhost:8000"
    sidecarPort: number;             // 8011
    talkingPhotoPort: number;        // 8010
    bridges: number;                 // ENADOX_BRIDGES
    ffmpegPath: string | null;       // added to PATH for talking-photo
}

interface ServiceStatus {
    state: 'stopped' | 'starting' | 'running' | 'crashed';
    pid: number | null;
    startedAt: number | null;        // epoch ms
    lastExitCode: number | null;
    lastError: string | null;
    port: number;
}

interface DiagSnapshot {
    sidecar: ServiceStatus;
    talkingPhoto: ServiceStatus;
    jitsi: { running: boolean; containers: string[] };
    config: AppConfig;
    recentLogs: { sidecar: string[]; talkingPhoto: string[] };
}
```

## Channel naming (internal; not exposed)

Namespaced strings, one-way or invoke/handle. Renderer never sees these.

- `enadox:config:get`              invoke
- `enadox:config:update`           invoke
- `enadox:sidecar:status`          invoke
- `enadox:sidecar:start`           invoke
- `enadox:sidecar:stop`            invoke
- `enadox:sidecar:log`             event → renderer
- `enadox:sidecar:status-change`   event → renderer
- (same shape for `talkingPhoto`)
- `enadox:jitsi:status`            invoke
- `enadox:jitsi:start`             invoke
- `enadox:shell:open-external`     invoke
- `enadox:diag`                    invoke

## Persistence

AppConfig persists at `%APPDATA%\ENADOX\config.json`. Defaults from
`resources/config/default.yaml` (Phase 3 task). First boot writes the merged
config.

## Logs

Main process keeps a rolling buffer of the last 500 lines per child process in
memory and tails them to disk at `%APPDATA%\ENADOX\logs\{sidecar,talking-photo}.log`
(rotated at 10 MB). The renderer subscribes via `onLog`; the Debug menu can
also open the log directory.

## Error surfacing

- Sidecar crash: main process restarts up to 3 times with exponential backoff,
  then sets `state='crashed'`, emits `onStatus`, and surfaces in the UI
  status bar with the last 20 stderr lines + a "Restart" button.
- Talking-photo crash: same.
- Docker not running: `jitsiBackend.status()` returns `running: false`, UI
  shows "Jitsi backend down — start Docker Desktop" with a Retry.
- OAuth redirect lands on the app's `enadox://` custom scheme handler.

## Security

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` where
  possible on the renderer.
- Preload is the ONLY bridge. No `require('electron')` or `ipcRenderer` from
  the renderer.
- CSP on the renderer HTML: `default-src 'self'; connect-src 'self' ws:
  http://localhost:* ws://localhost:* ws://127.0.0.1:* https://meet.rishirajb.site`.
  (Last entry is the audio codec; drop when we go local.)
- No remote module.

## Open questions

- Do we want the app to spawn docker on first boot if it's installed but
  stopped? Probably not — user wants explicit control over docker. Phase 4
  task will decide.
- Custom URL scheme: `enadox://` for OAuth callbacks. Need to register it
  via `app.setAsDefaultProtocolClient('enadox')`. Handle in main's
  `second-instance` event for single-instance semantics.
