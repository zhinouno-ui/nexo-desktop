# Changelog

## 1.1.23 - sincronización diferencial y zero-lag

- Centro de métricas/exportación unificado en un solo “Centro de Control” (`exportDaily` + `exportBackup`) para eliminar duplicados de UI.
- Exportes `.nexo` comprimidos (gzip) con metadata (`profileName`, `timestamp`, `isFullBackup`) y naming por perfil (`[DB]_FULL_[fecha]`, `[DB]_DELTA_[fecha]`).
- Delta export real: sólo contactos/cambios posteriores al último Full (`lastFullExportAt`) para reducir tamaño de parche.
- Import inteligente `.nexo`: autodetección de perfil existente y merge automático sin pregunta; diálogo sólo cuando no existe perfil.
- Fix de cambio de perfil: limpieza de índices/sets en memoria + recarga silenciosa para evitar desaparición temporal de datos.
- Compatibilidad de store global: alias `window.nexoStore.getState()` para evitar errores de acceso en renderer.

## 1.1.22 - cierre y actualización automática

### Fix crítico updater (pedido operativo)
- El botón **Cerrar y actualizar** ahora intenta instalar también usando fallback desde cache, incluso si la metadata en memoria se perdió.
- Al cerrar con la **X** en Windows/Linux, si hay update descargada y válida, se ejecuta automáticamente el asistente de actualización antes de cerrar.
- Se arma/desarma estado de `installOnClose` al descargar update para evitar cierres sin instalar cuando ya estaba lista.
- Logging adicional para trazabilidad del intento de instalación al cerrar.

## 1.1.21 - filtros y fluidez de revisión

### Búsqueda y revisión más práctica
- Nuevo filtro `Sin usuario (solo número)` para encontrar rápido contactos cuyo “nombre” es numérico o igual al teléfono.
- Nuevo filtro `Teléfono sospechoso` para revisar líneas potencialmente apócrifas.
- Contactos con teléfono sospechoso ahora muestran alerta visual (`⚠️` / `ALERTA`) y se ordenan al final para no molestar en el flujo principal.

### Paginación más usable
- La app ahora recuerda página por perfil (se conserva al cambiar perfil y al recargar).
- Se agregó selector rápido de página (`Ir`) en la barra de paginación.

### Rendimiento operativo
- Ajuste de detección para marcar teléfonos sospechosos durante el ciclo de duplicados sin bloquear el flujo de edición.

## 1.1.20 - foco rendimiento + gestión

### Gestión de perfiles y temas
- Perfiles: ahora se pueden renombrar desde el modal de Perfiles/Bases (además de borrar perfiles no default).
- Temas personalizados: ahora se pueden renombrar y borrar directamente desde la grilla de temas.
- Export de `themes.json` ahora incluye **solo temas personalizados** (no exporta temas del sistema).

### Export de control unificado
- Se unificó el export diario/mensual en un único selector + botón `Exportar control`.
- La subida usa el tipo seleccionado; para mensual deja export realizado y avisa que la cola automática actual es diaria.

### Rendimiento de guardado
- Se redujo la frecuencia de escrituras pesadas: contactos se guardan en lote (hasta 100 cambios o timeout), evitando lag en cambios de estado/copia/operación diaria.
- Preferencias pasan a guardado diferido (debounce) y se fuerzan al cerrar la ventana para no perder cambios.

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

### Ajuste visual métricas + temas
- Renombre de KPIs a textos más intuitivos/marketineros (sin jerga técnica).
- Gráfico de barras de transiciones ahora usa degradado del tema (se elimina el bloque verde plano).
- Temas predefinidos actualizados con estética más cercana a Whaticket (incluye Cósmico diferenciado).
- Nuevo toggle de modo claro (suave, sin brillo agresivo) dentro del modal de temas.

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

## 1.2.0
- **MAJOR**: Fixed profile management system with strict data separation
- **MAJOR**: Implemented hybrid storage system - contacts on disk (150k+ support), metrics in localStorage
- **MAJOR**: Fixed profile comparison to load data from ALL profiles, not just active one
- **FIX**: Profile switching now properly saves previous profile data before loading new one
- **FIX**: Contact duplication and mixing between profiles completely resolved
- **FIX**: Profile selector UI visual issues fixed - proper selection state after switching
- **FEATURE**: Buffer system for contact saves (1000 contacts before disk write)
- **FEATURE**: Complete historical data preservation - all metrics, 500+ movements per shift
- **FEATURE**: Auto-save on app close to prevent data loss
- **PERFORMANCE**: Optimized for large datasets (150k+ contacts across multiple profiles)
- **UI**: Improved profile comparison view with real-time data from all profiles

## 1.1.15
- Base release introducing updater manager, release automation, and multi-profile UI foundation.
