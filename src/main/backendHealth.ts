import { dialog } from 'electron';
import { readBackendStatus } from './jitsiBackend.js';

let open = false;

export async function showBackendHealth(): Promise<void> {
    if (open) { return; }
    open = true;
    try {
        let refresh: boolean;
        do {
            const { running, containers, error } = await readBackendStatus();
            const states = containers.map(row => row.name + ' · ' + row.state);
            const result = await dialog.showMessageBox({
                type: running ? 'info' : 'warning',
                title: 'Jitsi backend health',
                message: running ? 'Jitsi backend is running' : 'Jitsi backend is unavailable',
                detail: error || states.join('\n') || 'Docker Compose reported no containers.',
                buttons: ['Close', 'Refresh'],
                defaultId: 0,
                cancelId: 0
            });
            refresh = result.response === 1;
        } while (refresh);
    } finally {
        open = false;
    }
}
