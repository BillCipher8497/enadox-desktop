import { useEffect, useState } from 'react';

type Service = Window['enadox']['sidecar'];

function stateLabel(status: unknown): string {
    if (status && typeof status === 'object' && 'state' in status &&
        typeof status.state === 'string') {
        return status.state;
    }
    return 'unavailable';
}

function ServiceDetails({ label, service }: { label: string; service: Service }) {
    const [state, setState] = useState('checking');
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        let acceptSnapshot = true;
        const offStatus = service.onStatus(value => {
            acceptSnapshot = false;
            setState(stateLabel(value));
        });
        const offLog = service.onLog(line => setLogs(lines => [...lines.slice(-99), line]));
        service.status().then(value => {
            if (acceptSnapshot) { setState(stateLabel(value)); }
        }).catch(() => {
            if (acceptSnapshot) { setState('unavailable'); }
        });
        return () => {
            acceptSnapshot = false;
            offStatus();
            offLog();
        };
    }, [service]);

    return (
        <details>
            <summary style={{ cursor: 'pointer' }}>{label} · {state}</summary>
            <pre style={{ maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {logs.join('\n') || 'Waiting for log output…'}
            </pre>
        </details>
    );
}

export function ServiceStatusBar() {
    return (
        <footer aria-label="Service status and logs" style={{
            display: 'flex', gap: 24, fontSize: 13, borderTop: '1px solid #403642',
            paddingTop: 8, flexWrap: 'wrap'
        }}>
            <ServiceDetails label="Video sidecar" service={window.enadox.sidecar} />
            <ServiceDetails label="Talking photo" service={window.enadox.talkingPhoto} />
        </footer>
    );
}
