/**
 * App config loader.
 *
 * Reads packaged defaults from resources/config/default.yaml (dropped by Codex's
 * Phase-3 task) and merges a user override at %APPDATA%\ENADOX\config.yaml.
 * Returns a typed, validated AppConfig; missing keys fall back to defaults.
 * If default.yaml hasn't landed yet (Phase 3 blocked task), we fall back to
 * the hardcoded dev defaults below so the app still boots.
 */
import { app, ipcMain } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as yaml from 'js-yaml';

export interface AppConfig {
    pythonVenvPath: string;
    sidecarScript: string;
    sidecarPort: number;
    talkingPhotoPython: string;
    talkingPhotoScript: string;
    talkingPhotoPort: number;
    dockerJitsiDir: string;
    jitsiUrl: string;
    bridges: number;
    ffmpegPath: string | null;
    phasmPassphrase?: string;
}

const DEFAULT_CONFIG: AppConfig = {
    // Hardcoded dev defaults — match the browser build's working setup. User can override
    // any of these in %APPDATA%\ENADOX\config.yaml; see Debug menu → Open Config File.
    pythonVenvPath: 'C:/Users/Arvin/OneDrive/Desktop/CovertDefensesLLC/ShadowMeet/ShadowFive/.venv-ov/Scripts/python.exe',
    sidecarScript: 'C:/Users/Arvin/OneDrive/Desktop/CovertDefensesLLC/enadox-video-embed/src/enadox_service.py',
    sidecarPort: 8011,
    talkingPhotoPython: 'C:/Users/Arvin/OneDrive/Desktop/CovertDefensesLLC/enadox-video-embed/ext/vcav/talking-photo/.venv/Scripts/python.exe',
    talkingPhotoScript: 'C:/Users/Arvin/OneDrive/Desktop/CovertDefensesLLC/enadox-video-embed/ext/vcav/talking-photo/service.py',
    talkingPhotoPort: 8010,
    dockerJitsiDir: 'C:/Users/Arvin/docker-jitsi-meet',
    jitsiUrl: 'http://localhost:8000',
    bridges: 3,
    ffmpegPath: 'C:/Users/Arvin/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.1-full_build/bin'
};

function resourcesDefault(): Partial<AppConfig> {
    const candidate = app.isPackaged
        ? path.join(process.resourcesPath, 'config', 'default.yaml')
        : path.join(__dirname, '../../resources/config/default.yaml');
    if (!fs.existsSync(candidate)) { return {}; }
    try {
        const parsed = yaml.load(fs.readFileSync(candidate, 'utf8')) as Partial<AppConfig> | null;
        return parsed ?? {};
    } catch (e) {
        console.error('[config] default.yaml parse failed:', e);
        return {};
    }
}

function userOverridePath(): string {
    return path.join(app.getPath('userData'), 'config.yaml');
}

function userOverride(): Partial<AppConfig> {
    const p = userOverridePath();
    if (!fs.existsSync(p)) { return {}; }
    try {
        const parsed = yaml.load(fs.readFileSync(p, 'utf8')) as Partial<AppConfig> | null;
        return parsed ?? {};
    } catch (e) {
        console.error('[config] user override parse failed:', e);
        return {};
    }
}

let _cached: AppConfig | null = null;

export function loadConfig(forceReload = false): AppConfig {
    if (_cached && !forceReload) { return _cached; }
    _cached = { ...DEFAULT_CONFIG, ...resourcesDefault(), ...userOverride() };
    return _cached;
}

export function saveUserConfig(patch: Partial<AppConfig>): AppConfig {
    const next = { ...loadConfig(), ...patch };
    const p = userOverridePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // Write YAML. Only the diff from DEFAULT_CONFIG stays in the file (cleaner) —
    // but for now we write the merged object. Keeping this simple.
    fs.writeFileSync(p, yaml.dump(next), 'utf8');
    _cached = next;
    return next;
}

export function installConfigIpc(): void {
    ipcMain.handle('enadox:config:get', () => loadConfig());
    ipcMain.handle('enadox:config:update', (_evt, patch: Partial<AppConfig>) => saveUserConfig(patch));
}
