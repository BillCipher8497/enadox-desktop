/**
 * ENADOX Desktop — preload bridge.
 *
 * The ONLY path between the renderer (Chromium, no node) and the main process.
 * Exposes a narrow, typed API via contextBridge as `window.enadox`.
 * See IPC_API.md at the repo root for the full contract.
 */
import { contextBridge, ipcRenderer } from 'electron';

// Unsubscribe helper for event subscriptions.
type Off = () => void;

function on<T>(channel: string, cb: (v: T) => void): Off {
    const handler = (_evt: Electron.IpcRendererEvent, value: T) => cb(value);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.off(channel, handler);
}

const api = {
    platform: process.platform as NodeJS.Platform,
    // version is fetched via invoke so it's actual app version, not preload's node version
    getVersion: () => ipcRenderer.invoke('enadox:version') as Promise<string>,

    shell: {
        openExternal: (url: string) =>
            ipcRenderer.invoke('enadox:shell:open-external', url) as Promise<void>
    },

    // Sidecar manager (Phase 3). Handlers register as they come online; invoke calls
    // will reject with 'No handler registered' until then — that's fine for dev,
    // the UI will show the status bar in a "down" state.
    sidecar: {
        status: () => ipcRenderer.invoke('enadox:sidecar:status'),
        start: () => ipcRenderer.invoke('enadox:sidecar:start'),
        stop: () => ipcRenderer.invoke('enadox:sidecar:stop'),
        onLog: (cb: (line: string) => void) => on('enadox:sidecar:log', cb),
        onStatus: (cb: (s: unknown) => void) => on('enadox:sidecar:status-change', cb)
    },

    talkingPhoto: {
        status: () => ipcRenderer.invoke('enadox:talkingPhoto:status'),
        start: () => ipcRenderer.invoke('enadox:talkingPhoto:start'),
        stop: () => ipcRenderer.invoke('enadox:talkingPhoto:stop'),
        onLog: (cb: (line: string) => void) => on('enadox:talkingPhoto:log', cb),
        onStatus: (cb: (s: unknown) => void) => on('enadox:talkingPhoto:status-change', cb)
    },

    jitsiBackend: {
        status: () => ipcRenderer.invoke('enadox:jitsi:status'),
        start: () => ipcRenderer.invoke('enadox:jitsi:start')
    },

    config: {
        get: () => ipcRenderer.invoke('enadox:config:get'),
        update: (patch: Record<string, unknown>) =>
            ipcRenderer.invoke('enadox:config:update', patch)
    },

    diag: () => ipcRenderer.invoke('enadox:diag')
};

contextBridge.exposeInMainWorld('enadox', api);

// Type-side export so the renderer can import { EnadoxApi } from 'enadox-preload-types'.
// The build emits the .d.ts next to this file; renderer tsconfig has a paths alias.
export type EnadoxApi = typeof api;
