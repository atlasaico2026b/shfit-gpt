# ATLAS SHIFT (shfit-gpt)

Persian (RTL) offline-first PWA for HR operations: employees, 12-hour day/night shifts,
missions, leave, vehicles, gas detectors, notes/actions, reports, settings.

## Stack
- No framework, no bundler. Plain HTML + CSS + ES modules served statically.
- Preview build (from `shogo.preview.json`): copies `index.html app.js modules.js
  settings-tabs.js menu-manager.js visual-engine.js theme-two.js manifest.json sw.js
  icon.svg` plus `design/` into `dist/`.
- Data lives in IndexedDB with a localStorage fallback; no backend, everything works offline.

## Where things are
- `index.html` — single entry point: markup + all modal/panel shells.
- `design/tokens.css` — the only source of colour tokens. `design/styles.css` = shared styles.
- `app.js` — dashboard, calendar, notifications, settings, internal navigation.
- `modules.js` — operational modules (CRUD), local DB, reports, backup/restore/export.
- `menu-manager.js`, `settings-tabs.js`, `theme-two.js`, `visual-engine.js` — menu, settings tabs, theming.
- `sw.js` + `manifest.json` — offline cache and installability.
- `ATLAS_SHIFT_REQUIREMENTS.md` — the authoritative requirements/spec. Read it before large features.
- `README.md` — current status in Persian; keep it updated when behaviour changes.

## Rules
- UI text is Persian and RTL. Never introduce LTR-only layouts or English labels in the app.
- Never hardcode colours or font sizes outside `design/tokens.css`.
- Keep the app fully offline: no runtime CDN, no external font/icon fetches, no server calls.
- To change an existing build artefact, edit the source file at the repo root — do not edit `dist/`.
- Low-use panels open as popover/sheet/modal and collapse again; avoid long vertical forms.
- Verify a change by loading the preview and checking the console is clean, not just by inspecting the diff.
