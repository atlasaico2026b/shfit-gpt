---
name: codebase-navigator
description: Find the authoritative owner of a behaviour in ATLAS SHIFT before editing, so changes land in the one correct file and no duplicate implementation is created. Use at the start of any feature, bug fix, or refactor that spans files, when unsure where code belongs, or when a behaviour seems to exist in two places.
---

# Codebase navigator — ATLAS SHIFT

The project follows **one property, one file**. Before writing code, identify the owner using
the ownership table in `AGENTS.md` (authoritative — do not restate or extend it locally), then
edit that file only. Result propagates to every consumer automatically.

## Quick ownership map (verify against AGENTS.md, it wins)

| Need | Owner |
| --- | --- |
| Dashboard, calendar, notices, navigation | `app.js` |
| Operational CRUD, local DB, reports, backup/restore, list toolbars/filters/sorts, Jalali date | `modules.js` |
| Shift engine, templates, assignments, calendar | `design/shift-planner.js` + `.css` |
| Record sheet («مشاهدهٔ پرونده»), single and bulk | `design/record-file.js` + `.css` |
| List print / PDF (A4 landscape) | `design/print-sheet.js` + `design/print.css` |
| DOCX + CSV for the whole app | `design/export-docs.js` |
| Scroll, wheel, touch, overscroll | `design/scroll-routing.js` + `.css` |
| Notices card visuals | `design/notices.css` (+ `openNoticeDialog`) |
| Theme / colours | `design/theme-switch.js` + `design/skins/*.css`, tokens in `design/tokens.css` |
| Offline shell | `sw.js`, `manifest.json` |
| Employee ↔ contact sync | `design/contact-sync.js` |

## Procedure

1. **Grep the behaviour, not the feature name.** Search the user-facing Persian string, the
   data key (`shiftOverrides`, `appData.leaves`), or the export symbol (`window.Atlas*`).
2. **Confirm the owner** by finding the implementation that other files call. If two files
   implement the same property, the AGENTS.md owner is correct and the other copy is a bug —
   report it instead of adding a third.
3. **Check the dependency direction before editing.** `design/*` modules must not import from
   each other's internals; they talk through `window.Atlas*` globals and custom events
   (`atlas-record-saved`, `atlas-open-file`, `atlas-open-files`). `modules.js` may call into
   them; they must not reach into `modules.js` internals (only `window.ATLAS_MODULES` API).
4. **Respect file-size reality.** `modules.js` is ~700 KB; locate with line numbers from Grep
   and edit narrow ranges.
5. **Never add a global listener** in a page file — global scroll/wheel/touch belongs to
   `scroll-routing.js` only.
6. **List the blast radius** in your reply: owning file, consumers, and tests that cover it.

## Stop and report when

- The change needs a new property that has no owner yet — propose the owner and get agreement
  rather than picking one silently.
- The same logic exists in two files (duplicate implementation) — flag it.
- The change targets `dist/` — that is build output; edit the root source instead.
