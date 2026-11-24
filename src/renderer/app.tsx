/**
 * ENADOX Desktop — renderer root.
 *
 * Phase 1 placeholder. Phase 2 will replace this with the Jitsi + ENADOX React
 * app mounted via the Vite config described in VENDORING_STRATEGY.md.
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

// Shape mirrors src/preload/index.ts. We don't import the preload's type
// directly because preload compiles to a separate bundle; the window global is
// the contract. See IPC_API.md.
declare global {
    interface Window {
        enadox: {
            platform: NodeJS.Platform;
            getVersion: () => Promise<string>;
            shell: { openExternal: (url: string) => Promise<void> };
            sidecar: {
                status: () => Promise<unknown>;
                start: () => Promise<void>;
                stop: () => Promise<void>;
                onLog: (cb: (line: string) => void) => () => void;
                onStatus: (cb: (s: unknown) => void) => () => void;
            };
            talkingPhoto: typeof window.enadox.sidecar;
            jitsiBackend: {
                status: () => Promise<{ running: boolean; containers: string[] }>;
                start: () => Promise<void>;
            };
            config: {
                get: () => Promise<unknown>;
                update: (patch: Record<string, unknown>) => Promise<unknown>;
            };
            diag: () => Promise<unknown>;
        };
    }
}

function App(): React.ReactElement {
    const [version, setVersion] = useState<string>('loading...');
    const [diag, setDiag] = useState<unknown>(null);

    useEffect(() => {
        void window.enadox.getVersion().then(setVersion);
        void window.enadox.diag().then(setDiag);
    }, []);

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%',
            padding: 24, gap: 16
        }}>
            <h1 style={{ margin: 0, fontWeight: 700, letterSpacing: '0.04em' }}>
                ENADOX <span style={{ color: '#e91e63', fontSize: '0.5em' }}>desktop</span>
            </h1>
            <div style={{ color: '#a0a0a0', fontSize: 13 }}>
                v{version} · {window.enadox.platform} ·
                <span style={{ color: '#e91e63', marginLeft: 6 }}>Phase 1 shell</span>
            </div>
            <div style={{
                marginTop: 24, padding: 16, borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontFamily: 'ui-monospace, monospace', fontSize: 12,
                whiteSpace: 'pre-wrap', color: '#c0c0c0', flex: 1, overflow: 'auto'
            }}>
                {diag ? JSON.stringify(diag, null, 2) : '…'}
            </div>
            <div style={{ color: '#505050', fontSize: 11 }}>
                Next: Phase 2 mounts the Jitsi + ENADOX renderer here. Phase 3 spawns the
                Python sidecar + talking-photo. See <code>AGENTS.md</code>.
            </div>
        </div>
    );
}

const rootEl = document.getElementById('root');
if (rootEl) { createRoot(rootEl).render(<App />); }
