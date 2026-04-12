/**
 * nexo-ui.js — Módulo de renderizado de Nexo Desktop
 * Plantillas HTML de tarjetas/lista + virtualización de scroll.
 * Accede al estado vía window.AppState y window.elements (resueltos en runtime).
 * Expone: window.NexoUI
 */
(function () {
    'use strict';

    // Getters lazy — se resuelven en tiempo de llamada, no de carga
    function _AS() { return window.AppState; }
    function _EL() { return window.elements || {}; }
    function _Eng() { return window.NexoEngine || {}; }

    // ─── OPS mini chip ────────────────────────────────────────────────────────

    // Calcula el turno predominante a partir del histograma horario (24 slots)
    function _calcDominantShift(hourHist) {
        if (!Array.isArray(hourHist) || hourHist.length < 24) return null;
        var tm = 0, tt = 0, tn = 0;
        for (var h = 0; h < 24; h++) {
            var v = hourHist[h] || 0;
            if (h >= 6 && h <= 13)       tm += v;
            else if (h >= 14 && h <= 21) tt += v;
            else                          tn += v;  // 22-23 + 0-5
        }
        var total = tm + tt + tn;
        if (!total) return null;
        var dominant = (tm >= tt && tm >= tn) ? 'tm' : (tt >= tn ? 'tt' : 'tn');
        var pct = Math.round((Math.max(tm, tt, tn) / total) * 100);
        var detail = { tm: Math.round(tm/total*100), tt: Math.round(tt/total*100), tn: Math.round(tn/total*100) };
        return { shift: dominant, pct: pct, detail: detail };
    }

    var _SHIFT_META = {
        tm: { emoji: '🌅', label: 'TM', title: 'Mañana 06-14h', cls: 'shift-tm' },
        tt: { emoji: '☀️',  label: 'TT', title: 'Tarde 14-22h',  cls: 'shift-tt' },
        tn: { emoji: '🌙', label: 'TN', title: 'Noche 22-06h',  cls: 'shift-tn' }
    };

    function getOpsMiniHtml(contact) {
        if (!contact.ops) return '';
        const o = contact.ops;
        const heat = o.heat || _Eng().getOpsHeatLabel(o.lastCargaAt);
        const last = o.lastCargaAt ? new Date(o.lastCargaAt).toLocaleString('es-ES') : '-';
        const topHours = (o.topHours || []).join(' / ') || '-';

        // Turno dominante calculado en tiempo de render desde hourHist
        const ds = _calcDominantShift(o.hourHist);
        const shiftMeta = ds ? _SHIFT_META[ds.shift] : null;
        const shiftChip = shiftMeta
            ? `<span class="ops-chip ${shiftMeta.cls}" title="${shiftMeta.title}">${shiftMeta.emoji} Líder: ${shiftMeta.label} ${ds.pct}%</span>`
            : '';
        const shiftTooltipLine = ds && shiftMeta
            ? `<div class="line"><span>Distribución turnos</span><strong>${_SHIFT_META.tm.emoji}${ds.detail.tm}% ${_SHIFT_META.tt.emoji}${ds.detail.tt}% ${_SHIFT_META.tn.emoji}${ds.detail.tn}%</strong></div>`
            : '';

        return `
            <div class="ops-chip-row">
                <span class="ops-chip ${heat.cls}">${heat.text}</span>
                <span class="ops-chip">↑${o.cargasCount || 0} ↓${o.descargasCount || 0}</span>
                <span class="ops-chip">Σ $${Math.round(o.netoTotal || 0)}</span>
                <span class="ops-chip">Score ${o.score || 0}</span>
                ${shiftChip}
                <div class="ops-info-wrap">
                    <button class="ops-info-btn" type="button" onclick="event.stopPropagation()">ℹ️</button>
                    <div class="ops-tooltip" onclick="event.stopPropagation()">
                        <div class="line"><span>Última actividad</span><strong>${last}</strong></div>
                        <div class="line"><span>Promedio / Mediana</span><strong>$${Math.round(o.avgCarga || 0)} / $${Math.round(o.medianCarga || 0)}</strong></div>
                        <div class="line"><span>Cargado 30d / 90d</span><strong>$${Math.round(o.cargado30d || 0)} / $${Math.round(o.cargado90d || 0)}</strong></div>
                        <div class="line"><span>Horas top</span><strong>${topHours}</strong></div>
                        ${shiftTooltipLine}
                        <div class="line"><span>Lealtad</span><strong>${o.loyalty || 0}/4</strong></div>
                        <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                            <button class="btn" style="padding:4px 8px;font-size:.72rem;" onclick="applyOpsSuggestion(${contact.id}, event)">Aplicar ${o.suggestedStatus || 'sin revisar'}</button>
                            <button class="btn" style="padding:4px 8px;font-size:.72rem;" onclick="pinContact(${contact.id}, event)">${contact.pinned ? 'Desfijar' : 'Pin'}</button>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // ─── Urgencia de exportación ──────────────────────────────────────────────

    function getExportUrgency() {
        const now = new Date();
        const slots = [5, 13, 21];
        let lastScheduled = null;
        for (let i = slots.length - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setHours(slots[i], 0, 0, 0);
            if (d <= now) { lastScheduled = d; break; }
        }
        if (!lastScheduled) {
            lastScheduled = new Date(now);
            lastScheduled.setDate(now.getDate() - 1);
            lastScheduled.setHours(21, 0, 0, 0);
        }
        const lastExport = localStorage.getItem('lastExportAt');
        if (lastExport && new Date(lastExport) >= lastScheduled) return null;
        const overdueH = (now - lastScheduled) / 36e5;
        if (overdueH < 0.01) return null;
        if (overdueH < 8) return { level: 1, text: 'Pendiente', next: lastScheduled };
        if (overdueH < 16) return { level: 2, text: 'Atrasado', next: lastScheduled };
        return { level: 3, text: 'Urgente', next: lastScheduled };
    }

    function updateExportUrgencyBadge() {
        const btn = _EL().exportBtn;
        if (!btn) return;
        btn.classList.remove('export-urgency-1', 'export-urgency-2', 'export-urgency-3');
        const urgency = getExportUrgency();
        const icon = '<i class="fas fa-download"></i>';
        if (!urgency) {
            btn.innerHTML = `${icon} Exportar`;
            btn.title = 'Exportar';
            return;
        }
        btn.classList.add(`export-urgency-${urgency.level}`);
        btn.innerHTML = `${icon} Exportar <span class="urgency-badge urgency-l${urgency.level}">${urgency.text}</span>`;
        btn.title = `Recordatorio de exportación (${urgency.next.toLocaleString('es-ES')})`;
    }

    // ─── Plantilla tarjeta ────────────────────────────────────────────────────

    function createCard(contact) {
        const AppState = _AS();
        const { getStatusOption, getContactUrgency, getMessageSentBadge, isRecontactDue } = _Eng();
        const statusOption = getStatusOption(contact.status);
        const escapedName = (contact.name || '').replace(/'/g, "\\'");
        const escapedPhone = (contact.phone || '').replace(/'/g, "\\'");
        const urgency = getContactUrgency(contact);
        const sentBadge = getMessageSentBadge(contact);
        const opsMini = getOpsMiniHtml(contact);
        const editedAtLabel = contact.lastEditedAt ? new Date(contact.lastEditedAt).toLocaleString('es-ES') : '-';
        const isRecontact = isRecontactDue(contact);

        return `
            <div class="contact-card ${AppState.selectedContacts.has(contact.id) ? 'selected' : ''} ${contact.isDuplicate ? 'duplicate' : ''} ${contact.pinned ? 'pinned-card' : ''}" style="--status-rgb: ${statusOption.rgb};" data-id="${contact.id}">
                ${contact.pinned ? '<span class="pin-badge"><i class="fas fa-thumbtack"></i> PIN</span>' : ''}${contact.isDuplicate ? '<span class="duplicate-badge"><i class="fas fa-exclamation-triangle"></i> DUP</span>' : ''}${contact.phoneAlert ? '<span class="duplicate-badge" style="right:8px;left:auto;background:rgba(245,158,11,.22);border-color:rgba(245,158,11,.45);" title="Teléfono sospechoso"><i class="fas fa-exclamation-circle"></i> ALERTA</span>' : ''}${isRecontact ? '<span class="duplicate-badge" style="right:45px;left:auto;background:rgba(34,197,94,.22);border-color:rgba(34,197,94,.45);" title="Re-contactar en 48h"><i class="fas fa-redo"></i> RE-CONTACTAR</span>' : ''}
                <input type="checkbox" class="card-checkbox" ${AppState.selectedContacts.has(contact.id) ? 'checked' : ''}>
                <div class="card-header">
                    <div class="card-icon" style="color: ${statusOption.color};">
                        <i class="fas ${statusOption.icon}"></i>
                    </div>
                    <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
                        <span class="card-name" onclick="copyToClipboard('${escapedName}', event)" style="cursor: pointer; flex: 1;" title="Click para copiar">${contact.phoneAlert ? '⚠️ ' : ''}${contact.name}</span>${AppState.currentView === 'shifts' && contact.assignedShift ? `<span class=\"shift-tag\">${contact.assignedShift.toUpperCase()}</span>` : ''}${urgency ? `<span class=\"urgency-badge urgency-l${urgency.level}\" title=\"${urgency.title}\"><i class=\"fas fa-clock\"></i>${urgency.label}</span>` : ''}
                        <button class="btn" style="padding: 4px 8px; font-size: 0.75rem;" onclick="editContactField(${contact.id}, 'name', event)" title="Editar nombre">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        <button class="btn" style="padding: 4px 8px; font-size: 0.75rem;" onclick="openContactHistory(${contact.id}, event)" title="Historial del usuario">
                            <i class="fas fa-id-card"></i>
                        </button>
                    </div>
                </div>
                <div class="card-details">
                    ${contact.phone ? `
                        <div class="detail-item">
                            <i class="fas fa-phone"></i>
                            <span onclick="copyToClipboard('${escapedPhone}', event)" style="cursor: pointer; flex: 1;" title="Click para copiar">${contact.phone}</span>
                            <button class="btn" style="padding: 4px 8px; font-size: 0.7rem;" onclick="editContactField(${contact.id}, 'phone', event)" title="Editar">
                                <i class="fas fa-pencil-alt"></i>
                            </button>
                            <button class="btn btn-success" style="padding: 4px 8px; font-size: 0.7rem;" onclick="openWhatsApp('${escapedPhone}', event)" title="WhatsApp">
                                <i class="fab fa-whatsapp"></i>
                            </button>
                            ${sentBadge}
                        </div>
                    ` : `<div class="detail-item"><i class="fas fa-phone"></i><span style="color: var(--text-secondary); flex:1;">Sin teléfono</span><button class="btn" style="padding: 4px 8px; font-size: 0.7rem;" onclick="editContactField(${contact.id}, 'phone', event)" title="Agregar teléfono"><i class="fas fa-pencil-alt"></i></button></div>`}
                    <div class="detail-item"><i class="fas fa-tag"></i><span>${contact.origin}</span></div>
                    <div class="detail-item">
                        <i class="fas fa-circle-notch"></i>
                        <span class="card-status-inline" id="cardStatusInline-${contact.id}"><span class="card-status-trigger" onclick="openCardStatusMenu(${contact.id}, event)"><span class="status-badge status-${contact.status.replace(/ /g, '-')}">${statusOption.label}</span><i class="fas fa-chevron-down"></i></span></span>
                    </div>
                </div>
                ${opsMini}
                <div class="card-footer">
                    <span><i class="fas fa-calendar"></i> ${new Date(contact.lastUpdated).toLocaleDateString('es-ES')}</span><span title="Última edición"><i class="fas fa-pen"></i> ${editedAtLabel}</span>
                    <button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.75rem;" onclick="deleteContact(${contact.id}, event)"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }

    // ─── Plantilla fila de lista ──────────────────────────────────────────────

    function createListItem(contact) {
        const AppState = _AS();
        const { getStatusOption, getMessageSentBadge } = _Eng();
        const statusOption = getStatusOption(contact.status);
        const escapedName = (contact.name || '').replace(/'/g, "\\'");
        const escapedPhone = (contact.phone || '').replace(/'/g, "\\'");
        const sentBadge = getMessageSentBadge(contact);
        const opsMini = getOpsMiniHtml(contact);
        const editedAtLabel = contact.lastEditedAt ? new Date(contact.lastEditedAt).toLocaleString('es-ES') : '-';

        return `
            <div class="list-item ${AppState.selectedContacts.has(contact.id) ? 'selected' : ''} ${contact.isDuplicate ? 'duplicate' : ''} ${contact.pinned ? 'pinned-row' : ''}" style="--status-rgb: ${statusOption.rgb};" data-id="${contact.id}">
                <div><input type="checkbox" ${AppState.selectedContacts.has(contact.id) ? 'checked' : ''}></div>
                <div class="list-item-name list-item-main" style="--status-color: ${statusOption.color}; --status-rgb: ${statusOption.rgb};">
                    <i class="fas ${statusOption.icon} list-status-bg-icon"></i>
                    <div class="list-name-row">
                        <span onclick="copyToClipboard('${escapedName}', event)" style="flex: 1; cursor: pointer;" title="Click para copiar">
                            ${contact.isDuplicate ? '<i class=\"fas fa-exclamation-triangle\" style=\"color: var(--accent-warning);\"></i> ' : ''}${contact.phoneAlert ? '<i class=\"fas fa-exclamation-circle\" style=\"color: var(--accent-warning);\" title=\"Teléfono sospechoso\"></i> ' : ''}${contact.pinned ? '<span class=\"list-pin-badge\"><i class=\"fas fa-thumbtack\"></i> PIN</span> ' : ''}${contact.name}${AppState.currentView === 'shifts' && contact.assignedShift ? ` <span class=\"shift-tag\">${contact.assignedShift.toUpperCase()}</span>` : ''}
                        </span>
                        <button class="btn" style="padding: 4px 8px; font-size: 0.75rem;" onclick="editContactField(${contact.id}, 'name', event)" title="Editar">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                    </div>
                    <span class="list-status-chip"><i class="fas ${statusOption.icon}"></i>${statusOption.label}</span>${opsMini}
                </div>
                <div class="list-item-phone">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span onclick="copyToClipboard('${escapedPhone}', event)" style="flex: 1; font-family: monospace; cursor: pointer;" title="Click para copiar">${contact.phone || 'Sin teléfono'}</span>
                        <button class="btn" style="padding: 4px 8px; font-size: 0.75rem;" onclick="editContactField(${contact.id}, 'phone', event)" title="${contact.phone ? 'Editar' : 'Agregar teléfono'}">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                    </div>
                </div>
                <div class="list-item-origin">${contact.origin}</div>
                <div class="list-item-date" title="Última edición: ${editedAtLabel}">${new Date(contact.lastUpdated).toLocaleDateString('es-ES')}<br><small style="color:var(--text-secondary);">✎ ${editedAtLabel.split(',')[0] || editedAtLabel}</small></div>
                <div class="whatsapp-cell">
                    ${contact.phone ? `
                        <button class="btn whatsapp-btn" onclick="openWhatsApp('${escapedPhone}', event)" title="Abrir WhatsApp">
                            <i class="fab fa-whatsapp"></i>
                        </button>
                        ${sentBadge}
                    ` : '<span style="color: var(--text-secondary); font-size: 0.8rem;">-</span>'}
                </div>
                <div class="status-buttons">
                    <button class="status-btn sin-revisar ${contact.status === 'sin revisar' ? 'active' : ''}" onclick="changeContactStatus(${contact.id}, 'sin revisar', event)" title="Sin Revisar"><i class="fas fa-circle"></i></button>
                    <button class="status-btn contactado ${contact.status === 'contactado' ? 'active' : ''}" onclick="changeContactStatus(${contact.id}, 'contactado', event)" title="Contactado"><i class="fas fa-check"></i></button>
                    <button class="status-btn revisado ${contact.status === 'revisado' ? 'active' : ''}" onclick="changeContactStatus(${contact.id}, 'revisado', event)" title="Revisado"><i class="fas fa-user-check"></i></button>
                    <button class="status-btn jugando ${contact.status === 'jugando' ? 'active' : ''}" onclick="changeContactStatus(${contact.id}, 'jugando', event)" title="Jugando"><i class="fas fa-gamepad"></i></button>
                    <button class="status-btn sin-wsp ${contact.status === 'sin wsp' ? 'active' : ''}" onclick="changeContactStatus(${contact.id}, 'sin wsp', event)" title="Sin WhatsApp"><i class="fas fa-ban"></i></button>
                    <button class="status-btn no-interesado ${contact.status === 'no interesado' ? 'active' : ''}" onclick="changeContactStatus(${contact.id}, 'no interesado', event)" title="No Interesado"><i class="fas fa-times"></i></button>
                    <button class="btn" style="padding: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;" onclick="openContactHistory(${contact.id}, event)" title="Historial por usuario"><i class="fas fa-id-card"></i></button>
                    <button class="btn btn-danger" style="padding: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;" onclick="deleteContact(${contact.id}, event)" title="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }

    // ─── Renderizado virtualizado (scroll infinito por ventana) ───────────────

    function renderPaginatedView(renderFunc) {
        const AppState = _AS();
        const elements = _EL();
        const start = (AppState.currentPage - 1) * AppState.itemsPerPage;
        const end = start + AppState.itemsPerPage;
        const pageContacts = AppState.filteredContacts.slice(start, end);

        if (pageContacts.length === 0 && AppState.filteredContacts.length > 0 && AppState.currentPage > 1) {
            const totalPages = Math.max(1, Math.ceil(AppState.filteredContacts.length / AppState.itemsPerPage));
            AppState.currentPage = Math.min(AppState.currentPage, totalPages);
            renderPaginatedView(renderFunc);
            return;
        }

        const renderContactsStartedAt = performance.now();
        const MAX_DOM_NODES = 120;

        if (AppState.currentView === 'cards') {
            elements.cardsView.classList.add('virtual-scroll');
            const scroller = elements.cardsView;
            const cardWidth = 320;
            const cols = Math.max(1, Math.floor((scroller.clientWidth || window.innerWidth || 1200) / cardWidth));
            const rowHeight = AppState.virtualization.cards.itemHeight;
            const bufferRows = AppState.virtualization.cards.bufferRows;
            const totalRows = Math.ceil(pageContacts.length / cols);
            const viewRows = Math.max(1, Math.ceil((scroller.clientHeight || 680) / rowHeight));
            const firstRow = Math.max(0, Math.floor((AppState.virtualization.cards.scrollTop || 0) / rowHeight) - bufferRows);
            const rowWindow = Math.max(1, Math.min(totalRows, viewRows + bufferRows * 2));
            const startIndex = firstRow * cols;
            const endIndex = Math.min(pageContacts.length, Math.min(startIndex + (rowWindow * cols), startIndex + MAX_DOM_NODES));
            const renderContacts = pageContacts.slice(startIndex, endIndex);
            const topPad = firstRow * rowHeight;
            const bottomPad = Math.max(0, (totalRows - Math.ceil(endIndex / cols)) * rowHeight);
            AppState.perfStats.domItems = renderContacts.length;
            scroller.innerHTML = renderContacts.length > 0
                ? `<div class="virtual-spacer" style="height:${topPad}px"></div>${renderContacts.map(renderFunc).join('')}<div class="virtual-spacer" style="height:${bottomPad}px"></div>`
                : '<div style="text-align: center; padding: 50px; color: var(--text-secondary); grid-column: 1 / -1;">No se encontraron contactos</div>';

            if (!scroller.dataset.virtualBound) {
                scroller.dataset.virtualBound = '1';
                let ticking = false;
                scroller.addEventListener('scroll', () => {
                    _AS().virtualization.cards.scrollTop = scroller.scrollTop || 0;
                    if (ticking) return;
                    ticking = true;
                    requestAnimationFrame(() => {
                        ticking = false;
                        if (_AS().currentView === 'cards') renderPaginatedView(createCard);
                    });
                }, { passive: true });
            }
        } else {
            elements.listView.classList.add('virtual-scroll');
            const scroller = elements.listView;
            const rowHeight = AppState.virtualization.list.itemHeight;
            const bufferRows = AppState.virtualization.list.bufferRows;
            const viewRows = Math.max(1, Math.ceil((scroller.clientHeight || 680) / rowHeight));
            const firstRow = Math.max(0, Math.floor((AppState.virtualization.list.scrollTop || 0) / rowHeight) - bufferRows);
            const visibleRows = Math.max(1, Math.min(pageContacts.length, viewRows + bufferRows * 2));
            const startIndex = firstRow;
            const endIndex = Math.min(pageContacts.length, Math.min(startIndex + visibleRows, startIndex + MAX_DOM_NODES));
            const renderContacts = pageContacts.slice(startIndex, endIndex);
            const topPad = startIndex * rowHeight;
            const bottomPad = Math.max(0, (pageContacts.length - endIndex) * rowHeight);
            AppState.perfStats.domItems = renderContacts.length;
            const listItems = renderContacts.map(renderFunc).join('');
            scroller.innerHTML = `
                <div class="list-header">
                    <div><input type="checkbox" id="selectAllCheckbox"></div>
                    <div>Nombre</div>
                    <div>Teléfono</div>
                    <div>Origen</div>
                    <div>Fecha</div>
                    <div>WhatsApp</div>
                    <div>Acciones</div>
                </div>
                <div class="virtual-spacer" style="height:${topPad}px"></div>
                ${listItems || '<div style="text-align: center; padding: 50px; color: var(--text-secondary); grid-column: 1 / -1;">No se encontraron contactos</div>'}
                <div class="virtual-spacer" style="height:${bottomPad}px"></div>
            `;
            const selectAllCheckbox = document.querySelector('#selectAllCheckbox');
            if (selectAllCheckbox) {
                const areAllOnPageSelected = renderContacts.length > 0 && renderContacts.every(c => _AS().selectedContacts.has(c.id));
                selectAllCheckbox.checked = areAllOnPageSelected;
                selectAllCheckbox.onchange = (e) => {
                    renderContacts.forEach(c => {
                        if (e.target.checked) _AS().selectedContacts.add(c.id);
                        else _AS().selectedContacts.delete(c.id);
                    });
                    renderPaginatedView(createListItem);
                    if (window.updateBulkActionsBar) window.updateBulkActionsBar();
                };
            }
            if (!scroller.dataset.virtualBound) {
                scroller.dataset.virtualBound = '1';
                let ticking = false;
                scroller.addEventListener('scroll', () => {
                    _AS().virtualization.list.scrollTop = scroller.scrollTop || 0;
                    if (ticking) return;
                    ticking = true;
                    requestAnimationFrame(() => {
                        ticking = false;
                        if (_AS().currentView === 'list') renderPaginatedView(createListItem);
                    });
                }, { passive: true });
            }
        }

        AppState.perfStats.renderContactsMs = Math.round(performance.now() - renderContactsStartedAt);
        renderPagination();
    }

    // ─── Controles de paginación ──────────────────────────────────────────────

    function renderPagination() {
        const AppState = _AS();
        const elements = _EL();
        const totalPages = Math.ceil(AppState.filteredContacts.length / AppState.itemsPerPage);
        if (totalPages <= 1) {
            elements.pagination.innerHTML = '';
            return;
        }
        let html = '';
        html += `<button ${AppState.currentPage === 1 ? 'disabled' : ''} onclick="changePage(${AppState.currentPage - 1})"><i class="fas fa-chevron-left"></i></button>`;

        const pagesToShow = [];
        pagesToShow.push(1);
        if (AppState.currentPage > 4) pagesToShow.push('...');
        for (let i = Math.max(2, AppState.currentPage - 2); i <= Math.min(totalPages - 1, AppState.currentPage + 2); i++) {
            pagesToShow.push(i);
        }
        if (AppState.currentPage < totalPages - 3) pagesToShow.push('...');
        if (totalPages > 1) pagesToShow.push(totalPages);

        const uniquePages = [...new Set(pagesToShow)];
        uniquePages.forEach(p => {
            if (p === '...') {
                html += '<span class="page-info">...</span>';
            } else {
                html += `<button class="${p === AppState.currentPage ? 'active' : ''}" onclick="changePage(${p})">${p}</button>`;
            }
        });

        html += `<button ${AppState.currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${AppState.currentPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
        html += `<span class="page-info">Página ${AppState.currentPage} de ${totalPages} (${AppState.filteredContacts.length} contactos)</span>`;
        html += `<input id="pageJumpInput" class="origin-input" style="margin-top:0;width:90px;" type="number" min="1" max="${totalPages}" value="${AppState.currentPage}" />`;
        html += `<button onclick="jumpToPage()" title="Ir a página">Ir</button>`;

        elements.pagination.innerHTML = html;
    }

    // ─── Registro público ─────────────────────────────────────────────────────

    window.NexoUI = {
        getOpsMiniHtml,
        getExportUrgency,
        updateExportUrgencyBadge,
        createCard,
        createListItem,
        renderPaginatedView,
        renderPagination
    };

    // Flip automático del tooltip: mide espacio disponible sin contar la scrollbar
    document.addEventListener('mouseover', function (e) {
        const wrap = e.target.closest('.ops-info-wrap');
        if (!wrap) return;
        const rect = wrap.getBoundingClientRect();
        // clientWidth excluye la scrollbar — evita que el tooltip quede oculto detrás de ella
        const visibleRight = document.documentElement.clientWidth;
        wrap.classList.toggle('flip-left', (visibleRight - rect.left) < 320);
    }, { passive: true });

    console.log('[NexoUI] ✅ Módulo de UI listo.');
})();
