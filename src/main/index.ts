/**
 * ENADOX Desktop — Electron main process entry.
 *
 * Owns the Node runtime: spawns child services, creates the BrowserWindow,
 * wires IPC. The renderer is the Jitsi + ENADOX React app; this process has no
 * UI of its own beyond the window chrome.
 */
import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadConfig, installConfigIpc } from './config.js';
import { initSidecar, sidecar } from './sidecar.js';
import { initTalkingPhoto, talkingPhoto } from './talkingPhoto.js';
import { showBackendHealth } from './backendHealth.js';
import { installJitsiIpc } from './jitsiBackend.js';

// Single-instance lock so a second launch focuses the existing window instead
// of starting a parallel app (which would double-spawn the sidecar + talking-photo).
if (!app.requestSingleInstanceLock()) {
    app.quit();
}

const IS_DEV = !app.isPackaged;
const VITE_DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:5173';
const APP_PROTOCOL = 'enadox';

let mainWindow: BrowserWindow | null = null;

/** Create (or focus) the main window. */
function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#0d0710',
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false, // preload needs node modules (fs, child_process) for config load
            webSecurity: true,
            backgroundThrottling: false
        }
    });

    mainWindow.once('ready-to-show', () => mainWindow?.show());

    // External links (http/https) open in the user's real browser. Never navigate
    // the Electron window to a third-party URL.
    mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
        if (/^https?:/i.test(openUrl)) {
            void shell.openExternal(openUrl);
        }
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, navUrl) => {
        const target = new URL(navUrl);
        const self = IS_DEV ? new URL(VITE_DEV_URL) : null;
        const isSelf = self && target.origin === self.origin;
        const isFile = target.protocol === 'file:';
        if (!isSelf && !isFile) {
            event.preventDefault();
            if (/^https?:/i.test(navUrl)) { void shell.openExternal(navUrl); }
        }
    });

    if (IS_DEV) {
        void mainWindow.loadURL(VITE_DEV_URL);
        mainWindow.webContents.openDevTools({ mode: 'right' });
    } else {
        const indexPath = path.join(__dirname, '../renderer/index.html');
        void mainWindow.loadFile(indexPath);
    }
}

/** Register the enadox:// custom scheme used for OAuth redirects (Phase 7). */
function registerAppProtocol(): void {
    if (!app.isDefaultProtocolClient(APP_PROTOCOL)) {
        app.setAsDefaultProtocolClient(APP_PROTOCOL);
    }
}

/** Minimal menu — the renderer's React app will provide its own toolbar. */
function installAppMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: 'File',
            submenu: [{ role: 'quit' }]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }
            ]
        },
        {
            label: 'Debug',
            submenu: [
                {
                    label: 'Jitsi Backend Health',
                    click: () => { void showBackendHealth(); }
                },
                {
                    label: 'Open Logs Folder',
                    click: () => {
                        const dir = path.join(app.getPath('userData'), 'logs');
                        fs.mkdirSync(dir, { recursive: true });
                        void shell.openPath(dir);
                    }
                },
                {
                    label: 'Open Config File',
                    click: () => {
                        const file = path.join(app.getPath('userData'), 'config.json');
                        if (!fs.existsSync(file)) { fs.writeFileSync(file, '{}\n'); }
                        void shell.openPath(file);
                    }
                }
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Core IPC handlers. The sidecar/talkingPhoto handlers are registered inside
 *  their own init functions. See IPC_API.md for the full contract. */
function installCoreIpc(): void {
    ipcMain.handle('enadox:platform', () => process.platform);
    ipcMain.handle('enadox:version', () => app.getVersion());
    ipcMain.handle('enadox:shell:open-external', (_evt, u: string) => {
        if (!/^https?:/i.test(u)) { throw new Error('refused non-http(s) URL'); }
        return shell.openExternal(u);
    });
    ipcMain.handle('enadox:diag', () => ({
        platform: process.platform,
        version: app.getVersion(),
        isDev: IS_DEV,
        userData: app.getPath('userData'),
        execPath: app.getPath('exe'),
        sidecar: sidecar()?.status() ?? { state: 'stopped', pid: null },
        talkingPhoto: talkingPhoto()?.status() ?? { state: 'stopped', pid: null },
        jitsi: { running: false, containers: [] } // Phase 4
    }));
    installConfigIpc();
    installJitsiIpc();
}

/** Boot the Python child processes. Non-fatal if config paths are missing —
 *  the renderer's status bar surfaces the error, user fixes the path in
 *  Debug → Open Config File. */
function bootChildren(): void {
    const cfg = loadConfig();
    try {
        const s = initSidecar({
            pythonVenvPath: cfg.pythonVenvPath,
            sidecarScript: cfg.sidecarScript,
            sidecarPort: cfg.sidecarPort,
            bridges: cfg.bridges,
            phasmPassphrase: cfg.phasmPassphrase
        });
        s.start();
    } catch (e) {
        console.error('[main] sidecar init failed:', (e as Error).message);
    }
    try {
        const t = initTalkingPhoto({
            pythonVenvPath: cfg.talkingPhotoPython,
            talkingPhotoScript: cfg.talkingPhotoScript,
            talkingPhotoPort: cfg.talkingPhotoPort,
            ffmpegPath: cfg.ffmpegPath,
            // Electron renderer lives at file:// (prod) or http://localhost:5173 (dev shell)
            // or http://localhost:8000 (dev Jitsi). Permissive origin for now; tighten later.
            allowOrigin: '*'
        });
        t.start();
    } catch (e) {
        console.error('[main] talking-photo init failed:', (e as Error).message);
    }
}

app.on('before-quit', () => {
    try { sidecar()?.stop(); } catch { /* noop */ }
    try { talkingPhoto()?.stop(); } catch { /* noop */ }
});

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) { mainWindow.restore(); }
        mainWindow.focus();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { app.quit(); }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) { createWindow(); }
});

void app.whenReady().then(() => {
    registerAppProtocol();
    installAppMenu();
    installCoreIpc();
    bootChildren();
    createWindow();
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _keepFsSideEffect(_: typeof fs): void { /* ensure fs is retained even if we only use paths */ }
