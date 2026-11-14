---
name: token-saver
description: Spend fewer tokens on ATLAS SHIFT work without losing accuracy — locate before reading, read narrow line ranges (modules.js is ~700 KB), batch independent tool calls, and summarize output instead of dumping it. Use for long or multi-file tasks, repeated debugging loops, or when the user asks to save context, work faster, or stop re-reading the same files.
---

# Token saver — ATLAS SHIFT

Goal: less context spent for the same correctness. Never trade a required verification
(tests, console check) for a smaller bill.

## Workflow

1. **Locate before reading.** `Glob`/`Grep` with a narrow pattern, then read only the match
   range (`sed -n 'A,Bp'`, or Read with `offset`/`limit`). Never open `modules.js` whole —
   it is ~10k lines.
2. **One targeted search beats many exploratory ones.** Run independent reads/searches in a
   single message so they execute in parallel.
3. **Reuse established facts.** Do not re-read a file you just edited to confirm; `Edit`/`Write`
   fail loudly when the change does not apply. Do not re-derive decisions the user already made.
4. **Ask for the shape of the output you need:** `grep -c`, `grep -o`, `head -n`, `wc -l`,
   `ls` instead of `find` dumps, `git diff --stat` before `git diff`.
5. **Never let a command hang.** Pass an explicit `timeout` for anything that can block
   (test suites, servers) or run it in the background. Do not poll a background task's output
   while waiting — you are re-invoked when it finishes.
6. **Report the result, not the source.** In replies, show the minimal diff, the failing
   assertion, and the command you ran. Quote errors verbatim; never summarize an error away.

## Do not trim these

- The console-clean preview check or the relevant `node tests/*.cjs` runs.
- Reading `AGENTS.md` and `ATLAS_SHIFT_REQUIREMENTS.md` before a large feature.
- Reading the actual owning file before editing it (ownership is not guessable).

## Cheap habits that pay off here

- `git status --short` first; it shows the real blast radius.
- Prefer `Grep output_mode: "count"` to list-shaped output, switches, and dead branches.
- For the design modules, read the header comment plus the `window.Atlas*` export block first;
  that usually tells you the whole public API in ~40 lines.
