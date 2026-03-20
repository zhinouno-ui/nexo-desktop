(function () {
  function state() { return window.AppState; }
  function elements() { return window.elements || {}; }
  function actions() { return window.NexoActions || {}; }

  function withinLastHours(iso, hours) {
    if (!iso) return false;
    const value = new Date(iso).getTime();
    if (!Number.isFinite(value)) return false;
    return (Date.now() - value) <= (hours * 60 * 60 * 1000);
  }

  function buildCurrentBaseline() {
    const appState = state();
    const profileId = appState.activeProfileId || 'default';
    const map = {};
    (appState.contacts || []).filter((contact) => (contact.profileId || 'default') === profileId).forEach((contact) => {
      const key = actions().normalizePhoneToE164?.(contact.phone || '') || String(contact.id);
      if (!key) return;
      map[key] = {
        id: contact.id,
        phone: contact.phone || '',
        status: contact.status || 'sin revisar',
        name: contact.name || '',
        updatedAt: contact.lastUpdated || contact.lastEditedAt || contact.lastImportedAt || ''
      };
    });
    return map;
  }

  async function exportSnapshot() {
    const appState = state();
    if (!window.api?.exportFull) {
      actions().showNotification?.('API de export backup no disponible', 'warning');
      return null;
    }
    const result = await window.api.exportFull({ profileId: appState.activeProfileId || 'default', shiftMode: appState.shiftMode || {} });
    if (result?.ok) {
      appState.lastFullExportAt = new Date().toISOString();
      actions().addToHistory?.('Export snapshot', result.filePath || '');
      actions().savePreferences?.();
      actions().showNotification?.(`Snapshot exportado: ${result.filePath || 'ok'}`, 'success');
      return result;
    }
    actions().showNotification?.(`Error export snapshot: ${result?.message || 'desconocido'}`, 'error');
    return null;
  }

  async function exportDelta() {
    const appState = state();
    if (!window.api?.exportDaily) {
      actions().showNotification?.('API de export diario no disponible', 'warning');
      return null;
    }
    const result = await window.api.exportDaily({ profileId: appState.activeProfileId || 'default', since: appState.lastFullExportAt || '' });
    if (result?.ok) {
      actions().addToHistory?.('Export delta', result.filePath || '');
      actions().showNotification?.(`Delta exportado: ${result.filePath || 'ok'}`, 'success');
      return result;
    }
    actions().showNotification?.(`Error export delta: ${result?.message || 'desconocido'}`, 'error');
    return null;
  }

  async function importFullSnapshot() {
    const appState = state();
    try {
      const files = await window.electronAPI?.openImportDialog?.();
      const selected = Array.isArray(files) ? files.find((file) => /\.(json|nexo)$/i.test(file)) : null;
      if (!selected) {
        actions().showNotification?.('Seleccioná un archivo .nexo o .json exportado', 'warning');
        return;
      }
      const importResult = window.api?.importData ? await window.api.importData(selected) : null;
      const parsed = importResult?.parsed || JSON.parse(await window.electronAPI.readTextFile(selected));
      const snapshotState = parsed?.state || parsed;
      const incomingContacts = Array.isArray(snapshotState.contacts) ? snapshotState.contacts : (Array.isArray(snapshotState.contactsData) ? snapshotState.contactsData : []);
      if (!incomingContacts.length) throw new Error('El snapshot no incluye contactos válidos');
      const sourceName = (parsed?.sourceDevice || parsed?.deviceName || 'Equipo importado').slice(0, 40);
      const mode = importResult?.mode || (await (window.electronAPI?.resolveImportMode ? window.electronAPI.resolveImportMode() : Promise.resolve({ mode: 'new-profile' })))?.mode || 'new-profile';
      if (mode === 'cancel') return;
      if (mode === 'current-overwrite') {
        appState.contacts = appState.contacts.filter((contact) => (contact.profileId || 'default') !== (appState.activeProfileId || 'default'));
      }
      const profileBase = `import-${Date.now()}`;
      const incomingProfiles = Array.isArray(snapshotState.profiles) && snapshotState.profiles.length ? snapshotState.profiles : [{ id: 'default', name: 'Base principal' }];
      const profileMap = new Map();
      incomingProfiles.forEach((profile, index) => {
        let newId = `${profileBase}-${index}`;
        if (mode === 'merge-existing') {
          newId = importResult?.targetProfileId || appState.activeProfileId || newId;
        } else if (mode === 'select-existing') {
          const options = (appState.profiles || []).map((item, idx) => `${idx + 1}. ${item.name}`).join('\n');
          const selectedIdx = Number(prompt(`Seleccioná perfil destino (número):\n${options}`, '1')) - 1;
          const selectedProfile = (appState.profiles || [])[Math.max(0, selectedIdx)] || (appState.profiles || [])[0];
          newId = selectedProfile?.id || newId;
        } else if (mode !== 'current-overwrite') {
          appState.profiles.push({ id: newId, name: `${sourceName} · ${profile.name || `Perfil ${index + 1}`}` });
        } else {
          newId = appState.activeProfileId || 'default';
        }
        profileMap.set(profile.id || 'default', newId);
      });
      appState.contacts = appState.contacts.concat(incomingContacts.map((contact) => ({ ...contact, id: Date.now() + Math.floor(Math.random() * 1000000), profileId: profileMap.get(contact.profileId || 'default') || profileBase })));
      appState.history = (Array.isArray(snapshotState.history) ? snapshotState.history : []).map((item) => ({ ...item, details: `[${sourceName}] ${item.details || ''}` })).concat(appState.history);
      appState.statusTransitions = (Array.isArray(snapshotState.statusTransitions) ? snapshotState.statusTransitions : []).map((item) => ({ ...item, profileId: profileMap.get(item.profileId || 'default') || profileBase })).concat(appState.statusTransitions);
      appState.buttonPressEvents = (Array.isArray(snapshotState.buttonPressEvents) ? snapshotState.buttonPressEvents : []).concat(appState.buttonPressEvents);
      appState.shiftSnapshots = (Array.isArray(snapshotState.shiftSnapshots) ? snapshotState.shiftSnapshots : []).concat(appState.shiftSnapshots);
      if (snapshotState.preferences) {
        appState.whatsappTemplate = snapshotState.preferences.whatsappTemplate || appState.whatsappTemplate;
        appState.duplicateMergeMode = snapshotState.preferences.duplicateMergeMode || appState.duplicateMergeMode;
        appState.splitImportByFile = !!snapshotState.preferences.splitImportByFile;
        appState.operatorName = snapshotState.preferences.operatorName || appState.operatorName;
      }
      actions().saveStatusTransitions?.();
      actions().saveButtonPressEvents?.();
      actions().saveShiftSnapshots?.();
      actions().saveHistory?.();
      actions().saveData?.();
      actions().render?.();
      window.refreshProfilesUI?.();
      actions().showNotification?.(`Snapshot importado en perfiles separados (${sourceName})`, 'success');
    } catch (error) {
      actions().reportError?.('importFullSnapshot', error);
      actions().showNotification?.(`No se pudo importar snapshot: ${error?.message || error}`, 'error');
    }
  }

  function createControlExportPayload() {
    const appState = state();
    const transitions24h = (appState.statusTransitions || []).filter((item) => withinLastHours(item.at, 24));
    const transitions30d = (appState.statusTransitions || []).filter((item) => withinLastHours(item.at, 24 * 30));
    const buttons24h = (appState.buttonPressEvents || []).filter((item) => withinLastHours(item.at, 24));
    const buttons30d = (appState.buttonPressEvents || []).filter((item) => withinLastHours(item.at, 24 * 30));
    const shiftTotals = {};
    transitions24h.forEach((item) => {
      const key = String(item.shift || 'sin-turno').toLowerCase();
      if (!shiftTotals[key]) shiftTotals[key] = { shift: key, reviewedOut: 0, sentOut: 0, total: 0 };
      shiftTotals[key].total += 1;
      if (item.from === 'sin revisar') shiftTotals[key].reviewedOut += 1;
      if (['contactado', 'jugando'].includes(item.to)) shiftTotals[key].sentOut += 1;
    });
    const topShift = Object.values(shiftTotals).sort((a, b) => b.total - a.total)[0] || null;
    const buttonsPerHour = Math.round(((buttons24h.length / 24) + Number.EPSILON) * 100) / 100;
    const monthByShift = {};
    transitions30d.forEach((item) => {
      const key = String(item.shift || 'sin-turno').toLowerCase();
      monthByShift[key] = (monthByShift[key] || 0) + 1;
    });
    return {
      exportedAt: new Date().toISOString(),
      exportType: 'nexo-control-daily-v1',
      sourceDevice: navigator.userAgent || 'Nexo',
      activeProfileId: appState.activeProfileId || 'default',
      reportScope: {
        profiles: (appState.profiles || []).map((profile) => ({ id: profile.id, name: profile.name })),
        contactsTotal: (appState.contacts || []).length,
        historyTotal: (appState.history || []).length
      },
      dailyTransitions: transitions24h,
      dailyButtons: buttons24h,
      summary24h: { transitionsCount: transitions24h.length, buttonsCount: buttons24h.length, buttonsPerHour, topShift, shiftTotals: Object.values(shiftTotals) },
      summary30d: { transitionsCount: transitions30d.length, buttonsCount: buttons30d.length, shifts: monthByShift }
    };
  }

  function exportControlFile(reason) {
    const appState = state();
    const payload = createControlExportPayload();
    const stamp = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
    actions().downloadFile?.(JSON.stringify(payload, null, 2), `nexo_control_${stamp}.json`, 'application/json;charset=utf-8;');
    appState.midnightExportPending = false;
    appState.lastMidnightExportDate = new Date().toISOString().slice(0, 10);
    localStorage.setItem('midnightExportPending', '0');
    localStorage.setItem('lastMidnightExportDate', appState.lastMidnightExportDate);
    if (elements().midnightExportBtn) elements().midnightExportBtn.classList.remove('btn-midnight-pulse');
    actions().showNotification?.(reason === 'auto' ? 'Exporte de control 00:00 generado automáticamente' : 'Exporte de control generado', 'success');
  }

  function ensureControlPasswordAccess() {
    const typed = window.prompt('Clave de archivo de control');
    if (!typed) return false;
    if (!actions().verifyControlPassword?.(typed)) {
      actions().showNotification?.('Clave incorrecta para importar archivo de control', 'error');
      return false;
    }
    state().controlImportUnlocked = true;
    actions().savePreferences?.();
    if (elements().controlPasswordPanel) elements().controlPasswordPanel.style.display = '';
    return true;
  }

  function importControlPayload(payload) {
    const appState = state();
    const report = payload || {};
    const kind = String(report.exportType || '').toLowerCase();
    if (kind.includes('snapshot') || Array.isArray(report?.state?.contacts) || Array.isArray(report?.contacts)) throw new Error('Este archivo es un snapshot completo. Usá "Importar TODO" para ese formato.');
    if (!kind.includes('control') && !Array.isArray(report.dailyTransitions) && !report.summary24h) throw new Error('Archivo de control inválido o no compatible');
    const sourceName = String(report?.sourceDevice || report?.deviceName || report?.machineName || 'Control importado').slice(0, 60);
    const importedAt = new Date().toISOString();
    const compact = {
      id: `ctrl-${Date.now()}`,
      importedAt,
      sourceName,
      exportedAt: report.exportedAt || '',
      summary24h: report.summary24h || null,
      summary30d: report.summary30d || null,
      transitionsCount: Array.isArray(report.dailyTransitions) ? report.dailyTransitions.length : (report.summary24h?.transitionsCount || 0)
    };
    appState.controlReports = [compact].concat(appState.controlReports || []).slice(0, 180);
    appState.controlLastImportedAt = importedAt;
    actions().addToHistory?.('Control importado', `${sourceName}: ${compact.transitionsCount} transiciones diarias`);
    actions().saveHistory?.();
    actions().savePreferences?.();
    actions().render?.();
    actions().showNotification?.(`Control importado (${sourceName})`, 'success');
  }

  function initSyncManager() {
    const ui = elements();
    if (ui.importFullSnapshotBtn) ui.importFullSnapshotBtn.onclick = () => importFullSnapshot();
    if (ui.exportDailyNexoBtn) ui.exportDailyNexoBtn.onclick = () => exportDelta();
    if (ui.exportBackupNexoBtn) ui.exportBackupNexoBtn.onclick = () => exportSnapshot();
    if (ui.midnightExportBtn) ui.midnightExportBtn.onclick = () => exportControlFile('manual');
    if (ui.uploadReportBtn) {
      ui.uploadReportBtn.onclick = async () => {
        if (!(await actions().ensureUploadUnlocked?.())) return;
        const selected = await exportDelta();
        if (!selected?.ok) {
          actions().showNotification?.('No se pudo preparar el log diario', 'error');
          return;
        }
        await actions().queueReportUpload?.(JSON.stringify({ filePath: selected.filePath || '', exportedAt: new Date().toISOString() }), 'daily-log');
      };
    }
    if (ui.importControlBtn) {
      ui.importControlBtn.onclick = async () => {
        if (!ensureControlPasswordAccess()) return;
        try {
          const files = await window.electronAPI?.openImportDialog?.();
          const selected = Array.isArray(files) ? files.find((file) => /\.json$/i.test(file)) : null;
          if (!selected) {
            actions().showNotification?.('Seleccioná un archivo JSON de control', 'warning');
            return;
          }
          const text = await window.electronAPI.readTextFile(selected);
          importControlPayload(JSON.parse(text));
        } catch (error) {
          actions().reportError?.('importControlFile', error);
          actions().showNotification?.(`No se pudo importar archivo de control: ${error?.message || error}`, 'error');
        }
      };
    }
  }

  window.exportSnapshot = exportSnapshot;
  window.exportDelta = exportDelta;
  window.importFullSnapshot = importFullSnapshot;
  window.initSyncManager = initSyncManager;
})();
