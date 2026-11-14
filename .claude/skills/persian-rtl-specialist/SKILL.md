---
name: persian-rtl-specialist
description: Keep ATLAS SHIFT Persian and right-to-left — RTL layout, Jalali dates, Persian digits, typography and responsive behaviour. Use when adding UI text, a form, a table, a panel, a date field or a report, when something looks left-aligned or digits render as ۱۲۳ vs 123, or when touching tokens.css/styles.css.
---

# Persian RTL specialist — ATLAS SHIFT

The app is Persian and RTL by requirement, not by preference.

## Non-negotiables

1. **Persian UI text, RTL layout.** No English labels, no LTR-only layout. Root is
   `<html lang="fa" dir="rtl">`. Use logical properties (`margin-inline-start`,
   `inset-inline-end`, `text-align: start`) — not `left`/`right` — in new CSS.
2. **No hardcoded colour or font size outside `design/tokens.css`.** Use existing custom
   properties (`--text`, `--muted`, `--text-bright`, `--atlas-heading-font`, …).
3. **Persian digits in display.** Render numbers through `faDigits()` (`modules.js`);
   `print-sheet.js` and `record-file.js` expose their own `fa()`. Never mix Latin digits
   into a Persian label.
4. **Jalali dates use the one owner.** `modules.js` «تاریخ شمسی»: `parseJalali`,
   `formatJalali`, `jalaliInputValue`, `splitJalaliText`, `setJalaliFieldValue`. Inputs opt in
   with `data-jalali-input="jalali"` or `"jalali-datetime"`. Allowed year range 1300–1500,
   month 1–12, day 1–31.
5. **Store ISO, display Jalali.** Never persist a Jalali string. Convert on input with
   `parseJalali`, on display with `formatJalali`. This rule applies to the shift planner too.
6. **Do not write a second date picker or digit formatter.** Reuse the existing helpers.

## Typography and layout

- Body font stack lives in `design/styles.css` (`Tahoma, "Segoe UI", sans-serif`); headings use
  `var(--atlas-heading-font)`. Do not introduce web fonts — the app must stay offline.
- Persian text needs line-height headroom; avoid tight `line-height` in new components.
- Numbers and IDs inside RTL text: keep Latin-looking values (`code`, phone, plate) in a
  `dir="ltr"` span with `unicode-bidi: isolate` so they do not reorder.
- Tables: rely on the shared grid/print styles; `print-sheet.js` already handles column widths
  and one-line numeric cells.
- Responsive: check the existing mobile breakpoints in `styles.css` / `new-ui.css`; do not add
  a competing breakpoint system. Low-use panels open as popover/sheet/modal, not long forms.

## CSV/Word caveat

Persian text in Excel needs the CSV BOM plus the RTL mark that `design/export-docs.js` already
emits. Do not build CSV by hand.

## Verify

- `node tests/jalali-date.cjs` for any date-helper change.
- Preview: check RTL alignment, Persian digits, and a Jalali field round-trip (typing a date
  saves an ISO value and redisplays the same Jalali date).
