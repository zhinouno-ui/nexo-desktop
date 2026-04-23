(function () {
  function state() { return window.AppState; }
  function elements() { return window.elements || {}; }
  function actions() { return window.NexoActions || {}; }
  function storageKey() { return `shiftMode:${state().activeProfileId || 'default'}`; }

  function persistShiftModeMemory() {
    try {
      // Solo guardar nombres de operadores — la queue se reconstruye siempre desde contactos
      const slim = {};
      const sm = state().shiftMode || {};
      ['tm', 'tt', 'tn'].forEach(s => { slim[s] = { name: sm[s]?.name || s.toUpperCase() }; });
      localStorage.setItem(storageKey(), JSON.stringify(slim));
    } catch (_) {}
  }

  function restoreShiftModeMemory() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        ['tm', 'tt', 'tn'].forEach(s => {
          if (parsed[s]?.name) state().shiftMode[s].name = parsed[s].name;
        });
      }
    } catch (_) {}
  }

  function buildShiftQueue(shift) {
    const pid = state().activeProfileId || 'default';
    const now = Date.now();
    // Lapsos de recontacto por estado
    const RECONTACT_REVISADO_MS  = 2  * 86400000; // 48hs — alineado con isRecontactDue
    const RECONTACT_CONTACTADO_MS = 2  * 86400000; // 48hs — fue contactado, sin respuesta
    const RECONTACT_JUGANDO_MS   = 7  * 86400000; // 7 días — ya juega, recontactar semanalmente
    const RECONTACT_SINWSP_MS    = 14 * 86400000; // 14 días — sin wsp, intentar de nuevo más tarde
    // Cooldown post-skip: al saltar un recontacto, no reaparece por X tiempo
    const SKIP_COOLDOWN_MS = 12 * 3600000; // 12 horas

    const filtered = state().contacts.filter((contact) => {
      if ((contact.profileId || 'default') !== pid) return false;
      if (contact.assignedShift !== shift) return false;
      // Excluir ya revisados en este turno
      if (contact.shiftReviewedByShift === shift) return false;
      // Excluidos permanentes
      if (contact.status === 'no interesado') return false;

      // Cooldown post-skip: respetar lapso desde el último skip (cualquier turno)
      if (contact.shiftSkippedAt) {
        const skipTs = new Date(contact.shiftSkippedAt).getTime();
        if (!isNaN(skipTs) && (now - skipTs) < SKIP_COOLDOWN_MS) return false;
      }

      const statusTs = contact.lastUpdated ? new Date(contact.lastUpdated).getTime() : 0;

      if (contact.status === 'sin revisar') return true;
      if (contact.status === 'revisado')   return (now - statusTs) > RECONTACT_REVISADO_MS;
      if (contact.status === 'contactado') return (now - statusTs) > RECONTACT_CONTACTADO_MS;
      if (contact.status === 'jugando')    return (now - statusTs) > RECONTACT_JUGANDO_MS;
      if (contact.status === 'sin wsp')    return (now - statusTs) > RECONTACT_SINWSP_MS;
      return false;
    });

    // Separar en dos baldes: frescos (sin revisar) y recontactos (el resto)
    const fresh = [];
    const recon = [];
    for (const c of filtered) {
      if (c.status === 'sin revisar') fresh.push(c);
      else recon.push(c);
    }
    const tsOf = (c) => new Date(c.lastUpdated || 0).getTime();
    fresh.sort((a, b) => tsOf(a) - tsOf(b));
    recon.sort((a, b) => tsOf(a) - tsOf(b));

    // Intercalar: cada `spacing` usuarios frescos, insertar 1 de recontacto.
    // Spacing entre 8 y 15: suficientemente frecuente para que aparezcan recontactos
    // espaciados sin apelotonarse ni quedar todos al final de la cola.
    if (recon.length === 0) return fresh;
    if (fresh.length === 0) return recon;
    const rawSpacing = Math.floor(fresh.length / (recon.length + 1));
    const spacing = Math.max(8, Math.min(15, rawSpacing));
    const merged = [];
    let fi = 0, ri = 0;
    while (fi < fresh.length) {
      const chunkEnd = Math.min(fi + spacing, fresh.length);
      while (fi < chunkEnd) merged.push(fresh[fi++]);
      if (ri < recon.length) merged.push(recon[ri++]);
    }
    // Cola: cualquier recontacto sobrante al final
    while (ri < recon.length) merged.push(recon[ri++]);
    return merged;
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
    const isReactivating = contact.status === 'revisado';
    const isColdRevisado = isReactivating && (!contact.ops?.lastCargaAt || Date.now() - new Date(contact.ops.lastCargaAt).getTime() > 30 * 86400000);
    const isJugandoRecontact  = contact.status === 'jugando';
    const isSinWspRecontact   = contact.status === 'sin wsp';
    const isContactadoRecontact = contact.status === 'contactado';
    const phoneTxt = contact.phone || 'Sin teléfono';
    const initials = (contact.name || '?').trim().slice(0, 2).toUpperCase();
    const escapedName = (contact.name || '').replace(/'/g, "\\'");
    const escapedPhone = (contact.phone || '').replace(/'/g, "\\'");
    const totalInQueue = mode.queue.length;
    
    // Calcular chip de operaciones afuera del template literal
    let opsChipHtml = '';
    if (contact.ops) {
      const lastCargaDate = contact.ops.lastCargaAt ? new Date(contact.ops.lastCargaAt) : null;
      const lastCargaStr = lastCargaDate ? lastCargaDate.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }) : 'N/D';
      const loyalty = Math.round(contact.ops.loyalty || 0);
      const cargas = contact.ops.cargasCount || 0;
      const neto = Math.round(contact.ops.netoTotal || 0);
      opsChipHtml = `<span style="display:inline-block;padding:2px 10px;border-radius:20px;background:rgba(102,51,153,.15);border:1px solid rgba(102,51,153,.4);color:#d8b4fe;white-space:nowrap;">📊 ${lastCargaStr} · ${loyalty}% · ↑${cargas} · $${neto}</span>`;
    }
    
    ui.quickReview.style.display = 'block';
    ui.quickReview.innerHTML = `
      <div class="quick-layout" style="border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.38);">
        <div class="quick-profile">
          <div class="quick-profile-head">
            <div class="quick-avatar">${initials}</div>
            <div>
              <div class="quick-name copyable" onclick="copyToClipboard('${escapedName}', event)" title="Click para copiar usuario"><i class="fas fa-copy" style="font-size:.78rem;opacity:.8"></i>${contact.name}</div>
              ${isColdRevisado ? '<div style="font-size:10px;font-weight:700;color:#4ade80;background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.35);border-radius:4px;padding:2px 6px;margin-top:3px;display:inline-block;">🟢 Vuelto Al Ruedo — RECONTACTAR! Frío 1 Mes</div>' : ''}
              <div class="quick-meta">${phoneTxt} · ${contact.origin || '-'}</div>
            </div>
          </div>
          <div class="quick-chips">
            <span class="quick-chip">Turno ${shift.toUpperCase()}</span>
            <span class="quick-chip">Operador: ${appState.shiftMode[shift].name}</span>
            <span class="quick-chip">Competencia: Pendiente</span>
            <span class="quick-chip">Cuenta para: ${actions().getLocalCompetitionShift?.(new Date()).toUpperCase()}</span>
            ${isColdRevisado
              ? '<span class="quick-chip" style="background:rgba(74,222,128,.12);border-color:rgba(74,222,128,.4);color:#4ade80;">🟢 Recontactar</span>'
              : isReactivating
                ? '<span class="quick-chip" style="background:rgba(239,68,68,.18);border-color:rgba(239,68,68,.5);color:#fca5a5;">🔥 Reactivando</span>'
                : isContactadoRecontact
                  ? '<span class="quick-chip" style="background:rgba(251,191,36,.12);border-color:rgba(251,191,36,.45);color:#fde68a;">📞 Sin respuesta — Reintentar</span>'
                  : isJugandoRecontact
                    ? '<span class="quick-chip" style="background:rgba(16,185,129,.12);border-color:rgba(16,185,129,.4);color:#6ee7b7;">🎮 Seguimiento jugador</span>'
                    : isSinWspRecontact
                      ? '<span class="quick-chip" style="background:rgba(156,163,175,.12);border-color:rgba(156,163,175,.4);color:#d1d5db;">📵 Reintentar WSP</span>'
                      : ''}
          </div>
          <div class="quick-progress">Quedan ${totalInQueue} en cola esta sesión</div>
        </div>
        <div class="quick-panel">
          <div class="quick-topbar">
            <div style="display:flex;flex-direction:column;gap:4px;">
              <h3 style="margin:0;">Revisión rápida ${shift.toUpperCase()}</h3>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:nowrap;overflow-x:auto;padding:0 0 4px 0;font-weight:700;font-size:.7rem;">
                <span style="display:inline-block;padding:2px 10px;border-radius:20px;background:rgba(59,130,246,.18);border:1px solid rgba(59,130,246,.4);color:#93c5fd;white-space:nowrap;">Competencia: ${actions().getLocalCompetitionShift?.(new Date()).toUpperCase() || shift.toUpperCase()}</span>
                <span style="display:inline-block;padding:2px 10px;border-radius:20px;background:rgba(16,185,129,.13);border:1px solid rgba(16,185,129,.35);color:#6ee7b7;white-space:nowrap;">Op: ${appState.shiftMode[shift].name}</span>
                ${opsChipHtml}
              </div>
            </div>
            <button class="btn" onclick="closeQuickReview()"><i class="fas fa-times"></i> Cerrar</button>
          </div>
          <div class="review-actions">
            ${(window.STATUS_OPTIONS || []).filter(opt => {
              if (isColdRevisado)         return opt.id === 'contactado' || opt.id === 'sin wsp';
              if (isReactivating)         return opt.id === 'jugando'    || opt.id === 'sin wsp';
              if (isContactadoRecontact)  return opt.id === 'jugando'    || opt.id === 'sin wsp';
              if (isJugandoRecontact)     return opt.id === 'contactado' || opt.id === 'jugando';
              if (isSinWspRecontact)      return opt.id === 'contactado' || opt.id === 'sin wsp';
              return true; // sin revisar → todos los botones
            }).map((option) => `<button class="btn quick-status-btn ${option.id.replace(/ /g, '-')}" onclick="reviewSetStatus(${contact.id}, '${option.id}', event)"><i class="fas ${option.icon}"></i> ${option.label}</button>`).join('')}
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
      unreviewed.forEach((contact) => { contact.assignedShift = seq[index % 3]; contact.shiftSkippedByShift = null; contact.shiftSkippedAt = null; index += 1; });
      actions().renderShiftsView?.();
      persistShiftModeMemory();
      actions().saveData?.();
      actions().showNotification?.('Turnos rebalanceados (global)', 'success');
      return;
    }
    const pid2 = state().activeProfileId || 'default';
    const shiftContacts = state().contacts.filter((contact) => (contact.profileId || 'default') === pid2 && contact.assignedShift === shift && contact.status === 'sin revisar');
    shiftContacts.forEach((contact) => { contact.shiftReviewed = false; contact.shiftSkippedByShift = null; contact.shiftSkippedAt = null; });
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
    // Limpiar skip/cooldown al procesar el contacto
    const liveContact = state().contacts.find(c => c.id === id);
    if (liveContact) {
      liveContact.shiftSkippedByShift = null;
      liveContact.shiftSkippedAt = null;
    }
    window.changeContactStatus(id, status, null, 'shift', { shift: shift });
    setTimeout(() => {
      mode.queue.splice(mode.cursor, 1);
      persistShiftModeMemory();
      renderQuickReview();
      // renderShiftsView() se saca del hot path: es un full-scan de 3 turnos.
      // La tarjeta visible por detrás se refrescará por inactividad (30s).
    }, 130);
  }

  function reviewPrev() {
    actions().showNotification?.('Retroceso deshabilitado en modo competencia para no romper la cola', 'warning');
  }

  function reviewSkip() {
    const shift = state().activeShift;
    if (!shift) return;
    const mode = state().shiftMode[shift];
    if (!mode.queue.length) return;
    const skipped = mode.queue.splice(mode.cursor, 1)[0];
    if (skipped) {
      // Cooldown post-skip: 12hs de silencio para que no reaparezca
      const live = state().contacts.find(c => c.id === skipped.id);
      if (live) {
        live.shiftSkippedByShift = shift;
        live.shiftSkippedAt = new Date().toISOString();
      }
      actions().saveData?.();
    }
    persistShiftModeMemory();
    renderQuickReview();
  }

  function closeQuickReview() {
    state().activeShift = null;
    persistShiftModeMemory();
    const _qr = elements().quickReview;
    if (_qr) _qr.style.display = 'none';
    // Refrescar stats al cerrar
    try { actions().updateStats?.(); } catch (_) {}
    try { actions().renderShiftsView?.(); } catch (_) {}
    // Mostrar resumen de fin de turno si estamos en xx:45–xx:55
    try {
      if (typeof window.showShiftSummaryOverlay === 'function') {
        window.showShiftSummaryOverlay('manual');
      }
    } catch (_) {}
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
