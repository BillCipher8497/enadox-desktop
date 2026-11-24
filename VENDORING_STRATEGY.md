# Vendoring strategy for the Jitsi + ENADOX source

Decision for the Phase 2 task "vendor the whole jitsi-meet source or embed its
built bundle" in AGENTS.md. Writing it here so Codex doesn't need to rediscover
it when writing docs.

## Decision: in-place sibling, not copy

Reference the existing fork at
`..\enadox-video-embed\ext\vcav\jitsi-meet\` from this repo's Vite config
instead of copying it in. Rationale:

- **No duplicated source.** The fork lives on branch `feat/talking-photo-cover`
  with its own git history. Copying it in would fork it again; duplicating a
  ~1M-line React codebase is a maintenance disaster.
- **Iteration stays single-tree.** When we edit `TalkingPhotoVideoEffect.ts`
  during a bug hunt, one edit, one commit, one place to look.
- **The fork is already set up** — all our ENADOX code, the lib-jitsi-meet
  patches, the steganography feature directory.
- **Electron's vite root can live anywhere.** `vite.config.ts` sets
  `root: '../enadox-video-embed/ext/vcav/jitsi-meet'` (adjusted path), lists
  `resolve.alias` entries, and Vite builds from there. The Electron app's
  `index.html` references the fork's entry.

## What this repo (`enadox-desktop`) contains

Thin layer only:

- Electron main process + preload + IPC
- Vite config that builds the renderer from the sibling fork
- A small `enadox-desktop/`-relative `index.html` that imports the Jitsi app
  and layers Electron-specific overrides (e.g. a `window.enadox` IPC API)
- Child-process lifecycle for the Python sidecar and talking-photo service
- Installer / packaging
- The AGENTS.md handoff + status log + strategy docs

NOT in this repo: the Jitsi-meet source, the Python sidecar sources, the
Rust phasm bridge. Those stay where they are, referenced.

## Build-time path resolution

`vite.config.ts` in this repo will look roughly like:

```ts
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const JITSI = path.resolve(__dirname, '../enadox-video-embed/ext/vcav/jitsi-meet');

export default defineConfig({
    root: JITSI,
    plugins: [react()],
    resolve: {
        alias: {
            // Vendor lib-jitsi-meet source here rather than using the hand-patched
            // libs/lib-jitsi-meet.min.js. Points at the fork's node_modules copy
            // which we'll have replaced with a source checkout in a later task.
            'lib-jitsi-meet': path.join(JITSI, 'node_modules/lib-jitsi-meet'),
        }
    },
    build: {
        outDir: path.resolve(__dirname, 'dist/renderer'),
        emptyOutDir: true,
        rollupOptions: {
            input: path.resolve(__dirname, 'src/renderer/index.html')
        }
    },
    // Electron-specific: base must be ./ for file:// loads
    base: './',
    server: { port: 5173, strictPort: true }
});
```

`src/renderer/index.html` in this repo imports the Jitsi app module and the
Electron overlays. We sidestep `webpack.config.js` entirely — Vite handles
the bundling.

## What we DON'T port from the fork's webpack.config.js

All of these were browser-dev-server workarounds. None applies to Electron:

- `enadox-force-p2p-config` config.js middleware — in Electron we deliver a
  config object directly via the preload API, no scheme-rewrite dance.
- `enadox-neutralize-pwa-worker` — no service worker to neutralize.
- Webpack dev-server HPM proxy — no proxy; Electron speaks directly to
  `localhost:8000` (Docker) and `127.0.0.1:8011` (sidecar).
- The `/talkingphoto` route mangling fix — the talking-photo WS is a plain
  localhost socket; no proxy.
- SSL / scheme coercion — Electron loads `app://` or `file://`; loopback
  services (`ws://localhost:*`) are trustworthy by definition.

## What we DO carry over from our fork

- `react/features/steganography/*` — the whole feature directory
- `react/features/toolbox/components/web/EnadoxButton.tsx`
- `react/features/filmstrip/components/web/DedoxButton.tsx`
- The `forceH264` + packetization-mode logic (still useful; cleaner now
  because we can configure Jitsi from a single place)
- The `_senderActive` + worker enable/disable pattern — exactly as-is
- The persistent-VP9 refactor is in Python, lives in the sidecar, no port
  needed

## lib-jitsi-meet source vs min.js

The fork currently depends on `libs/lib-jitsi-meet.min.js` which we hand-patched
in two places (insertable-streams gate + JVB forced-reload suppression). Phase 2
task: switch to a source checkout of `lib-jitsi-meet` and apply the equivalent
changes at source level instead of hand-patching the minified file.

Source lives at `github.com/jitsi/lib-jitsi-meet`. Clone as a sibling at
`..\enadox-video-embed\ext\vcav\lib-jitsi-meet\`, branch off the version the
fork currently uses, apply the two gates in readable form, build, point the
Vite alias at that build output.

Two gates to apply at source level:

1. `JitsiConference._onIceConnectionFailed` — the `else if (this.jvbJingleSession === e)`
   branch emits CONFERENCE_FAILED on JVB ICE death, which triggers a full conference
   reload. We no-op it for the 2-peer local case. The min.js patch replaced the whole
   block with a single `fm.warn("[ENADOX] JVB ICE failure suppressed …")`.

2. The three `enableInsertableStreams` sites. In the min.js we changed them from
   `enableInsertableStreams: !0` back to the original gated form plus
   `|| window.ENADOX_VIDEO_ACTIVE`. At source level the gate is the original expression;
   we add `|| (typeof window !== 'undefined' && window.ENADOX_VIDEO_ACTIVE === true)`.

## Open questions for later

- Do we want to stop depending on docker-jitsi-meet and run prosody+jicofo
  natively in Electron? Probably not; docker is fine. Deferred.
- Do we embed a Node build of the phasm Rust bridge to kill WSL? Deferred
  until it bites — WSL works today, and `phasm-live-bridge` can be cross-
  compiled for Windows later.

## Status

Not started. Picks up as the first Phase 2 task once Phase 0 lands and
Phase 1 is in a running Electron shell. Owned by Claude.
