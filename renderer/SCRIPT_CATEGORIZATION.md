# Script Blocks Categorization (Nexo Renderer)

## Heavy + Critical (mantener, pero externalizados)
- **Data load/hydration and persistence orchestration** (`loadData`, `saveData`, `flushSaveQueue`, import pipelines).
- **Rendering pipeline** (`render`, `renderNow`, virtualized/list/cards/shifts rendering, pagination).
- **Indexed filtering/search** (`rebuildSearchIndex`, `applyFiltersIndexed`, query parsing).
- **IPC-driven updater/profile/export wiring** (status handlers, profile switching, export controls).

## Medium (útiles operativos)
- **Metrics/ops dashboards** (charts, transitions summaries, control center updates).
- **Theme/preferences/history helpers** (UI state persistence, profile UI refresh, diagnostics labels).
- **Background queue helpers** (delta queue, deferred background save scheduling).

## Light / Low impact utilities
- **Formatters and text helpers** (hash previews, CSV field helpers, string normalization wrappers).
- **Small UI helpers** (notifications, chip labels, simple toggles).

## Not useful for hot path (candidate for future trimming)
- Deep debug/perf-only logging paths.
- Rare/manual maintenance flows (advanced diagnostics buttons not used in day-to-day operation).
