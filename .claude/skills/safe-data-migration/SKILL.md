---
name: safe-data-migration
description: Change anything that touches ATLAS SHIFT stored data — IndexedDB schema, normalizeState, the localStorage fallback, encrypted storage, section or full backup/restore, record shapes, attachments — without losing user records. Use when adding a data field, changing a record shape, bumping DB version, writing a migration, or editing backup/restore/export code.
---

# Safe data migration — ATLAS SHIFT

Stored data is the user's only copy. There is no backend and no undo.

## Storage facts (keep accurate, do not guess)

- IndexedDB `ATLAS_SHIFT_LOCAL`, version `DB_VERSION = 1`, store `records`.
- Two fully isolated spaces: `STORAGE_MODE_KEY = 'atlasShiftStorageMode'`; `STORE_KEY` is
  `'sandbox'` in test mode, otherwise `'main'`. Test-mode writes must never reach `main`.
- localStorage fallback via `LEGACY_KEY` (`atlasShiftOperationalDataV1` / `…SandboxV1`).
- `design/secure-store.js` encrypts the fallback (AES-GCM-256, gzip when available,
  non-extractable device key in IndexedDB `ATLAS_SECURE_KEYS`). Never change the key
  derivation or ciphertext layout without a read path for existing data.
- `normalizeState()` is the single shape authority; every load/restore passes through it.

## Rules

1. **Additive first.** New fields get defaults in `normalizeState`; old records must keep
   working without edit. Never rename or drop a key without a read-both/write-new path.
2. **Bump the schema version only with a real upgrade path.** `DB_VERSION` up + an
   `onupgradeneeded` migration that is idempotent and safe to re-run.
3. **Backup/restore is merge, not replace** for section backups (`scope.kind` = `module`,
   `config`, `phonebook`): merge by record `id`, count added vs updated, never delete.
   Full backup replaces everything — that path already asks for confirmation; keep it.
4. **Export files are a contract.** Section backups carry `scope`; keep the format
   backward-readable. Do not silently change the envelope or field names.
5. **Test mode must stay isolated.** Verify writes go to `sandbox` when test mode is on.
6. **Never run a real migration on the user's data to "check".** Validate with
   `node tests/demo-data.cjs` (demo fixture) and the storage tests, not the live browser DB.

## Approval gate — stop and ask before

- Deleting or overwriting any store, object store, or localStorage key.
- Any operation that drops records, drops fields, or clears `main`.
- Changing `DB_VERSION`, `STORE_KEY`, `LEGACY_KEY`, or the secure-store envelope.
- Running a script that writes to the user's IndexedDB/localStorage.

Ask with: what is destroyed, what is preserved, whether a backup exists, and how to revert.

## Verification

- `node tests/demo-data.cjs` — demo backup still restores.
- `node tests/secure-store-retry.cjs` — storage recovers after a transient failure.
- Load the preview in test mode and confirm `main` data is untouched.
