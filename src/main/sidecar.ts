/**
 * Sidecar manager — spawns the ENADOX Python video sidecar on :8011.
 *
 * Config paths come from AppConfig (resources/config/default.yaml + user
 * override at %APPDATA%\ENADOX\config.yaml). Hard-fails loudly if the
 * Python executable or sidecar script can't be found — never runs with
 * a guessed path.
 */
import { app, ipcMain, BrowserWindow } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { SupervisedChild, ServiceStatus } from './childProc.js';

export interface SidecarConfig {
    pythonVenvPath: string;      // '.../ShadowFive/.venv-ov/Scripts/python.exe'
    sidecarScript: string;       // '.../enadox-video-embed/src/enadox_service.py'
    sidecarPort: number;         // 8011
    bridges: number;             // ENADOX_BRIDGES
    phasmPassphrase?: string;    // ENADOX_PHASM_PASS
    pythonPath?: string;         // PYTHONPATH addition (defaults to <script-dir>)
}

let child: SupervisedChild | null = null;

export function initSidecar(cfg: SidecarConfig): SupervisedChild {
    if (!fs.existsSync(cfg.pythonVenvPath)) {
        throw new Error(`Python not found at ${cfg.pythonVenvPath}`);
    }
    if (!fs.existsSync(cfg.sidecarScript)) {
        throw new Error(`Sidecar script not found at ${cfg.sidecarScript}`);
    }

    const logDir = path.join(app.getPath('userData'), 'logs');
    const env: Record<string, string> = {
        PYTHONPATH: cfg.pythonPath || path.dirname(cfg.sidecarScript),
        ENADOX_BRIDGES: String(cfg.bridges)
    };
    if (cfg.phasmPassphrase) { env.ENADOX_PHASM_PASS = cfg.phasmPassphrase; }

    child = new SupervisedChild({
        name: 'sidecar',
        command: cfg.pythonVenvPath,
        args: [ cfg.sidecarScript ],
        env,
        port: cfg.sidecarPort,
        logDir,
        // The sidecar logs `ENADOX video sidecar starting on :8011` on the first line of stdout
        // (see enadox_service.py). That's our readiness signal.
        readyLineRegex: /ENADOX video sidecar starting on :\d+/
    });

    child.on('log', line => broadcast('enadox:sidecar:log', line));
    child.on('status', (s: ServiceStatus) => broadcast('enadox:sidecar:status-change', s));

    registerIpc(child);
    return child;
}

function registerIpc(c: SupervisedChild): void {
    ipcMain.handle('enadox:sidecar:status', () => c.status());
    ipcMain.handle('enadox:sidecar:start', () => { c.start(); return c.status(); });
    ipcMain.handle('enadox:sidecar:stop', () => { c.stop(); return c.status(); });
    ipcMain.handle('enadox:sidecar:recent-logs', (_evt, n?: number) => c.recentLogs(n ?? 100));
}

function broadcast(channel: string, payload: unknown): void {
    for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) { w.webContents.send(channel, payload); }
    }
}

export function sidecar(): SupervisedChild | null { return child; }
