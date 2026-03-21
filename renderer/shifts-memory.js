(function () {
  function state() { return window.AppState; }
  function elements() { return window.elements || {}; }
  function actions() { return window.NexoActions || {}; }
  function storageKey() { return `shiftMode:${state().activeProfileId || 'default'}`; }

  function persistShiftModeMemory() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state().shiftMode || {}));
    } catch (_) {}
  }

  function restoreShiftModeMemory() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') state().shiftMode = { ...state().shiftMode, ...parsed };
    } catch (_) {}
  }

  function buildShiftQueue(shift) {
    const pid = state().activeProfileId || 'default';
    return state().contacts
      .filter((contact) => (contact.profileId || 'default') === pid && contact.assignedShift === shift && contact.status === 'sin revisar')
      .sort((a, b) => (new Date(a.lastUpdated || 0).getTime()) - (new Date(b.lastUpdated || 0).getTime()));
  }

  function renderQuickReview() {
    const appState = state();
    const ui = elements();
    const shift = appState.activeShift;
    if (!ui.quickReview) { console.warn('[SHIFTS] quickReview no encontrado en DOM'); return; }
    if (!shift) { ui.quickReview.style.display = 'none'; return; }
    const mode = appState.shiftMode[shift];
    const contact = mode.queue[mode.cursor];
    if (!contact) {
      ui.quickReview.style.display = 'block';
      ui.quickReview.innerHTML = `<h3>Revisión ${shift.toUpperCase()}</h3><p style="color:var(--text-secondary)">Sin más contactos en este turno.</p><button class="btn" onclick="closeQuickReview()">Cerrar</button>`;
      return;
    }
    const statusOption = actions().getStatusOption?.(contact.status) || { label: contact.status || '' };
    const phoneTxt = contact.phone || 'Sin teléfono';
    const initials = (contact.name || '?').trim().slice(0, 2).toUpperCase();
    const escapedName = (contact.name || '').replace(/'/g, "\\'");
    const escapedPhone = (contact.phone || '').replace(/'/g, "\\'");
    const totalInQueue = mode.queue.length;
    const currentPos = Math.min(mode.cursor + 1, Math.max(1, totalInQueue));
    ui.quickReview.style.display = 'block';
    ui.quickReview.innerHTML = `
      <div class="quick-layout">
        <div class="quick-profile">
          <div class="quick-profile-head">
            <div class="quick-avatar">${initials}</div>
            <div>
              <div class="quick-name copyable" onclick="copyToClipboard('${escapedName}', event)" title="Click para copiar usuario"><i class="fas fa-copy" style="font-size:.78rem;opacity:.8"></i>${contact.name}</div>
              <div class="quick-meta">${phoneTxt} · ${contact.origin || '-'}</div>
            </div>
          </div>
          <div class="quick-chips">
            <span class="quick-chip">Turno ${shift.toUpperCase()}</span>
            <span class="quick-chip">Operador: ${appState.shiftMode[shift].name}</span>
            <span class="quick-chip">Competencia: Pendiente</span>
            <span class="quick-chip">Cuenta para: ${actions().getLocalCompetitionShift?.(new Date()).toUpperCase()}</span>
            ${contact.status !== 'sin revisar' ? `<span class="quick-chip" style="border-color:rgba(251,191,36,.45);color:#fde68a;">Preestado: ${statusOption.label}</span>` : ''}
          </div>
          <div class="quick-progress">Usuario ${currentPos} de ${totalInQueue} en cola</div>
        </div>
        <div class="quick-panel">
          <div class="quick-topbar">
            <h3 style="margin:0;">Revisión rápida ${shift.toUpperCase()}</h3>
            <button class="btn" onclick="closeQuickReview()"><i class="fas fa-times"></i> Cerrar</button>
          </div>
          <div class="review-actions">
            ${(window.STATUS_OPTIONS || []).map((option) => `<button class="btn quick-status-btn ${option.id.replace(/ /g, '-')}" onclick="reviewSetStatus(${contact.id}, '${option.id}', event)"><i class="fas ${option.icon}"></i> ${option.label}</button>`).join('')}
          </div>
          <div class="quick-tools">
            <button class="btn" onclick="reviewPrev()" title="Deshabilitado para mantener consistencia de cola"><i class="fas fa-lock"></i> Sin retroceso</button>
            <button class="btn" onclick="reviewSkip()"><i class="fas fa-forward"></i> Saltar</button>
            <button class="btn" onclick="copyToClipboard('${escapedName}')"><i class="fas fa-copy"></i> Copiar usuario</button>
            ${contact.phone ? `<button class="btn" onclick="copyToClipboard('${escapedPhone}')"><i class="fas fa-copy"></i> Copiar teléfono</button>` : ''}
            <button class="btn" onclick="editContactField(${contact.id}, 'name')"><i class="fas fa-pen"></i> Editar</button>
            ${contact.phone ? `<button class="btn btn-success" onclick="openWhatsApp('${escapedPhone}', event)"><i class="fab fa-whatsapp"></i> WhatsApp</button>` : ''}
          </div>
        </div>
      </div>`;
  }

  function renameShift(shift, value) {
    state().shiftMode[shift].name = (value || shift.toUpperCase()).trim();
    persistShiftModeMemory();
    actions().saveData?.();
  }

  function rebalanceShift(shift) {
    const seq = ['tm', 'tt', 'tn'];
    if (shift === 'all') {
      const pid = state().activeProfileId || 'default';
      const unreviewed = state().contacts.filter((contact) => (contact.profileId || 'default') === pid && contact.status === 'sin revisar');
      let index = 0;
      unreviewed.forEach((contact) => { contact.assignedShift = seq[index % 3]; index += 1; });
      actions().renderShiftsView?.();
      persistShiftModeMemory();
      actions().saveData?.();
      actions().showNotification?.('Turnos rebalanceados (global)', 'success');
      return;
    }
    const pid2 = state().activeProfileId || 'default';
    const shiftContacts = state().contacts.filter((contact) => (contact.profileId || 'default') === pid2 && contact.assignedShift === shift && contact.status === 'sin revisar');
    shiftContacts.forEach((contact) => { contact.shiftReviewed = false; });
    actions().renderShiftsView?.();
    persistShiftModeMemory();
    actions().saveData?.();
    actions().showNotification?.(`Turno ${String(shift).toUpperCase()} rebalanceado`, 'success');
  }

  function startShiftReview(shift) {
    state().activeShift = shift;
    state().shiftMode[shift].queue = buildShiftQueue(shift);
    state().shiftMode[shift].cursor = 0;
    state().shiftMode[shift].stack = [];
    persistShiftModeMemory();
    renderQuickReview();
  }

  function reviewSetStatus(id, status, event) {
    const shift = state().activeShift;
    if (!shift) return;
    const mode = state().shiftMode[shift];
    const current = mode.queue[mode.cursor];
    if (!current) return;
    if (event && event.currentTarget) event.currentTarget.classList.add('applied');
    const quickPanel = elements().quickReview?.querySelector('.quick-panel');
    if (quickPanel) quickPanel.classList.add('updating');
    mode.stack.push(current.id);
    window.changeContactStatus(id, status, null, 'shift');
    setTimeout(() => {
      mode.cursor += 1;
      mode.queue = buildShiftQueue(shift);
      persistShiftModeMemory();
      renderQuickReview();
      actions().renderShiftsView?.();
    }, 130);
  }

  function reviewPrev() {
    actions().showNotification?.('Retroceso deshabilitado en modo competencia para no romper la cola', 'warning');
  }

  function reviewSkip() {
    const shift = state().activeShift;
    if (!shift) return;
    const mode = state().shiftMode[shift];
    if (mode.cursor < mode.queue.length - 1) mode.cursor += 1;
    else mode.cursor = mode.queue.length;
    persistShiftModeMemory();
    renderQuickReview();
  }

  function closeQuickReview() {
    state().activeShift = null;
    persistShiftModeMemory();
    const _qr = elements().quickReview;
    if (_qr) _qr.style.display = 'none';
  }

  window.persistShiftModeMemory = persistShiftModeMemory;
  window.restoreShiftModeMemory = restoreShiftModeMemory;
  window.renameShift = renameShift;
  window.rebalanceShift = rebalanceShift;
  window.startShiftReview = startShiftReview;
  window.reviewSetStatus = reviewSetStatus;
  window.reviewPrev = reviewPrev;
  window.reviewSkip = reviewSkip;
  window.closeQuickReview = closeQuickReview;
  window.renderQuickReview = renderQuickReview;
  
  // Registrar módulo en el bridge
  if (window.NexoBridge) {
    window.NexoBridge.register('shifts');
  } else {
    console.warn('[SHIFTS-MEMORY] NexoBridge no disponible');
  }
  
  console.log('[SHIFTS-MEMORY] ✅ Módulo de turnos cargado');
})();
