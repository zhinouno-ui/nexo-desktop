(function () {
  function actions() {
    return window.NexoActions || {};
  }

  function state() {
    return window.AppState;
  }

  function elements() {
    return window.elements || window.NexoElements || {};
  }

  function refreshProfilesUI() {
    const appState = state();
    const ui = elements();
    const helpers = actions();
    const t0 = performance.now();
    try {
      helpers.ensureActiveProfile?.();
      const profileCounts = Object.create(null);
      (appState.contacts || []).forEach((contact) => {
        const profileId = contact?.profileId || 'default';
        profileCounts[profileId] = (profileCounts[profileId] || 0) + 1;
      });
      const profileList = Array.isArray(appState.profiles) && appState.profiles.length
        ? appState.profiles
        : [{ id: 'default', name: 'Base principal' }];

      if (ui.profileSelect) {
        ui.profileSelect.innerHTML = profileList.map((profile) => `<option value="${profile.id}">${profile.name}</option>`).join('');
        ui.profileSelect.value = appState.activeProfileId;
      }

      if (ui.profilesList) {
        ui.profilesList.innerHTML = '';
        if (window.NexoProfilesUI?.buildProfileRows) {
          ui.profilesList.innerHTML = window.NexoProfilesUI.buildProfileRows(profileList, profileCounts);
        }
      }

      if (ui.splitImportByFileToggle) ui.splitImportByFileToggle.checked = !!appState.splitImportByFile;
      if (ui.profilesList && !ui.profilesList.dataset.boundActions) {
        ui.profilesList.dataset.boundActions = '1';
        ui.profilesList.onclick = (ev) => {
          const button = ev.target.closest('[data-profile-action]');
          if (!button) return;
          const action = button.getAttribute('data-profile-action');
          const profileId = button.getAttribute('data-profile-id');
          if (!profileId) return;
          if (action === 'open') window.switchProfile(profileId);
          else if (action === 'rename') window.renameProfile(profileId);
          else if (action === 'delete') window.deleteProfile(profileId);
        };
      }
    } catch (error) {
      console.error('refreshProfilesUI failed', error);
      try { helpers.reportError?.('refreshProfilesUI', error); } catch (_) {}
    } finally {
      const appStateSafe = state();
      appStateSafe.perfStats = appStateSafe.perfStats || {};
      appStateSafe.perfStats.refreshProfilesUIMs = Math.round(performance.now() - t0);
    }
  }

  async function switchProfile(profileId) {
    const appState = state();
    const ui = elements();
    const helpers = actions();
    try {
      helpers.setLoadingState?.(true, 'Cambiando base…', 20, false);
      try { await helpers.flushSaveQueue?.('profile-switch'); } catch (_) {}
      appState.selectedContacts.clear();
      appState.searchIndex = { allIds: [], byId: new Map(), byStatus: new Map(), byShift: new Map(), byProfile: new Map(), byPhoneType: new Map(), byOrigin: new Map(), bySearchToken: new Map() };
      appState.searchIndexDirty = true;
      appState.statsDirty = true;
      appState.lastEditedContact = null;
      appState.activeProfileId = profileId;
      localStorage.setItem('activeProfileId', appState.activeProfileId);
      appState.currentPage = Math.max(1, Number(appState.profilePageMap?.[profileId] || 1));
      refreshProfilesUI();
      const finish = () => {
        helpers.remountDashboardState?.('profile-switch');
        helpers.setLoadingState?.(false, 'Listo', 100, false);
      };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => finish(), { timeout: 180 });
      else setTimeout(() => finish(), 0);
    } finally {
      if (ui.profilesModal) ui.profilesModal.classList.remove('active');
    }
  }

  async function renameProfile(profileId) {
    const appState = state();
    const helpers = actions();
    const profile = (appState.profiles || []).find((item) => item.id === profileId);
    if (!profile) return;
    const nextName = helpers.normalizeProfileName?.(window.prompt('Nuevo nombre del perfil', profile.name || '') || '').slice(0, 60);
    if (!nextName) return;
    const duplicated = (appState.profiles || []).some((item) => item.id !== profileId && helpers.normalizeSearchText?.(item.name) === helpers.normalizeSearchText?.(nextName));
    if (duplicated) {
      helpers.showNotification?.('Ya existe un perfil con ese nombre', 'warning');
      return;
    }
    if (window.electronAPI?.renameProfile) {
      try {
        const response = await window.electronAPI.renameProfile({ id: profileId, name: nextName });
        if (response?.ok && Array.isArray(response.profiles)) appState.profiles = response.profiles;
        else profile.name = nextName;
      } catch (_) {
        profile.name = nextName;
      }
    } else {
      profile.name = nextName;
    }
    helpers.savePreferences?.();
    refreshProfilesUI();
    helpers.render?.();
    helpers.showNotification?.('Perfil renombrado', 'success');
  }

  async function deleteProfile(profileId) {
    const appState = state();
    const helpers = actions();
    if (profileId === 'default') return;
    const count = (appState.contacts || []).filter((contact) => (contact.profileId || 'default') === profileId).length;
    if (!window.confirm(`¿Borrar perfil y ${count} contactos asociados?`)) return;
    appState.contacts = appState.contacts.filter((contact) => (contact.profileId || 'default') !== profileId);
    if (window.electronAPI?.deleteProfile) {
      try {
        const response = await window.electronAPI.deleteProfile({ id: profileId });
        if (response?.ok && Array.isArray(response.profiles)) appState.profiles = response.profiles;
        else appState.profiles = appState.profiles.filter((profile) => profile.id !== profileId);
      } catch (_) {
        appState.profiles = appState.profiles.filter((profile) => profile.id !== profileId);
      }
    } else {
      appState.profiles = appState.profiles.filter((profile) => profile.id !== profileId);
    }
    helpers.ensureActiveProfile?.();
    helpers.detectDuplicates?.();
    helpers.saveData?.();
    refreshProfilesUI();
    helpers.render?.();
  }

  async function initProfilesLogic() {
    const appState = state();
    const ui = elements();
    const helpers = actions();
    if (ui.manageProfilesBtn) {
      ui.manageProfilesBtn.onclick = async () => {
        await helpers.syncProfilesFromMain?.();
        refreshProfilesUI();
        if (ui.profilesModal) ui.profilesModal.classList.add('active');
      };
    }
    if (ui.profileSelect) {
      ui.profileSelect.onchange = (event) => {
        appState.activeProfileId = event.target.value || 'default';
        localStorage.setItem('activeProfileId', appState.activeProfileId);
        helpers.render?.();
      };
    }
    if (ui.addProfileBtn) {
      ui.addProfileBtn.onclick = async () => {
        const name = (ui.newProfileName?.value || '').trim();
        if (!name) {
          helpers.showNotification?.('Escribí un nombre para el perfil', 'warning');
          return;
        }
        const createdId = await helpers.ensureProfileByName?.(name);
        appState.activeProfileId = createdId || appState.activeProfileId;
        localStorage.setItem('activeProfileId', appState.activeProfileId);
        if (ui.newProfileName) ui.newProfileName.value = '';
        refreshProfilesUI();
        helpers.render?.();
        helpers.showNotification?.('Perfil creado y activado', 'success');
      };
    }
    if (ui.closeProfilesModal) ui.closeProfilesModal.onclick = () => ui.profilesModal && ui.profilesModal.classList.remove('active');
  }

  window.refreshProfilesUI = refreshProfilesUI;
  window.switchProfile = switchProfile;
  window.renameProfile = renameProfile;
  window.deleteProfile = deleteProfile;
  window.initProfilesLogic = initProfilesLogic;
})();
