# ATLAS SHIFT — Project Snapshot
Last consolidated: 2026-10-18

## Source of truth
- Active project: **ATLAS SHIFT**
- Active GitHub repository: **atlasaico2026b/shfit-gpt**
- Main branch: `main`
- Published preview: https://atlasaico2026b.github.io/shfit-gpt/
- Do not switch this project to `Atlas-X`. Atlas-X is not the active project in this workstream.
- The user's requirements and decisions are authoritative. The assistant is the technical implementer, not a product co-owner.
- Do not invent or add app sections, dashboard cards, fields, features, workflows, or visual choices that the user has not requested or approved.
- Do not re-ask questions already answered. Ask only one direct question at a time when a decision is genuinely needed.
- Before coding, inspect the current repository and this snapshot to avoid repeating work.

## Main navigation — confirmed
The app must have exactly these **9 main menus**, in this order:
1. داشبورد
2. کارکنان
3. مأموریت‌ها
4. مرخصی‌ها
5. خودروها
6. گازسنج‌ها
7. یادداشت‌ها
8. گزارشات
9. تنظیمات

These replace the earlier prototype's main navigation labels. Do not keep “تقویم شمسی” or “برنامه کاری” as separate main menus; calendar/scheduling behavior belongs within the relevant approved menu(s), to be decided from the user's requirements. Do not change this list or order unless the user explicitly asks.

## Product goal
A private/local operations app named **ATLAS SHIFT** for managing safety and firefighting personnel, shifts, leave, work assignments, missions, and related vehicles/equipment. It should answer the day-to-day question: who is where, what are they doing, and which personnel/vehicles are assigned to a mission or location; it should also support monthly reporting on who went where.

## User-confirmed requirements gathered in prior conversations
- Persian (Farsi), right-to-left interface and Solar Hijri calendar with weekday display.
- Local/offline operation is a priority. Data should remain on the user's device; backup and restore must be available. Do not imply cloud sync or multi-user sync exists unless separately designed and approved.
- Desired visual direction: attractive translucent/glass/blurred floating interface with a subtle futuristic/space feel, while remaining straightforward to operate. The user wants to be able to adjust color combinations by section in settings.
- Keep navigation and data entry simple; avoid long, scroll-heavy forms and unnecessary features.
- Every user-approved data section and its items should be addable, editable, and removable through the app UI. This requirement is not permission to invent new sections.
- Filters should include an “All” choice where applicable.
- Main reporting priority: daily personnel status/location (including missions and leave), vehicle location/assignment, and monthly “who went where” statistics. Reports/filters, printing/export, backup and restore are required. Discuss exact report layouts before inventing them.
- Relevant date ranges: day, 3 days, week, 10 days, month, 6 months, year; dashboard range presets previously mentioned include today, yesterday, week, month, 3 months, 6 months and custom. Do not add dashboard cards without approval.
- Work context includes shift workers on 12-hour shifts, permanent day workers, leave, missions to other cities, and assignments that can change from shift to day work. Workplaces/stations mentioned include Mahshahr, Abadan, Ahvaz, Andimeshk and Tang-e Fanni; route missions may have origin, destination, and distance in km.
- Mission notes/work types mentioned by the user include welding supervision; inspection of branches/leaks and soil/water pollution; visits for extinguishers, gas detectors, breathing air and cylinders for charging/repair; and station telecom visits.
- Personnel data previously requested: name and surname, mobile, job title, employment type, base/system workplace versus current assigned workplace, and status (shift / working / leave); individual or bulk editing; reports by city/workplace/employment type.
- Vehicle data previously requested: company and police plates, name/model, status (healthy / in service / out of service / under repair), faults and resolution status, equipment list, current city/place/point and occupants; maintenance oil-change km, fuel km and related previous/next dates.
- Equipment/gas-detector data previously requested: serial/code, supported gases (CO, O2, LEL, H2S), status/location, calibration start/end and remaining days. Linked records should stay consistent.

## Current repository implementation (not the final approved specification)
Files seen on `main`: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.json`, `icon.svg`, `README.md`, and `.github/workflows/deploy-pages.yml`.
The current prototype includes navigation for overview/dashboard, Solar Hijri calendar, work schedule, personnel and settings, plus local JSON backup/restore, configurable activity types, custom sections/records, and browser local storage.
Important: the prototype contains implementation choices and fields/cards that were added during the first build without sufficient user approval. Treat them as provisional, not as accepted requirements. Reconcile the screens, cards, fields, and workflows against the user's specification before redesigning or expanding them. The current navigation must be brought into alignment with the nine confirmed menus above.

## Current technical state / known issue
- Repository is public and the connected GitHub tool currently reports pull/push/admin permissions for `atlasaico2026b/shfit-gpt`.
- GitHub Pages deployment configuration exists.
- The user reported that the published page appeared but clicking controls did nothing.
- Fix attempts and cache-version refresh commits were pushed on 2026-10-18, including:
  - `61961c624973d83ed02825795ca76167067bac68` — startup error fix
  - `adffa5071dd66ce735ba35af62031f2835c5c280` — refresh offline cache after startup fix
  - `ca43a8894c1664cd6a79b85dd42544798fc74452` — loading diagnostics and asset URL refresh
  - `5297f5511282eb28035e2e1b13097025435fd527` — refresh offline asset cache
- The code was inspected for JavaScript syntax; Solar Hijri date conversion was also tested. This is not a full browser interaction test.
- The user has **not yet confirmed** whether clicking controls works after the latest deployment. Do not claim the issue is fixed until verified.

## Open decision and next work
- The earlier unanswered question is: which device(s) will run the final app in actual use (Windows PC, Android phone, both, or another target)? Do not ask again until the conversation is at that point; do not assume the answer.
- Continue from the step-by-step product-specification phase. The nine-menu navigation is now confirmed. Continue resolving requirements one question at a time before changing the UI or adding capabilities.
- After requirements are confirmed, compare the current implementation against the agreed spec, list mismatches for discussion, and only then implement approved changes.
- Avoid repeating repository setup, GitHub connection troubleshooting, or deployment setup unless a fresh check shows they are needed.
