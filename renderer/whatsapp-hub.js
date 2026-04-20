/* global electronAPI */
(function () {
  const $ = (id) => document.getElementById(id);
  const sessionsEl = $('sessions');
  const hintEl = $('hint');
  const addBtn = $('addBtn');
  const closeBtn = $('closeBtn');
  const resetBtn = $('resetBtn');
  const configBtn = $('configBtn');
  const backBtn = $('backWsp');
  const focusNexoBtn = $('focusNexo');
  const urlInput = $('urlInput');
  const urlGo = $('urlGo');
  const profileModal = $('profileModal');
  const modalTitle = $('modalTitle');
  const profileLabel = $('profileLabel');
  const profileStatus = $('profileStatus');
  const profileProxy = $('profileProxy');
  const modalCancel = $('modalCancel');
  const modalSave = $('modalSave');

  let active = null;
  let sessions = [];
  let sessionProfiles = {};
  let dragId = null;

  function uiSessionLabel(id) {
    const profile = sessionProfiles[id];
    if (profile && profile.label) return profile.label;
    const s = String(id || '');
    return s.length > 4 ? s.slice(-4) : s;
  }

  function getProfileStatus(id) {
    return sessionProfiles[id]?.status || 'active';
  }

  function render() {
    sessionsEl.innerHTML = sessions.map((sid) => {
      const isActive = String(sid) === String(active);
      const status = getProfileStatus(sid);
      const isDown = status === 'down';
      const profile = sessionProfiles[sid] || {};
      const label = profile.label || '';
      const hasProxy = !!(profile.proxy);
      return `
        <div class="pill ${isActive ? 'active' : ''} ${isDown ? 'down' : ''}" draggable="true" data-sid="${String(sid).replace(/"/g, '&quot;')}">
          <span class="status-dot ${isDown ? 'down-dot' : 'active-dot'}"></span>
          <div>
            <div class="id">${String(sid).length > 4 ? String(sid).slice(-4) : sid}</div>
            <div class="sub">${isDown ? 'CAÍDO' : (isActive ? 'ACTIVA' : 'SESIÓN')}</div>
            ${label ? `<div class="pill-label" title="${label.replace(/"/g, '&quot;')}">${label}</div>` : ''}
            ${hasProxy ? '<div class="pill-label" style="color:#60a5fa;">🔒 proxy</div>' : ''}
          </div>
        </div>
      `;
    }).join('');

    sessionsEl.querySelectorAll('.pill').forEach((pill) => {
      pill.addEventListener('dragstart', (e) => {
        dragId = pill.getAttribute('data-sid');
        pill.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', dragId || ''); } catch (_) {}
      });
      pill.addEventListener('dragend', () => {
        dragId = null;
        pill.classList.remove('dragging');
        sessionsEl.querySelectorAll('.pill').forEach((p) => p.classList.remove('drop-target'));
      });
      pill.addEventListener('dragover', (e) => {
        e.preventDefault();
        pill.classList.add('drop-target');
      });
      pill.addEventListener('dragleave', () => pill.classList.remove('drop-target'));
      pill.addEventListener('drop', async (e) => {
        e.preventDefault();
        pill.classList.remove('drop-target');
        const targetId = pill.getAttribute('data-sid') || '';
        const fromId = dragId || (() => { try { return e.dataTransfer.getData('text/plain'); } catch { return ''; } })();
        if (!fromId || !targetId || fromId === targetId) return;
        const fromIdx = sessions.findIndex((x) => String(x) === String(fromId));
        const toIdx = sessions.findIndex((x) => String(x) === String(targetId));
        if (fromIdx < 0 || toIdx < 0) return;
        const next = sessions.slice();
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        sessions = next;
        await electronAPI?.whatsappHubReorder?.({ order: sessions });
        render();
      });

      // Click derecho → abrir config
      pill.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const sid = pill.getAttribute('data-sid') || '';
        if (sid) openProfileConfig(sid);
      });

      pill.addEventListener('click', async () => {
        const sid = pill.getAttribute('data-sid') || '';
        if (!sid) return;
        await electronAPI?.whatsappHubSelect?.({ sessionId: sid });
        active = sid;
        hintEl.textContent = `Sesión activa: ${uiSessionLabel(sid)} (${sid})`;
        refresh();
      });
    });
  }

  async function refresh() {
    const res = await electronAPI?.whatsappHubList?.();
    sessions = Array.isArray(res?.sessions) ? res.sessions : [];
    sessionProfiles = (res?.sessionProfiles && typeof res.sessionProfiles === 'object') ? res.sessionProfiles : {};
    active = res?.activeSessionId || active || (sessions[0] || null);
    render();
    if (active) {
      const label = uiSessionLabel(active);
      const status = getProfileStatus(active);
      hintEl.textContent = `Sesión activa: ${label} (${active})${status === 'down' ? ' — CAÍDO' : ''}`;
    } else {
      hintEl.textContent = 'Cargá una sesión desde la izquierda.';
    }
  }

  function openProfileConfig(sid) {
    const profile = sessionProfiles[sid] || {};
    modalTitle.textContent = `Configurar Sesión ${sid}`;
    profileLabel.value = profile.label || '';
    profileStatus.value = profile.status || 'active';
    profileProxy.value = profile.proxy || '';
    profileModal.classList.add('visible');
    profileModal.dataset.sid = sid;
    profileLabel.focus();
  }

  // Añadir sesión
  addBtn.addEventListener('click', async () => {
    const res = await electronAPI?.whatsappHubAdd?.({ url: 'https://web.whatsapp.com/' });
    if (res?.ok) {
      active = res.sessionId;
      await electronAPI?.whatsappHubSelect?.({ sessionId: res.sessionId });
      refresh();
    }
  });

  // Cerrar sesión
  closeBtn.addEventListener('click', async () => {
    if (!active) return;
    const ok = confirm(`¿Cerrar sesión ${uiSessionLabel(active)}? (solo cierra la vista, el login queda persistido)`);
    if (!ok) return;
    await electronAPI?.whatsappHubCloseSession?.({ sessionId: active });
    active = null;
    refresh();
  });

  // Reset sesión
  resetBtn.addEventListener('click', async () => {
    if (!active) return;
    const ok = confirm(`RESET sesión ${uiSessionLabel(active)}:\n\n- Borra cookies, storage y cache\n- Cierra sesión de WhatsApp\n- Vas a tener que escanear QR de nuevo\n\n¿Continuar?`);
    if (!ok) return;
    await electronAPI?.whatsappHubResetSession?.({ sessionId: active });
    refresh();
  });

  // Config del perfil activo
  configBtn.addEventListener('click', () => {
    if (!active) return;
    openProfileConfig(active);
  });

  // Navegación: ir a URL
  urlGo.addEventListener('click', async () => {
    const url = (urlInput.value || '').trim();
    if (!url || !active) return;
    await electronAPI?.whatsappHubNavigate?.({ sessionId: active, url });
  });
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') urlGo.click();
  });

  // Atrás
  backBtn.addEventListener('click', async () => {
    if (!active) return;
    await electronAPI?.whatsappHubGoBack?.({ sessionId: active });
  });

  // Volver a Nexo
  focusNexoBtn.addEventListener('click', async () => {
    await electronAPI?.whatsappFocusMain?.();
  });

  // Modal: cancelar
  modalCancel.addEventListener('click', () => {
    profileModal.classList.remove('visible');
  });
  profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) profileModal.classList.remove('visible');
  });

  // Modal: guardar
  modalSave.addEventListener('click', async () => {
    const sid = profileModal.dataset.sid;
    if (!sid) return;
    const payload = {
      sessionId: sid,
      label: profileLabel.value.trim(),
      status: profileStatus.value,
      proxy: profileProxy.value.trim()
    };
    const res = await electronAPI?.whatsappHubUpdateProfile?.(payload);
    if (res?.ok) {
      sessionProfiles[sid] = res.profile;
      profileModal.classList.remove('visible');
      render();
      // Actualizar hint
      if (String(sid) === String(active)) {
        const label = uiSessionLabel(active);
        const status = getProfileStatus(active);
        hintEl.textContent = `Sesión activa: ${label} (${active})${status === 'down' ? ' — CAÍDO' : ''}`;
      }
    }
  });

  // Startup: abrir hub y asegurar al menos 1 sesión
  (async () => {
    await electronAPI?.whatsappHubOpen?.({ sessionId: '1', url: '' });
    await refresh();
  })();
})();
