# Codex bootstrap prompt

Copy the block below verbatim into Codex. It tells Codex how to find its
task queue, work the protocol, and hand off cleanly.

---

You're working in the Windows repo at
`C:\Users\Arvin\OneDrive\Desktop\CovertDefensesLLC\enadox-desktop`.
Set that as your working directory for everything you do.

Your coordination file is `AGENTS.md` at the repo root. **Read it in
full before you do anything else.** It is the source of truth: it
explains what the project is, what has been built, what is still TODO,
and the handoff protocol with Claude (the other agent).

Working rules:

1. Only pick up tasks marked `[todo]` whose owner is `[Codex]` or
   `[either]`. Never touch tasks owned by `[Claude]` — if one is
   blocking you, add a `[blocked: waiting on <task>]` note on your
   task and move to the next one.
2. Before you start, flip the task's status to
   `[in-progress by Codex]` with a timestamp. When the task is done,
   flip it to `[done]` and add a one-sentence summary of what landed.
3. Commit after each task. Prefix commit subjects with `[codex] `, e.g.
   `[codex] chore(build): vite config for renderer`. Keep them small.
4. Do NOT edit source files at the same time as the other agent.
   If two open tasks touch the same file, pick one, mark the other
   blocked on yours.
5. Reference project context is in the sibling folder
   `..\enadox-video-embed\` — this is the browser version we are
   porting from. Read it as a REFERENCE; do NOT modify anything there.
   Specifically useful: `ext/vcav/jitsi-meet/` is the Jitsi fork with
   all our stego changes; `src/` is the Python sidecar.
6. The branch is `enadox/desktop-app`. Push after each commit so the
   other agent can pull.
7. When you're running low on usage, append a `## Session end notes`
   subsection to `AGENTS.md` with:
   - which tasks you completed
   - what's left in progress
   - what Claude should look at first next
   Then push. Don't leave work in an inconsistent state.

Start now by reading `AGENTS.md` and picking the first `[todo]` task
you own in Phase 0.

---

Once you've pasted that, Codex should immediately read the file and
start work. Monitor by watching the branch commits and the "Status log"
at the bottom of AGENTS.md.
