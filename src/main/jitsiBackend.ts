/**
 * docker-jitsi-meet backend health check.
 *
 * We DON'T try to install or control Docker Desktop. We only inspect:
 * are the containers from the compose file at `dockerJitsiDir` running?
 * If not, the renderer shows a clear prompt and either (a) the user
 * starts Docker + docker compose themselves, or (b) hits the Start
 * button which runs `docker compose up -d` for them.
 */
import { ipcMain } from 'electron';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from './config.js';

const pexec = promisify(exec);

interface JitsiStatus {
    running: boolean;
    containers: { name: string; state: string }[];
    error: string | null;
}

async function dockerCompose(cmd: string): Promise<{ stdout: string; stderr: string }> {
    const cfg = loadConfig();
    return pexec(`docker compose ${cmd}`, {
        cwd: cfg.dockerJitsiDir,
        windowsHide: true,
        timeout: 15000
    });
}

export async function readBackendStatus(): Promise<JitsiStatus> {
    try {
        const { stdout } = await dockerCompose('ps --format json');
        const lines = stdout.split(/\r?\n/).filter(Boolean);
        const containers: { name: string; state: string }[] = [];
        for (const line of lines) {
            try {
                const row = JSON.parse(line);
                containers.push({ name: row.Service || row.Name || '', state: row.State || '' });
            } catch { /* skip unparseable line */ }
        }
        const expected = ['web', 'prosody', 'jicofo', 'jvb'];
        const foundRunning = expected.filter(n =>
            containers.some(c => c.name === n && c.state === 'running'));
        return {
            running: foundRunning.length === expected.length,
            containers,
            error: null
        };
    } catch (e) {
        return { running: false, containers: [], error: (e as Error).message };
    }
}

async function start(): Promise<JitsiStatus> {
    try {
        await dockerCompose('up -d');
    } catch (e) {
        return { running: false, containers: [], error: (e as Error).message };
    }
    return readBackendStatus();
}

export function installJitsiIpc(): void {
    ipcMain.handle('enadox:jitsi:status', () => readBackendStatus());
    ipcMain.handle('enadox:jitsi:start', () => start());
}
