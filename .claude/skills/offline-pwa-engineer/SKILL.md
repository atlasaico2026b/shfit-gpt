---
name: offline-pwa-engineer
description: Keep ATLAS SHIFT fully offline — service worker caching, cache version bumps, manifest and installation, and safe shell updates. Use when adding/removing/renaming a shipped file, changing sw.js or manifest.json, adding a runtime fetch, changing the preview build list, or when the app must keep working with no network.
---

# Offline PWA engineer — ATLAS SHIFT

The app must load and work with the network off, always. No CDN, no external font or icon
fetch, no server call at runtime.

## Shell facts (verify in the files, do not trust memory)

- `sw.js`: `CACHE_NAME = 'atlas-shift-vNNN-<slug>'`; `APP_FILES` is the explicit precache list.
  Strategy is cache-first; `install` is atomic (`cache.addAll`) with a per-file fallback;
  `activate` deletes older `atlas-shift-*` caches and posts `atlas-shell-updated` to windows.
- `manifest.json`: `lang: fa-IR`, `dir: rtl`, standalone, icons under `design/icons/`.
- Shipped set = preview build files in `shogo.preview.json` (root HTML/JS + all of `design/`).

## Rules

1. **New shipped file ⇒ add it to `APP_FILES`** in the same commit. A file the app imports but
   the worker never precaches breaks the app on first offline load.
2. **Every release bumps `CACHE_NAME`.** Bump by one version, keep the `-slug` meaningful. A
   missing bump means users keep the old shell.
3. **Keep the install atomic and non-fatal.** Preserve `addAll` plus the per-file fallback;
   never let one 404 brick an existing install.
4. **Cache-first is a promise.** Any new `fetch` handler must fall back to cache/offline
   response before erroring, and must never require the network to render.
5. **Do not break activation.** Keep the old-cache cleanup and the `atlas-shell-updated`
   message; first install must stay silent.
6. **Do not edit `dist/`.** It is gitignored build output — change root sources and rebuild.
7. **No runtime dependency additions.** No remote scripts, styles, images, or service calls.

## Checklist for a shell change

- [ ] File listed in `APP_FILES` (if newly shipped)
- [ ] `CACHE_NAME` bumped
- [ ] Same files in `shogo.preview.json` build where applicable
- [ ] Manifest still valid; icons present at referenced paths
- [ ] `node tests/brand-logo.cjs` (assets) if icons/logos changed
- [ ] Preview loads with DevTools offline mode and console is clean
- [ ] Reload twice: update notice appears once, old cache is gone
