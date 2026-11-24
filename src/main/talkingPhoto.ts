/**
 * Talking-photo manager — spawns the cover-generation service on :8010.
 *
 * Same lifecycle shape as the sidecar. Adds ffmpeg to PATH on launch
 * (talking-photo shells out to ffmpeg for audio decode).
 */
import { app, ipcMain, BrowserWindow } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { SupervisedChild, ServiceStatus } from './childProc.js';

export interface TalkingPhotoConfig {
    pythonVenvPath: string;      // talking-photo's OWN venv (separate from sidecar's)
    talkingPhotoScript: string;  // '.../ext/vcav/talking-photo/service.py'
    talkingPhotoPort: number;    // 8010
    ffmpegPath?: string | null;  // folder that holds ffmpeg.exe; prepended to PATH
    allowOrigin?: string;        // --allow-origin for CORS (dev)
}

let child: SupervisedChild | null = null;

export function initTalkingPhoto(cfg: TalkingPhotoConfig): SupervisedChild {
    if (!fs.existsSync(cfg.pythonVenvPath)) {
        throw new Error(`Talking-photo Python not found at ${cfg.pythonVenvPath}`);
    }
    if (!fs.existsSync(cfg.talkingPhotoScript)) {
        throw new Error(`Talking-photo script not found at ${cfg.talkingPhotoScript}`);
    }

    const logDir = path.join(app.getPath('userData'), 'logs');
    const env: Record<string, string> = {};
    if (cfg.ffmpegPath) {
        const existing = process.env.PATH ?? '';
        env.PATH = `${cfg.ffmpegPath}${path.delimiter}${existing}`;
    }

    const args = [ cfg.talkingPhotoScript, '--port', String(cfg.talkingPhotoPort) ];
    if (cfg.allowOrigin) { args.push('--allow-origin', cfg.allowOrigin); }

    child = new SupervisedChild({
        name: 'talking-photo',
        command: cfg.pythonVenvPath,
        args,
        cwd: path.dirname(cfg.talkingPhotoScript),
        env,
        port: cfg.talkingPhotoPort,
        logDir,
        readyLineRegex: /Talking-photo models ready/
    });

    child.on('log', line => broadcast('enadox:talkingPhoto:log', line));
    child.on('status', (s: ServiceStatus) => broadcast('enadox:talkingPhoto:status-change', s));

    registerIpc(child);
    return child;
}

function registerIpc(c: SupervisedChild): void {
    ipcMain.handle('enadox:talkingPhoto:status', () => c.status());
    ipcMain.handle('enadox:talkingPhoto:start', () => { c.start(); return c.status(); });
    ipcMain.handle('enadox:talkingPhoto:stop', () => { c.stop(); return c.status(); });
    ipcMain.handle('enadox:talkingPhoto:recent-logs',
        (_evt, n?: number) => c.recentLogs(n ?? 100));
}

function broadcast(channel: string, payload: unknown): void {
    for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) { w.webContents.send(channel, payload); }
    }
}

export function talkingPhoto(): SupervisedChild | null { return child; }
