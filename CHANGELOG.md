# Changelog

## 1.1.19 - actualización del control

### Métricas + exportes + temas (refuerzo final)
- Dashboard de métricas por perfil con filtros (rango/turno/estado/tipo/solo-cambios) y gráficas (donut estado, donut selección, barras de transiciones).
- Export Mensual Full (`nexo-monthly-full-v1`) con baseline por perfil.
- Export Diario Delta (`nexo-daily-delta-v1`) con comparación contra baseline (nuevos + cambios) y salida JSON+CSV.
- Subida restringida por clave (`Master123`) con desbloqueo temporal y cola local `uploads_queue`.
- Modal de temas tipo Whaticket con presets, tema personalizado e import/export `themes.json`.

### Fix UX importación (bloqueo visual)
- Al abrir el diagnóstico de importación se desactiva el overlay de carga para no bloquear menú/modal de confirmación.
- Overlay de carga ahora muestra preview de usuarios (usuario/teléfono/estado) con scroll vertical tipo "pantalla de inicio" mientras procesa.

### Control import/export protegido
- Nuevo input dedicado para importar archivo de control desde el Centro de métricas.
- Importación protegida por clave (base inicial `master123`) sin exponerla en texto plano en la UI.
- Después del primer ingreso correcto, se habilita un apartado para cambiar la clave del archivo de control.
- Importación de control ahora usa selector nativo de archivos y valida formato de control diario/mensual generado por Nexo.
- Separación explícita entre `Control` (archivo liviano diario/mensual) y `Snapshot` (archivo pesado para auditoría).

### Métricas de transiciones y turnos
- Resumen principal de transiciones mostrando primero cambios reales (no líneas en cero).
- Combinaciones raras (por ejemplo `jugando -> no interesado`) se muestran bajo un desplegable sólo cuando existen.
- Ranking de turnos compactado y ordenado automáticamente por volumen (`TM/TT/TN`) con desglose de estados más marcados.
- Historial de controles importados recientes visible dentro del centro de métricas.

### Logs y legibilidad
- Apertura del log de errores con contenido guía cuando está vacío para evitar pantallas en blanco y mejorar lectura operativa.

## 1.1.18

### Blindaje del updater
- Nuevo health-check automático post build (`dist:win`) que valida `latest.yml` local y remoto, existencia/peso del `.exe` y lectura con redirects.
- Mensajes de estado de actualización más claros para usuario final cuando no hay versión nueva disponible.

### Importador premium y diagnóstico
- Reemplazo del preview por `confirm()` con panel de diagnóstico visual: preview (20 filas), mapeo de columnas y validaciones legibles (vacíos, inválidos, duplicados, delimitador).

### UX y desktop
- Corrección de progreso/conteos por perfil activo para evitar mezcla entre bases.
- Aumento de hitbox en flecha/opciones de tarjeta.
- Cerrar ventana ahora minimiza a barra de tareas (app permanece activa para tareas de fondo/tray).

## 1.1.17

### Perfiles, UX y productividad
- Corregido el progreso y conteos para que se calculen por perfil activo y no se mezclen entre bases.
- Mejoras de integración de notificaciones motivacionales nativas con reset automático por bloques de 8 horas.

### Updater, rollback y cache
- Refuerzo de cache local de versión actual al iniciar para garantizar rollback.
- Rollback conserva solo versiones inferiores y la limpieza mantiene máximo 3 instaladores.
- Ajustes de `latest.yml` parsing para evitar falsos inválidos (`path`/`url` + `sha512`).
- Fix crítico: `requestText` y `downloadFile` ahora siguen redirects HTTP (302/307...) de GitHub Releases hacia objects.githubusercontent.com.

### Desktop integration
- Agregado Tray icon con menú rápido (abrir, buscar update, rollback y salir).
- Auto-launch en Windows y handler de protocolo `nexo://` con soporte inicial para deep link de import.
- Nuevo bridge de diálogos nativos (`dialog.showOpenDialog`) y notificaciones nativas vía main process.

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
