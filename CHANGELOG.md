# Changelog

## 1.1.16

### Update system hardening
- Added strict release validation before update checks (`latest.yml`, `.exe`, `.blockmap`, yaml `version/path/sha512`, and version must be greater than current).
- Forced updater channel to `latest` and improved fail-safe path to open GitHub Releases page when automatic flow fails.
- Switched updater logging to `electron-log` with file output at `%APPDATA%/Nexo/logs/updater.log`.
- Enforced cache lifecycle in `userData/updates-cache` keeping only the latest 3 installer versions.
- Install flow now prioritizes cached installer path and validates SHA512 again from cache before install.

### Rollback and diagnostics
- Persisted `userData/current-version.json` with current version metadata and cached installer reference at startup / pre-install.
- Added updater diagnostics IPC and `window.nexoUpdaterDiagnostics()` for dev-console checks.
- Added `Ctrl+Shift+U` quick diagnostics modal in desktop app.

### UX/data fixes
- Fixed profile creation flow to activate and render instantly.
- Improved profiles modal visual treatment.
- Fixed "Borrar última subida" logic to work with both `lastImportBatchId` and legacy `importBatchId` records.
- Fixed possible duplicated version label format (`vv1.1.x`).

## 1.1.15
- Base release introducing updater manager, release automation, and multi-profile UI foundation.
