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

  async function refreshProfilesUI() {
    const t0 = performance.now();
    try {
      const appState = state();
      const helpers = actions();
      const ui = elements();
      if (!ui.profilesList) return;

      const profiles = appState.profiles || [];
      const activeId = appState.activeProfileId || 'default';

      // Obtener cantidad de contactos por perfil para previsualización
      const profileCounts = {};
      for (const profile of profiles) {
        try {
          let contactCount = 0;
          if (profile.id === activeId) {
            // Perfil activo: usar contactos en memoria
            contactCount = appState.contacts.length;
          } else {
            // Otros perfiles: cargar desde disco para contar
            if (window.electronAPI?.loadProfile) {
              const result = await window.electronAPI.loadProfile({ profileId: profile.id });
              if (result?.ok && Array.isArray(result.contacts)) {
                contactCount = result.contacts.length;
              }
            } else {
              // Fallback localStorage
              const raw = localStorage.getItem(`contactsData:${profile.id}`);
              if (raw) {
                const parsed = JSON.parse(raw);
                contactCount = Array.isArray(parsed) ? parsed.length : 0;
              }
            }
          }
          profileCounts[profile.id] = contactCount;
        } catch (e) {
          profileCounts[profile.id] = 0;
        }
      }

      ui.profilesList.innerHTML = profiles.map(profile => {
        const isActive = profile.id === activeId;
        const statusIcon = isActive ? 'fas fa-check-circle' : 'fas fa-circle';
        const statusColor = isActive ? 'var(--accent)' : 'rgba(148,163,184,0.5)';
        const contactCount = profileCounts[profile.id] || 0;
        const countLabel = contactCount.toLocaleString('es-ES');
        
        return `
          <div class="profile-item ${isActive ? 'active' : ''}" data-profile-id="${profile.id}">
            <div class="profile-info">
              <div class="profile-name">
                <i class="${statusIcon}" style="color: ${statusColor}; margin-right: 8px;"></i>
                ${profile.name}
                <span class="profile-count" style="margin-left: 8px; background: rgba(148,163,184,0.2); padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">
                  ${countLabel} contactos
                </span>
              </div>
              <div class="profile-meta">
                Creado: ${new Date(profile.createdAt).toLocaleDateString('es-ES')}
              </div>
            </div>
            <div class="profile-actions">
              ${!isActive ? `<button class="btn btn-sm profile-activate-btn" data-profile-id="${profile.id}">Activar</button>` : ''}
              <button class="btn btn-sm btn-secondary profile-rename-btn" data-profile-id="${profile.id}">Renombrar</button>
              ${profiles.length > 1 ? `<button class="btn btn-sm btn-danger profile-delete-btn" data-profile-id="${profile.id}">Eliminar</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Add event listeners for profile buttons
      ui.profilesList.querySelectorAll('.profile-activate-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const profileId = btn.getAttribute('data-profile-id');
          if (profileId) switchProfile(profileId);
        });
      });

      ui.profilesList.querySelectorAll('.profile-rename-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const profileId = btn.getAttribute('data-profile-id');
          if (profileId) renameProfile(profileId);
        });
      });

      ui.profilesList.querySelectorAll('.profile-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const profileId = btn.getAttribute('data-profile-id');
          if (profileId) deleteProfile(profileId);
        });
      });
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
      
      // SEPARACIÓN TOTAL: Guardar perfil anterior ANTES de cambiar activeProfileId
      const previousProfileId = appState.activeProfileId;
      if (previousProfileId && previousProfileId !== profileId && appState.contacts.length > 0) {
        try {
          console.log(`[switchProfile] Guardando ${appState.contacts.length} contactos del perfil anterior: ${previousProfileId}`);
          if (window.electronAPI?.saveProfile) {
            await window.electronAPI.saveProfile({ 
              profileId: previousProfileId, 
              contacts: appState.contacts 
            });
            console.log(`[switchProfile] ✅ Guardado en DISCO: ${appState.contacts.length} contactos`);
          } else {
            console.warn('[switchProfile] ⚠️ electronAPI no disponible - datos NO guardados permanentemente');
            console.warn('[switchProfile] Los contactos se perderán al cerrar la aplicación');
            // Solo guardar configuración básica, NO contactos masivos
            try {
              const basicInfo = { 
                profileId: previousProfileId, 
                contactCount: appState.contacts.length,
                lastSaved: new Date().toISOString()
              };
              localStorage.setItem(`profileInfo:${previousProfileId}`, JSON.stringify(basicInfo));
            } catch (e) {
              console.warn('[switchProfile] No se pudo guardar info básica:', e);
            }
          }
        } catch (e) {
          console.error('[switchProfile] Error guardando perfil anterior:', e);
        }
      }
      
      // LIMPIAR COMPLETAMENTE la memoria
      appState.contacts = [];
      appState.selectedContacts.clear();
      appState.searchIndex = { allIds: [], byId: new Map(), byStatus: new Map(), byShift: new Map(), byProfile: new Map(), byPhoneType: new Map(), byOrigin: new Map(), bySearchToken: new Map() };
      appState.searchIndexDirty = true;
      appState.statsDirty = true;
      appState.lastEditedContact = null;
      appState.filteredContacts = [];
      appState.searchQuery = '';
      appState.statusFilter = '';
      appState.originFilter = '';
      
      // CAMBIAR perfil activo
      appState.activeProfileId = profileId;
      localStorage.setItem('activeProfileId', appState.activeProfileId);
      appState.currentPage = Math.max(1, Number(appState.profilePageMap?.[profileId] || 1));

      // ── Recargar datos aislados por perfil ──────────────────────────────
      const pid = profileId || 'default';

      // Historial
      try {
        const h = localStorage.getItem(`history:${pid}`);
        appState.history = h ? JSON.parse(h) : [];
      } catch (_) { appState.history = []; }

      // Transiciones de estado
      try {
        const t = localStorage.getItem(`statusTransitions:${pid}`);
        appState.statusTransitions = t ? JSON.parse(t) : [];
      } catch (_) { appState.statusTransitions = []; }

      // Eventos de botón
      try {
        const b = localStorage.getItem(`buttonPressEvents:${pid}`);
        appState.buttonPressEvents = b ? JSON.parse(b) : [];
      } catch (_) { appState.buttonPressEvents = []; }

      // Snapshots de turno
      try {
        const s = localStorage.getItem(`shiftSnapshots:${pid}`);
        appState.shiftSnapshots = s ? JSON.parse(s) : [];
      } catch (_) { appState.shiftSnapshots = []; }

      // Métricas
      try {
        const m = localStorage.getItem(`metricEvents:${pid}`);
        appState.metricEvents = m ? JSON.parse(m) : [];
      } catch (_) { appState.metricEvents = []; }

      // Modo turnos (nombres de operadores)
      try {
        const sm = localStorage.getItem(`shiftMode:${pid}`);
        if (sm) {
          const parsed = JSON.parse(sm);
          appState.shiftMode = { ...appState.shiftMode, ...parsed };
        } else {
          appState.shiftMode = {
            tm: { name: 'TM', queue: [], cursor: 0, stack: [] },
            tt: { name: 'TT', queue: [], cursor: 0, stack: [] },
            tn: { name: 'TN', queue: [], cursor: 0, stack: [] }
          };
        }
      } catch (_) {}

      // Cargar contactos del nuevo perfil
      try {
        let _newContacts = [];
        if (window.electronAPI?.loadProfile) {
          const result = await window.electronAPI.loadProfile({ profileId: pid });
          if (result?.ok && Array.isArray(result.contacts)) {
            _newContacts = result.contacts;
            _newContacts.forEach(c => { if (!c.profileId) c.profileId = pid; });
            console.log(`[switchProfile] ✅ Cargado desde DISCO: ${_newContacts.length} contactos del perfil ${pid}`);
          } else {
            console.warn(`[switchProfile] ⚠️ No se encontraron datos en disco para perfil ${pid}`);
          }
        } else {
          console.warn('[switchProfile] ⚠️ electronAPI no disponible - usando localStorage (LIMITADO)');
          // Fallback localStorage (solo para desarrollo/emergencia)
          const _raw = localStorage.getItem(`contactsData:${pid}`);
          if (_raw) {
            try {
              _newContacts = JSON.parse(_raw);
              _newContacts.forEach(c => { if (!c.profileId) c.profileId = pid; });
              console.warn(`[switchProfile] ⚠️ Cargado desde localStorage: ${_newContacts.length} contactos (TEMPORAL)`);
            } catch (e) {
              console.error('[switchProfile] Error parseando localStorage:', e);
            }
          }
        }
        
        // Cargar SOLO los contactos del nuevo perfil (memoria ya está limpia)
        appState.contacts = [..._newContacts];
        console.log(`[switchProfile] Perfil ${pid} cargado con ${_newContacts.length} contactos (separación total)`);
      } catch (_e) {
        console.warn('[switchProfile] No se pudieron cargar contactos del perfil:', pid, _e);
        appState.contacts = [];
      }
      // ───────────────────────────────────────────────────────────────────

      refreshProfilesUI();
      helpers.remountDashboardState?.('profile-switch');
      helpers.setLoadingState?.(false, 'Listo', 100, false);
      
      // Forzar actualización visual del selector de perfiles
      setTimeout(() => {
        refreshProfilesUI();
        const activeProfileElement = document.querySelector('.profile-card.active-profile');
        if (activeProfileElement) {
          activeProfileElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    } finally {
      if (ui.profilesModal) ui.profilesModal.classList.remove('active');
    }
  }

  async function renameProfile(profileId) {
    const appState = state();
    const helpers = actions();
    const profile = (appState.profiles || []).find((item) => item.id === profileId);
    if (!profile) return;
    // Electron bloquea prompt() — usamos input inline en el DOM
    const nextName = await new Promise((resolve) => {
      const ui = elements();
      const container = ui.profilesList;
      if (!container) { resolve(''); return; }
      // Buscar la fila del perfil y reemplazarla con un input
      const row = container.querySelector(`[data-profile-id="${profileId}"][data-profile-action="rename"]`)?.closest('.history-item');
      if (!row) { resolve(''); return; }
      const original = row.innerHTML;
      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;width:100%;padding:4px 0;">
          <input id="_renameInput" type="text" value="${(profile.name || '').replace(/"/g, '&quot;')}"
            style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--accent);background:var(--surface);color:var(--text-primary);font-size:.9rem;"
            maxlength="60" />
          <button class="btn" id="_renameOk" style="padding:4px 12px;">OK</button>
          <button class="btn" id="_renameCancel" style="padding:4px 12px;">Cancelar</button>
        </div>`;
      const input = document.getElementById('_renameInput');
      input.focus();
      input.select();
      const cleanup = (val) => { row.innerHTML = original; resolve(val); };
      document.getElementById('_renameOk').onclick = () => cleanup(input.value.trim());
      document.getElementById('_renameCancel').onclick = () => cleanup('');
      input.onkeydown = (e) => { if (e.key === 'Enter') cleanup(input.value.trim()); if (e.key === 'Escape') cleanup(''); };
    });
    if (!nextName) return;
    const normalized = (helpers.normalizeProfileName?.(nextName) || nextName).slice(0, 60);
    if (!normalized) return;
    const duplicated = (appState.profiles || []).some((item) => item.id !== profileId && helpers.normalizeSearchText?.(item.name) === helpers.normalizeSearchText?.(normalized));
    if (duplicated) {
      helpers.showNotification?.('Ya existe un perfil con ese nombre', 'warning');
      return;
    }
    if (window.electronAPI?.renameProfile) {
      try {
        const response = await window.electronAPI.renameProfile({ id: profileId, name: normalized });
        if (response?.ok && Array.isArray(response.profiles)) appState.profiles = response.profiles;
        else profile.name = normalized;
      } catch (_) {
        profile.name = normalized;
      }
    } else {
      profile.name = normalized;
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


  // ── NexoProfilesUI: renderiza las filas del modal de perfiles ──────────────
  window.NexoProfilesUI = {
    buildProfileRows(profileList, profileCounts) {
      const appState = window.AppState;
      const activeId = appState?.activeProfileId || 'default';
      if (!profileList || profileList.length === 0) {
        return '<p style="color:var(--text-secondary);padding:8px;">No hay perfiles creados.</p>';
      }
      return profileList.map(profile => {
        const count = profileCounts[profile.id] || 0;
        const isActive = profile.id === activeId;
        return `
          <div class="history-item" style="display:flex;align-items:center;justify-content:space-between;padding:10px 6px;border-bottom:1px solid rgba(255,255,255,.07);">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              ${isActive ? '<span style="background:var(--accent);color:#fff;font-size:.65rem;padding:2px 6px;border-radius:4px;font-weight:700;white-space:nowrap;">ACTIVO</span>' : ''}
              <span style="font-weight:${isActive ? '600' : '400'};color:${isActive ? 'var(--text-primary)' : 'var(--text-secondary)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${profile.name || profile.id}
              </span>
              <span style="font-size:.75rem;color:var(--text-secondary);opacity:.7;white-space:nowrap;">(${count})</span>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
              ${!isActive ? `<button class="btn" style="padding:3px 8px;font-size:.75rem;" data-profile-action="open" data-profile-id="${profile.id}">
                <i class="fas fa-sign-in-alt"></i> Activar
              </button>` : ''}
              <button class="btn" style="padding:3px 8px;font-size:.75rem;" data-profile-action="import-csv" data-profile-id="${profile.id}" title="Importar CSV a este perfil">
                <i class="fas fa-file-upload"></i> Importar CSV
              </button>
              <button class="btn" style="padding:3px 8px;font-size:.75rem;" data-profile-action="rename" data-profile-id="${profile.id}">
                <i class="fas fa-pen"></i>
              </button>
              ${profile.id !== 'default' ? `
              <button class="btn" style="padding:3px 8px;font-size:.75rem;color:#ef4444;border-color:#ef4444;" data-profile-action="delete" data-profile-id="${profile.id}">
                <i class="fas fa-trash"></i>
              </button>` : ''}
            </div>
          </div>`;
      }).join('');
    }
  };

  window.refreshProfilesUI = refreshProfilesUI;
  window.switchProfile = switchProfile;
  window.renameProfile = renameProfile;
  window.deleteProfile = deleteProfile;
  window.initProfilesLogic = initProfilesLogic;
  
  // Registrar módulo en el bridge
  if (window.NexoBridge) {
    window.NexoBridge.register('profiles');
  } else {
    console.warn('[PROFILES-LOGIC] NexoBridge no disponible');
  }
  
  console.log('[PROFILES-LOGIC] ✅ Módulo de perfiles cargado');
})();
