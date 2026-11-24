/**
 * Supervised child-process base for the Python sidecars.
 *
 * Owns a long-running subprocess, keeps a rolling log buffer, emits status
 * changes, and restarts with exponential backoff up to MAX_RESTARTS, then
 * stays in 'crashed' until the user manually hits Restart in the UI.
 */
import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type ServiceState = 'stopped' | 'starting' | 'running' | 'crashed';

export interface ServiceStatus {
    state: ServiceState;
    pid: number | null;
    startedAt: number | null;
    lastExitCode: number | null;
    lastError: string | null;
    port: number;
    restartCount: number;
}

export interface ChildProcOpts {
    name: string;                      // 'sidecar' | 'talking-photo' — used for log channel + file
    command: string;                   // absolute path to the executable (python.exe)
    args: string[];
    cwd?: string;
    env?: Record<string, string>;
    port: number;                      // what port the service listens on (informational)
    logDir: string;                    // where to tee logs
    bufferLines?: number;              // rolling buffer in memory (default 500)
    readyLineRegex?: RegExp;           // fire 'ready' when stdout/stderr matches
    maxRestarts?: number;              // default 3
    baseRestartDelayMs?: number;       // default 1000; exponential 2^n
}

export class SupervisedChild extends EventEmitter {
    private _opts: Required<Omit<ChildProcOpts, 'cwd' | 'env' | 'readyLineRegex'>> & {
        cwd?: string; env?: Record<string, string>; readyLineRegex?: RegExp;
    };
    private _proc: ChildProcess | null = null;
    private _state: ServiceState = 'stopped';
    private _buffer: string[] = [];
    private _logFile: fs.WriteStream | null = null;
    private _restartTimer: NodeJS.Timeout | null = null;
    private _startedAt: number | null = null;
    private _lastExit: number | null = null;
    private _lastError: string | null = null;
    private _restartCount = 0;
    private _wantRunning = false;      // user intent; survives crashes

    constructor(opts: ChildProcOpts) {
        super();
        this._opts = {
            cwd: opts.cwd,
            env: opts.env,
            readyLineRegex: opts.readyLineRegex,
            name: opts.name,
            command: opts.command,
            args: opts.args,
            port: opts.port,
            logDir: opts.logDir,
            bufferLines: opts.bufferLines ?? 500,
            maxRestarts: opts.maxRestarts ?? 3,
            baseRestartDelayMs: opts.baseRestartDelayMs ?? 1000
        };
    }

    status(): ServiceStatus {
        return {
            state: this._state,
            pid: this._proc?.pid ?? null,
            startedAt: this._startedAt,
            lastExitCode: this._lastExit,
            lastError: this._lastError,
            port: this._opts.port,
            restartCount: this._restartCount
        };
    }

    recentLogs(n = 100): string[] { return this._buffer.slice(-n); }

    start(): void {
        this._wantRunning = true;
        this._restartCount = 0;
        this._lastError = null;
        this._spawn();
    }

    stop(): void {
        this._wantRunning = false;
        if (this._restartTimer) { clearTimeout(this._restartTimer); this._restartTimer = null; }
        const p = this._proc;
        this._proc = null;
        if (p) {
            try { p.kill('SIGTERM'); } catch { /* already gone */ }
            // Force-kill after 3s if it hangs
            setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* fine */ } }, 3000);
        }
        this._setState('stopped');
    }

    private _spawn(): void {
        this._setState('starting');
        this._startedAt = Date.now();
        this._lastError = null;

        try {
            fs.mkdirSync(this._opts.logDir, { recursive: true });
            const logPath = path.join(this._opts.logDir, `${this._opts.name}.log`);
            // Tee to a rolling file. Lightweight append; rotation is a Phase 8 cleanup.
            this._logFile?.end();
            this._logFile = fs.createWriteStream(logPath, { flags: 'a' });
            this._logFile.write(`\n--- ${new Date().toISOString()} START ${this._opts.command} ${this._opts.args.join(' ')} ---\n`);
        } catch (e) {
            this._lastError = `log file open failed: ${(e as Error).message}`;
        }

        let proc: ChildProcess;
        try {
            proc = spawn(this._opts.command, this._opts.args, {
                cwd: this._opts.cwd,
                env: { ...process.env, ...(this._opts.env ?? {}) },
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            });
        } catch (e) {
            this._lastError = `spawn failed: ${(e as Error).message}`;
            this._setState('crashed');
            this._scheduleRestartMaybe();
            return;
        }
        this._proc = proc;

        const onLine = (chunk: Buffer) => {
            const text = chunk.toString('utf8');
            for (const raw of text.split(/\r?\n/)) {
                if (!raw) { continue; }
                this._pushLine(raw);
                if (this._state === 'starting' && this._opts.readyLineRegex?.test(raw)) {
                    this._setState('running');
                }
            }
        };
        proc.stdout?.on('data', onLine);
        proc.stderr?.on('data', onLine);

        proc.on('error', err => {
            this._lastError = err.message;
            this._pushLine(`[proc error] ${err.message}`);
        });

        proc.on('exit', (code, signal) => {
            this._lastExit = code ?? -1;
            this._pushLine(`[exit code=${code} signal=${signal}]`);
            try { this._logFile?.end(); } catch { /* fine */ }
            this._logFile = null;
            this._proc = null;
            if (!this._wantRunning) {
                this._setState('stopped');
                return;
            }
            this._setState('crashed');
            this._scheduleRestartMaybe();
        });

        // If we don't have a ready-line regex, consider the service "running" ~500ms after spawn
        // provided it hasn't exited yet. The regex path is more accurate; both are supported.
        if (!this._opts.readyLineRegex) {
            setTimeout(() => {
                if (this._proc === proc && this._state === 'starting') { this._setState('running'); }
            }, 500);
        }
    }

    private _scheduleRestartMaybe(): void {
        if (!this._wantRunning) { return; }
        if (this._restartCount >= this._opts.maxRestarts) {
            this._pushLine(`[supervisor] gave up after ${this._restartCount} restarts`);
            return;
        }
        const delay = this._opts.baseRestartDelayMs * (1 << this._restartCount);
        this._restartCount++;
        this._pushLine(`[supervisor] restart ${this._restartCount}/${this._opts.maxRestarts} in ${delay}ms`);
        this._restartTimer = setTimeout(() => { this._restartTimer = null; this._spawn(); }, delay);
    }

    private _pushLine(line: string): void {
        this._buffer.push(line);
        if (this._buffer.length > this._opts.bufferLines) {
            this._buffer.splice(0, this._buffer.length - this._opts.bufferLines);
        }
        try { this._logFile?.write(line + '\n'); } catch { /* fine */ }
        this.emit('log', line);
    }

    private _setState(s: ServiceState): void {
        if (this._state === s) { return; }
        this._state = s;
        this.emit('status', this.status());
    }
}
