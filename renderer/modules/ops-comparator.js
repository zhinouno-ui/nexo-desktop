// Comparador de diferencias entre fuente Agente (CSV) y Chunior (texto pegado).
// Vanilla JS, integrado al tema Nexo. Sin persistencia entre sesiones (one-shot).
// El CSV crudo de Agente sí se sube a Nexo via saveOpsRawUpload (alimenta opsProfiles).
(function () {
  const STATE = {
    agentFiles: [],
    chuniorText: '',
    pairs: [],
    ignoredIds: new Set(),
    isProcessing: false,
    fullscreen: false,
    autoFilteredOperator: null,  // operador detectado automáticamente
    filters: {
      fecha: '__ALL', agente: '__ALL', operador: '__ALL',
      billetera: '__ALL', turno: '__ALL', estado: '__ALL', movimiento: '__ALL'
    }
  };

  function appState() { return window.AppState || {}; }

  // ─── PARSING ──────────────────────────────────────────────────────────────
  function parseAmountRaw(raw) {
    if (raw === null || raw === undefined) return 0;
    let s = String(raw).trim();
    if (!s) return 0;
    s = s.replace(/[^\d,\.-]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function parseCSVLine(line, delimiter = ',') {
    const out = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === delimiter && !inQuotes) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function getTurnoFromDate(d) {
    if (!d || isNaN(d.getTime())) return '';
    const h = d.getHours();
    if (h >= 6 && h < 14) return 'TM';
    if (h >= 14 && h < 22) return 'TT';
    return 'TN';
  }

  function parseAgentLines(lines, labelA) {
    const rows = [];
    let startIndex = 0, format = null;
    if (lines.length === 0) return rows;
    if (lines[0].toLowerCase().startsWith('sep=')) startIndex = 1;
    const headerLine = lines[startIndex];
    if (headerLine) {
      const headerCols = parseCSVLine(headerLine);
      if (headerCols[3]?.toLowerCase() === 'cantidad' && headerCols[6]?.toLowerCase() === 'alias del jugador') format = 'sub';
      else if (headerCols[2]?.toLowerCase() === 'cantidad' && headerCols[4]?.toLowerCase() === 'alias') format = 'main';
      else return rows;
      startIndex++;
    }
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || !line.includes(',')) continue;
      const cols = parseCSVLine(line);
      if (cols.length < 5) continue;
      const fechaRaw = (cols[0] || '').trim();
      let montoRaw, usuarioRaw, tipoRaw;
      if (format === 'sub') { montoRaw = cols[3]; usuarioRaw = cols[6]; tipoRaw = cols[1]; }
      else { montoRaw = cols[2]; usuarioRaw = cols[4]; tipoRaw = cols[3]; }
      const monto = parseAmountRaw(montoRaw);
      const usuarioRaw2 = (usuarioRaw || '').trim();
      const usuario = normalizeUser(usuarioRaw2);
      const isAdminCharge = /te cargaron|ajuste/i.test(tipoRaw || '');
      let fechaObj = null;
      if (fechaRaw) {
        const attempt = new Date(fechaRaw.replace(' ', 'T'));
        fechaObj = isNaN(attempt.getTime()) ? new Date(fechaRaw) : attempt;
        if (isNaN(fechaObj.getTime())) fechaObj = null;
      }
      rows.push({ origen: 'A', etiqueta: labelA, fecha: fechaRaw, fechaObj, monto, usuario, isAdminCharge });
    }
    return rows;
  }

  function parseBLines(lines) {
    const rows = [];
    for (let raw of lines) {
      if (!raw.trim()) continue;
      let parts = raw.split(/\t+/).map(p => p.trim()).filter(Boolean);
      if (parts.length < 2) parts = raw.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
      if (parts.length > 0 && /^\d{7,}$/.test(parts[0])) parts.shift();
      if (parts.length >= 2 && /^\d{2}-\d{2}-\d{4}$/.test(parts[0]) && /^\d{2}:\d{2}:\d{2}$/.test(parts[1])) {
        parts[0] = parts[0] + ' ' + parts[1];
        parts.splice(1, 1);
      }
      if (parts.length < 4) continue;
      let [fechaRaw, operador, medioRaw, montoRaw, usuarioRaw] = parts;
      let medio = (medioRaw || '').replace(/.*-\s*/, '').trim();
      if (!medio) medio = (medioRaw || '').trim();
      const monto = parseAmountRaw(montoRaw);
      const usuario = normalizeUser(usuarioRaw || '');
      let fechaObj = null;
      if (fechaRaw) {
        const m = fechaRaw.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})/);
        if (m) fechaObj = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}`);
        else {
          const attempt = new Date(fechaRaw.replace(' ', 'T'));
          if (!isNaN(attempt.getTime())) fechaObj = attempt;
        }
      }
      rows.push({ origen: 'B', fecha: fechaRaw, fechaObj, monto, usuario, operador: (operador || '').toLowerCase().trim(), medio: (medio || '').toUpperCase().trim() });
    }
    return rows;
  }

  function normalizeUser(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes/acentos
      .replace(/[^a-z0-9]/g, '');                       // solo alfanumérico
  }

  function fmt(val) { return Number(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtTime(d) { if (!d || isNaN(d.getTime())) return ''; const p = n => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
  function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ─── LOADER ───────────────────────────────────────────────────────────────
  function showLoader(message = 'Procesando...') {
    let l = document.getElementById('opsCmpLoader');
    if (!l) {
      l = document.createElement('div');
      l.id = 'opsCmpLoader';
      l.className = 'ops-cmp-loader';
      l.innerHTML = `
        <div class="ops-cmp-loader-card">
          <div class="ops-cmp-loader-spinner"><i class="fas fa-balance-scale"></i></div>
          <div class="ops-cmp-loader-text" id="opsCmpLoaderText">${escapeHtml(message)}</div>
          <div class="ops-cmp-loader-sub" id="opsCmpLoaderSub">Esto puede tardar unos segundos…</div>
        </div>
      `;
      document.body.appendChild(l);
    } else {
      const t = l.querySelector('#opsCmpLoaderText');
      if (t) t.textContent = message;
    }
    l.classList.add('active');
  }
  function updateLoader(msg, sub) {
    const t = document.getElementById('opsCmpLoaderText');
    const s = document.getElementById('opsCmpLoaderSub');
    if (t && msg) t.textContent = msg;
    if (s && sub != null) s.textContent = sub;
  }
  function hideLoader() {
    const l = document.getElementById('opsCmpLoader');
    if (l) l.classList.remove('active');
  }

  // ─── MATCHING ─────────────────────────────────────────────────────────────
  async function processData() {
    if (STATE.isProcessing) return;
    STATE.isProcessing = true;
    STATE.ignoredIds = new Set();
    STATE.autoFilteredOperator = null;
    STATE.filters.operador = '__ALL';
    showLoader('Procesando...');

    // Yield para que el loader se pinte
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));

    let rowsA = [];
    try {
      updateLoader('Leyendo CSVs de Agente...', `${STATE.agentFiles.length} archivo(s)`);
      for (const f of STATE.agentFiles) {
        const text = await f.text();
        const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
        const labelMatch = f.name.match(/(agente|subagente|fuente|a)_?([a-zA-Z0-9]+)/i);
        const labelA = labelMatch?.[2]?.toLowerCase() || f.name.replace(/\.csv$/i, '');
        rowsA = rowsA.concat(parseAgentLines(lines, labelA));
        // Subir CSV crudo a Nexo (alimenta opsProfiles)
        if (window.electronAPI?.saveOpsRawUpload) {
          window.electronAPI.saveOpsRawUpload({
            profileId: appState().activeProfileId || 'default',
            filename: f.name,
            content: text
          }).catch(() => {});
        }
      }
    } catch (e) {
      hideLoader();
      alert('Error leyendo CSVs de Agente: ' + e.message);
      STATE.isProcessing = false; renderRoot(); return;
    }

    updateLoader('Procesando texto Chunior...', '');
    await new Promise(r => setTimeout(r, 0));
    const rowsB = parseBLines(STATE.chuniorText.split(/\r?\n/).filter(l => l.trim() !== ''));
    rowsA.forEach(r => { r.turno = r.fechaObj ? getTurnoFromDate(r.fechaObj) : ''; r.tipoMovimiento = r.monto < 0 ? 'EGRESO' : 'INGRESO'; });
    rowsB.forEach(r => { r.turno = r.fechaObj ? getTurnoFromDate(r.fechaObj) : ''; r.tipoMovimiento = r.monto < 0 ? 'EGRESO' : 'INGRESO'; });

    // Recortar rowsA al rango temporal de Chunior.
    // Si Chunior va 23:00→00:00, el CSV del agente puede tener miles de filas
    // de otros días/horarios que solo generan discrepancias falsas y lentitud.
    let chuniorMinTs = Infinity, chuniorMaxTs = -Infinity;
    rowsB.forEach(r => {
      if (!r.fechaObj) return;
      const t = r.fechaObj.getTime();
      if (t < chuniorMinTs) chuniorMinTs = t;
      if (t > chuniorMaxTs) chuniorMaxTs = t;
    });
    const MARGIN_MS = 30 * 60 * 1000; // 30 min de margen para desfases de reloj
    if (chuniorMinTs !== Infinity) {
      const before = rowsA.length;
      const lo = chuniorMinTs - MARGIN_MS;
      const hi = chuniorMaxTs + MARGIN_MS;
      rowsA = rowsA.filter(r => {
        if (!r.fechaObj) return false; // sin fecha parseable → excluir
        const t = r.fechaObj.getTime();
        return t >= lo && t <= hi;
      });
      updateLoader('Recortando al rango Chunior...', `${before} → ${rowsA.length} filas de agente`);
      await new Promise(r => setTimeout(r, 0));
    }
    STATE.chuniorRange = chuniorMinTs !== Infinity ? { from: chuniorMinTs, to: chuniorMaxTs } : null;

    // Detectar último operador en Chunior (por fecha más reciente)
    let lastOperator = null;
    let lastTs = -Infinity;
    rowsB.forEach(r => {
      if (r.operador && r.fechaObj) {
        const t = r.fechaObj.getTime();
        if (t > lastTs) { lastTs = t; lastOperator = r.operador; }
      }
    });
    if (lastOperator) {
      STATE.autoFilteredOperator = lastOperator;
      STATE.filters.operador = lastOperator;
    }

    updateLoader('Conciliando movimientos...', `${rowsA.length} A ↔ ${rowsB.length} B`);
    await new Promise(r => setTimeout(r, 0));

    const newPairs = [];
    const matchedB = new Set();
    let id = 0;
    rowsA.forEach(a => {
      if (a.isAdminCharge) {
        newPairs.push({ id: `admin-${id++}`, a, b: null, estado: 'OK', tipoMovimiento: a.tipoMovimiento });
      } else {
        let mIdx = -1;
        for (let j = 0; j < rowsB.length; j++) {
          if (matchedB.has(j)) continue;
          const b = rowsB[j];
          if (a.usuario === b.usuario && Math.abs(a.monto - b.monto) < 0.01) { mIdx = j; break; }
        }
        if (mIdx >= 0) {
          matchedB.add(mIdx);
          newPairs.push({ id: `match-${id++}`, a, b: rowsB[mIdx], estado: 'OK', tipoMovimiento: a.tipoMovimiento });
        } else {
          newPairs.push({ id: `a-miss-${id++}`, a, b: null, estado: 'MISSING_CHUNIOR', tipoMovimiento: a.tipoMovimiento });
        }
      }
    });
    for (let j = 0; j < rowsB.length; j++) {
      if (!matchedB.has(j)) newPairs.push({ id: `b-miss-${j}`, a: null, b: rowsB[j], estado: 'MISSING_AGENT', tipoMovimiento: rowsB[j].tipoMovimiento });
    }
    newPairs.sort((x, y) => {
      const dx = x.a?.fechaObj || x.b?.fechaObj;
      const dy = y.a?.fechaObj || y.b?.fechaObj;
      return (dx?.getTime() || 0) - (dy?.getTime() || 0);
    });

    STATE.pairs = newPairs;
    STATE.isProcessing = false;
    hideLoader();
    renderRoot();
    if (lastOperator) {
      window.NexoActions?.showNotification?.(`Filtrado por último operador: ${lastOperator.toUpperCase()}`, 'info');
    }
  }

  // ─── DERIVED ──────────────────────────────────────────────────────────────
  function getFiltered() {
    return STATE.pairs.filter(p => {
      const a = p.a, b = p.b, f = STATE.filters;
      if (f.fecha !== '__ALL') {
        const d = a?.fechaObj || b?.fechaObj;
        if (!d || fmtDate(d) !== f.fecha) return false;
      }
      if (f.agente !== '__ALL' && (!a || a.etiqueta !== f.agente)) return false;
      if (f.operador !== '__ALL' && (!b || b.operador !== f.operador)) return false;
      if (f.billetera !== '__ALL' && (!b || b.medio !== f.billetera)) return false;
      if (f.turno !== '__ALL' && (a?.turno || b?.turno || '') !== f.turno) return false;
      if (f.estado !== '__ALL') {
        if (a?.isAdminCharge) return f.estado === 'OK';
        return p.estado === f.estado;
      }
      if (f.movimiento !== '__ALL' && p.tipoMovimiento !== f.movimiento) return false;
      return true;
    });
  }

  function getSummary(filtered) {
    const visible = filtered.filter(p => !STATE.ignoredIds.has(p.id));
    let aTotal = 0, bTotal = 0, aIncome = 0, bIncome = 0, aOutcome = 0, bOutcome = 0, adminTotal = 0, paired = 0, missing = 0;
    visible.forEach(p => {
      if (p.a) {
        if (p.a.isAdminCharge) adminTotal += p.a.monto;
        else { aTotal += p.a.monto; (p.a.monto >= 0 ? aIncome += p.a.monto : aOutcome += p.a.monto); }
      }
      if (p.b) { bTotal += p.b.monto; (p.b.monto >= 0 ? bIncome += p.b.monto : bOutcome += p.b.monto); }
      if (!p.a?.isAdminCharge) { (p.estado === 'OK' || p.estado === 'MANUAL') ? paired++ : missing++; }
    });
    return { aTotal, bTotal, aIncome, bIncome, aOutcome, bOutcome, adminTotal, paired, missing, totalVisible: filtered.length };
  }

  function getFilterOptions() {
    const dates = new Set(), etiquetas = new Set(), operadores = new Set(), medios = new Set();
    STATE.pairs.forEach(p => {
      const d = p.a?.fechaObj || p.b?.fechaObj;
      if (d) dates.add(fmtDate(d));
      if (p.a?.etiqueta) etiquetas.add(p.a.etiqueta);
      if (p.b?.operador) operadores.add(p.b.operador);
      if (p.b?.medio) medios.add(p.b.medio);
    });
    return {
      dates: Array.from(dates).sort(),
      etiquetas: Array.from(etiquetas).sort(),
      operadores: Array.from(operadores).sort(),
      medios: Array.from(medios).sort()
    };
  }

  // ─── DOM HELPERS ──────────────────────────────────────────────────────────
  function ensureModal() {
    let modal = document.getElementById('opsComparatorModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'opsComparatorModal';
    modal.className = 'modal ops-cmp-modal';
    modal.innerHTML = '<div class="modal-content ops-cmp-content"><div id="opsCmpRoot"></div></div>';
    document.body.appendChild(modal);
    return modal;
  }

  function open() {
    const modal = ensureModal();
    modal.classList.add('active');
    renderRoot();
  }
  function close() {
    const modal = document.getElementById('opsComparatorModal');
    if (modal) modal.classList.remove('active');
    STATE.fullscreen = false;
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  function renderRoot() {
    const root = document.getElementById('opsCmpRoot');
    if (!root) return;
    const modal = document.getElementById('opsComparatorModal');
    if (modal) modal.classList.toggle('is-fullscreen', STATE.fullscreen);

    const fs = STATE.fullscreen;

    root.innerHTML = `
      <div class="ops-cmp">
        <div class="ops-cmp-header">
          <div class="ops-cmp-title"><i class="fas fa-balance-scale"></i> Comparador de diferencias</div>
          <div class="ops-cmp-header-actions">
            <button class="btn btn-ghost" id="opsCmpFsBtn" title="${fs ? 'Salir pantalla completa (ESC)' : 'Pantalla completa'}">
              <i class="fas ${fs ? 'fa-compress' : 'fa-expand'}"></i>
            </button>
            <button class="btn" id="opsCmpCloseBtn"><i class="fas fa-times"></i> Cerrar</button>
          </div>
        </div>

        <div class="ops-cmp-inputs">
          <div class="ops-cmp-inputs-row">
            <div class="ops-cmp-input-block">
              <label class="ops-cmp-label">1. CSVs de Agente / Subagente</label>
              <div id="opsCmpDrop" class="ops-cmp-drop">
                <input type="file" id="opsCmpFile" multiple accept=".csv" style="display:none">
                <i class="fas fa-cloud-upload-alt"></i>
                <div class="ops-cmp-drop-text">${STATE.agentFiles.length > 0
                  ? `<strong>${STATE.agentFiles.length} archivo(s)</strong><span>${STATE.agentFiles.map(f => escapeHtml(f.name)).join(', ')}</span>`
                  : '<strong>Arrastrá CSVs acá</strong><span>o hacé click para elegir</span>'}</div>
              </div>
            </div>
            <div class="ops-cmp-input-block">
              <label class="ops-cmp-label">2. Pegar texto desde Chunior</label>
              <textarea id="opsCmpChunior" placeholder="Pega acá las líneas copiadas desde Chunior...">${escapeHtml(STATE.chuniorText)}</textarea>
            </div>
          </div>
          <div class="ops-cmp-actions">
            <button class="btn btn-success" id="opsCmpProcessBtn" ${STATE.isProcessing || (STATE.agentFiles.length === 0 && !STATE.chuniorText) ? 'disabled' : ''}>
              <i class="fas fa-play"></i> ${STATE.isProcessing ? 'Procesando...' : 'Procesar y comparar'}
            </button>
            <button class="btn" id="opsCmpExcelBtn" ${STATE.pairs.length === 0 ? 'disabled' : ''}><i class="fas fa-file-excel"></i> Excel</button>
            <button class="btn" id="opsCmpCopyBtn" ${STATE.pairs.length === 0 ? 'disabled' : ''}><i class="fas fa-copy"></i> Copiar</button>
            <button class="btn btn-warning" id="opsCmpSyncBtn" ${STATE.pairs.length === 0 ? 'disabled' : ''} title="Aplica a contactos existentes (no crea nuevos)">
              <i class="fas fa-sync"></i> Subir a Nexo
            </button>
          </div>
        </div>

        <div id="opsCmpResults"></div>
      </div>
    `;

    bindStaticEvents();
    if (STATE.pairs.length > 0) renderResults();
    else {
      const r = document.getElementById('opsCmpResults');
      if (r) r.innerHTML = `
        <div class="ops-cmp-empty">
          <i class="fas fa-inbox"></i>
          <div>Cargá archivos y pegá el texto de Chunior, después presioná <strong>Procesar</strong>.</div>
        </div>
      `;
    }
  }

  // Re-render solo de la zona resultados (summary + filtros + tabla). No toca inputs.
  function renderResults() {
    const r = document.getElementById('opsCmpResults');
    if (!r) return;
    const filtered = getFiltered();
    const summary = getSummary(filtered);
    const opts = getFilterOptions();

    const auto = STATE.autoFilteredOperator;
    const autoBanner = (auto && STATE.filters.operador === auto) ? `
      <div class="ops-cmp-auto-banner">
        <i class="fas fa-magic"></i>
        Mostrando solo operaciones de <strong>${escapeHtml(auto.toUpperCase())}</strong> (último operador detectado).
        <button class="btn btn-mini" id="opsCmpAutoOff">Ver todo</button>
      </div>
    ` : '';

    r.innerHTML = `
      ${autoBanner}
      <div class="ops-cmp-progress">
        <div class="ops-cmp-progress-labels">
          <span class="cmp-ok">Conciliado: ${summary.paired} (${summary.totalVisible ? ((summary.paired / summary.totalVisible) * 100).toFixed(1) : 0}%)</span>
          <span class="cmp-bad">Discrepancias: ${summary.missing} (${summary.totalVisible ? ((summary.missing / summary.totalVisible) * 100).toFixed(1) : 0}%)</span>
        </div>
        <div class="ops-cmp-progress-bar">
          <div class="ops-cmp-progress-ok" style="width:${summary.totalVisible ? (summary.paired / summary.totalVisible) * 100 : 0}%"></div>
          <div class="ops-cmp-progress-err" style="width:${summary.totalVisible ? (summary.missing / summary.totalVisible) * 100 : 0}%"></div>
        </div>
      </div>

      <div class="ops-cmp-summary">
        ${summaryBadge('Total Agente', summary.aTotal, 'neutral')}
        ${summaryBadge('Total Chunior', summary.bTotal, 'neutral')}
        ${summaryBadge('Diferencia', summary.aTotal - summary.bTotal, 'diff')}
        ${summaryBadge('Cargas Admin', summary.adminTotal, 'warn')}
        ${summaryBadge('Ingresos A', summary.aIncome, 'good')}
        ${summaryBadge('Ingresos B', summary.bIncome, 'good')}
        ${summaryBadge('Dif. Ingresos', summary.aIncome - summary.bIncome, 'diff')}
        ${summaryBadge('Egresos A', summary.aOutcome, 'bad')}
        ${summaryBadge('Egresos B', summary.bOutcome, 'bad')}
        ${summaryBadge('Dif. Egresos', summary.aOutcome - summary.bOutcome, 'diff')}
      </div>

      <div class="ops-cmp-filters">
        ${selectFilter('fecha', 'Fecha', opts.dates)}
        ${selectFilter('agente', 'Agente', opts.etiquetas)}
        ${selectFilter('operador', 'Operador', opts.operadores)}
        ${selectFilter('billetera', 'Billetera', opts.medios)}
        ${selectFilter('turno', 'Turno', ['TM', 'TT', 'TN'])}
        ${selectFilter('estado', 'Estado', ['OK', 'MISSING_CHUNIOR', 'MISSING_AGENT', 'MANUAL'])}
        ${selectFilter('movimiento', 'Tipo', ['INGRESO', 'EGRESO'])}
        <div class="ops-cmp-filter-totals">
          <div>Visibles: <strong>${summary.totalVisible}</strong></div>
          <div>OK: <strong class="cmp-ok">${summary.paired}</strong></div>
          <div>Discrep: <strong class="cmp-bad">${summary.missing}</strong></div>
        </div>
      </div>

      <div class="ops-cmp-table-wrap">
        <table class="ops-cmp-table">
          <thead>
            <tr>
              <th>Agente</th><th>Turno</th><th>Hora A</th><th>Usuario A</th><th class="ta-r">Monto A</th>
              <th class="bl">Hora B</th><th>Usuario B</th><th class="ta-r">Monto B</th><th>Operador</th><th>Billetera</th>
              <th>Estado</th><th class="ta-c w-acts">Acción</th>
            </tr>
          </thead>
          <tbody id="opsCmpTbody">
            ${filtered.length === 0
              ? '<tr><td colspan="12" class="ops-cmp-table-empty">Sin registros para mostrar.</td></tr>'
              : filtered.map(rowHtml).join('')}
          </tbody>
        </table>
      </div>
    `;
    bindResultsEvents();
  }

  function summaryBadge(label, value, type) {
    let cls = 'neutral';
    if (type === 'diff') cls = Math.abs(value) < 0.01 ? 'good' : 'bad';
    else if (type === 'warn') cls = 'warn';
    else if (type === 'bad') cls = 'bad';
    else if (type === 'good') cls = 'good';
    return `<div class="ops-cmp-badge ${cls}"><span>${label}</span><strong>$ ${fmt(value)}</strong></div>`;
  }

  function selectFilter(key, label, options) {
    const cur = STATE.filters[key];
    return `<div class="ops-cmp-filter">
      <label>${label}</label>
      <select data-filter="${key}">
        <option value="__ALL"${cur === '__ALL' ? ' selected' : ''}>Todos</option>
        ${options.map(o => `<option value="${escapeHtml(o)}"${cur === o ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')}
      </select>
    </div>`;
  }

  function rowHtml(p) {
    const ignored = STATE.ignoredIds.has(p.id);
    const isMatch = p.estado === 'OK' || p.estado === 'MANUAL' || p.a?.isAdminCharge;
    const isMissA = p.estado === 'MISSING_AGENT';
    let cls = '';
    if (ignored) cls = 'ignored';
    else if (isMissA) cls = 'miss-a';
    else if (!isMatch) cls = 'miss-b';

    const totalMissing = STATE.pairs.filter(x => (x.estado === 'MISSING_AGENT' || x.estado === 'MISSING_CHUNIOR') && !STATE.ignoredIds.has(x.id)).length;

    const statusCell = p.a?.isAdminCharge ? '<span class="cmp-st adm">✔ AJUSTE</span>'
      : p.estado === 'OK' ? '<span class="cmp-st ok">✔ OK</span>'
      : p.estado === 'MANUAL' ? '<span class="cmp-st manual">✔ MANUAL</span>'
      : p.estado === 'MISSING_AGENT' ? '<span class="cmp-st warn">❌ FALTA A</span>'
      : '<span class="cmp-st bad">❌ FALTA B</span>';

    return `<tr class="${cls}" data-id="${escapeHtml(p.id)}">
      <td>${escapeHtml((p.a?.etiqueta || '').toUpperCase())}</td>
      <td>${escapeHtml(p.a?.turno || p.b?.turno || '')}</td>
      <td class="mono">${fmtTime(p.a?.fechaObj)}</td>
      <td>${p.a?.isAdminCharge ? '<span class="cmp-st adm">AJUSTE</span>' : escapeHtml(p.a?.usuario || '')}</td>
      <td class="ta-r mono ${(p.a?.monto || 0) < 0 ? 'neg' : 'pos'}">${p.a ? '$ ' + fmt(p.a.monto) : ''}</td>
      <td class="bl mono">${fmtTime(p.b?.fechaObj)}</td>
      <td>${escapeHtml(p.b?.usuario || '')}</td>
      <td class="ta-r mono ${(p.b?.monto || 0) < 0 ? 'neg' : 'pos'}">${p.b ? '$ ' + fmt(p.b.monto) : ''}</td>
      <td>${escapeHtml((p.b?.operador || '').toUpperCase())}</td>
      <td>${escapeHtml(p.b?.medio || '')}</td>
      <td>${statusCell}</td>
      <td class="ta-c">
        <div class="ops-cmp-row-acts">
          ${!ignored ? `<button class="ic-btn" data-act="edit" title="Editar"><i class="fas fa-pen"></i></button>` : ''}
          ${!ignored && !isMatch && totalMissing > 1 ? `<button class="ic-btn" data-act="link" title="Enlazar"><i class="fas fa-link"></i></button>` : ''}
          <button class="ic-btn ${ignored ? 'on' : ''}" data-act="ignore" title="${ignored ? 'Mostrar' : 'Ignorar'}"><i class="fas ${ignored ? 'fa-eye' : 'fa-eye-slash'}"></i></button>
        </div>
      </td>
    </tr>`;
  }

  // ─── EVENTS ───────────────────────────────────────────────────────────────
  function bindStaticEvents() {
    const root = document.getElementById('opsCmpRoot');
    if (!root) return;

    root.querySelector('#opsCmpCloseBtn')?.addEventListener('click', close);
    root.querySelector('#opsCmpFsBtn')?.addEventListener('click', () => { STATE.fullscreen = !STATE.fullscreen; renderRoot(); });

    const drop = root.querySelector('#opsCmpDrop');
    const fileInput = root.querySelector('#opsCmpFile');
    if (drop && fileInput) {
      drop.addEventListener('click', () => fileInput.click());
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
      drop.addEventListener('drop', e => {
        e.preventDefault(); drop.classList.remove('drag');
        if (e.dataTransfer?.files?.length) {
          STATE.agentFiles = Array.from(e.dataTransfer.files);
          // Solo refresca el bloque drop, no toda la UI
          const txt = drop.querySelector('.ops-cmp-drop-text');
          if (txt) txt.innerHTML = `<strong>${STATE.agentFiles.length} archivo(s)</strong><span>${STATE.agentFiles.map(f => escapeHtml(f.name)).join(', ')}</span>`;
          updateProcessBtnState();
        }
      });
      fileInput.addEventListener('change', e => {
        if (e.target.files?.length) {
          STATE.agentFiles = Array.from(e.target.files);
          const txt = drop.querySelector('.ops-cmp-drop-text');
          if (txt) txt.innerHTML = `<strong>${STATE.agentFiles.length} archivo(s)</strong><span>${STATE.agentFiles.map(f => escapeHtml(f.name)).join(', ')}</span>`;
          updateProcessBtnState();
        }
      });
    }

    const ta = root.querySelector('#opsCmpChunior');
    if (ta) ta.addEventListener('input', e => {
      STATE.chuniorText = e.target.value;
      updateProcessBtnState();
    });

    root.querySelector('#opsCmpProcessBtn')?.addEventListener('click', processData);
    root.querySelector('#opsCmpExcelBtn')?.addEventListener('click', exportExcel);
    root.querySelector('#opsCmpCopyBtn')?.addEventListener('click', copyTSV);
    root.querySelector('#opsCmpSyncBtn')?.addEventListener('click', syncToNexo);
  }

  function updateProcessBtnState() {
    const btn = document.getElementById('opsCmpProcessBtn');
    if (!btn) return;
    const disabled = STATE.isProcessing || (STATE.agentFiles.length === 0 && !STATE.chuniorText);
    btn.disabled = disabled;
  }

  function bindResultsEvents() {
    const r = document.getElementById('opsCmpResults');
    if (!r) return;

    r.querySelector('#opsCmpAutoOff')?.addEventListener('click', () => {
      STATE.filters.operador = '__ALL';
      STATE.autoFilteredOperator = null;
      renderResults();
    });

    r.querySelectorAll('select[data-filter]').forEach(sel => {
      sel.addEventListener('change', e => {
        STATE.filters[sel.getAttribute('data-filter')] = e.target.value;
        renderResults();
      });
    });

    // Delegación de eventos en tbody — un solo listener para todas las filas
    const tbody = r.querySelector('#opsCmpTbody');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        e.stopPropagation();
        const tr = btn.closest('tr[data-id]');
        if (!tr) return;
        const id = tr.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        const pair = STATE.pairs.find(p => p.id === id);
        if (!pair) return;
        if (act === 'edit') openEditModal(pair);
        else if (act === 'link') openLinkModal(pair);
        else if (act === 'ignore') {
          if (STATE.ignoredIds.has(id)) STATE.ignoredIds.delete(id); else STATE.ignoredIds.add(id);
          renderResults();
        }
      });
    }
  }

  // ESC para salir fullscreen / cerrar
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const sub = document.getElementById('opsCmpSubModal');
    if (sub?.classList.contains('active')) { sub.classList.remove('active'); return; }
    const main = document.getElementById('opsComparatorModal');
    if (main?.classList.contains('active') && STATE.fullscreen) {
      STATE.fullscreen = false; renderRoot();
    }
  });

  // ─── EDIT/LINK MODALES ────────────────────────────────────────────────────
  function ensureSubModal() {
    let m = document.getElementById('opsCmpSubModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'opsCmpSubModal';
    m.className = 'modal ops-cmp-sub-modal';
    m.innerHTML = '<div class="modal-content ops-cmp-sub-content-wrap"><div class="ops-cmp-sub-content"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('active'); });
    return m;
  }

  function openEditModal(pair) {
    const editing = JSON.parse(JSON.stringify(pair, (k, v) => (k === 'fechaObj' && v) ? new Date(v).toISOString() : v));
    if (editing.a?.fechaObj) editing.a.fechaObj = new Date(editing.a.fechaObj);
    if (editing.b?.fechaObj) editing.b.fechaObj = new Date(editing.b.fechaObj);
    const m = ensureSubModal();
    m.querySelector('.ops-cmp-sub-content').innerHTML = `
      <div class="ops-cmp-sub-header"><i class="fas fa-pen"></i> Editar movimiento</div>
      <p class="ops-cmp-sub-hint">Completá los datos faltantes para conciliar manualmente.</p>
      <div class="ops-cmp-sub-grid">
        <div>
          <h4 class="cmp-ok">Datos Agente ${!pair.a ? '<span class="cmp-pill">FALTA</span>' : ''}</h4>
          <label>Usuario</label><input id="edA_user" value="${escapeHtml(pair.a?.usuario || '')}">
          <label>Monto</label><input id="edA_monto" type="number" step="0.01" value="${pair.a?.monto ?? 0}">
        </div>
        <div>
          <h4 class="cmp-purple">Datos Chunior ${!pair.b ? '<span class="cmp-pill">FALTA</span>' : ''}</h4>
          <label>Usuario</label><input id="edB_user" value="${escapeHtml(pair.b?.usuario || '')}">
          <label>Monto</label><input id="edB_monto" type="number" step="0.01" value="${pair.b?.monto ?? 0}">
          <label>Billetera</label><input id="edB_med" value="${escapeHtml(pair.b?.medio || '')}">
        </div>
      </div>
      <div class="ops-cmp-sub-actions">
        <button class="btn" id="opsCmpEditCancel"><i class="fas fa-times"></i> Cancelar</button>
        <button class="btn btn-success" id="opsCmpEditSave"><i class="fas fa-check"></i> Guardar</button>
      </div>
    `;
    m.classList.add('active');
    m.querySelector('#opsCmpEditCancel').onclick = () => m.classList.remove('active');
    m.querySelector('#opsCmpEditSave').onclick = () => {
      const updated = editing;
      const aUser = m.querySelector('#edA_user').value.trim();
      const aMonto = parseFloat(m.querySelector('#edA_monto').value) || 0;
      const bUser = m.querySelector('#edB_user').value.trim();
      const bMonto = parseFloat(m.querySelector('#edB_monto').value) || 0;
      const bMed = m.querySelector('#edB_med').value.trim();

      if (aUser || aMonto !== 0) {
        if (!updated.a) updated.a = { origen: 'A', etiqueta: 'MANUAL', fecha: updated.b?.fecha || '', fechaObj: updated.b?.fechaObj || new Date(), isAdminCharge: false, turno: updated.b?.turno || '' };
        updated.a.usuario = aUser; updated.a.monto = aMonto;
      }
      if (bUser || bMonto !== 0 || bMed) {
        if (!updated.b) updated.b = { origen: 'B', operador: 'MANUAL', fecha: updated.a?.fecha || '', fechaObj: updated.a?.fechaObj || new Date(), turno: updated.a?.turno || '' };
        updated.b.usuario = bUser; updated.b.monto = bMonto; updated.b.medio = bMed;
      }
      if (updated.a && updated.b) {
        updated.estado = 'MANUAL';
        updated.tipoMovimiento = updated.a.monto < 0 ? 'EGRESO' : 'INGRESO';
      }
      STATE.pairs = STATE.pairs.map(p => p.id === updated.id ? updated : p);
      m.classList.remove('active');
      renderResults();
    };
  }

  function openLinkModal(basePair) {
    const lookingForB = !!basePair.a;
    const candidates = STATE.pairs.filter(p => {
      if (p.id === basePair.id) return false;
      if (p.estado === 'OK' || p.estado === 'MANUAL') return false;
      return lookingForB ? (!!p.b && !p.a) : (!!p.a && !p.b);
    });
    const m = ensureSubModal();
    m.querySelector('.ops-cmp-sub-content').innerHTML = `
      <div class="ops-cmp-sub-header"><i class="fas fa-link"></i> Enlazar movimiento</div>
      <p class="ops-cmp-sub-hint">Seleccioná un huérfano para unir con el actual.</p>
      <div class="ops-cmp-sub-list">
        ${candidates.length === 0 ? '<div class="ops-cmp-sub-empty">No hay candidatos disponibles.</div>'
          : candidates.map(c => {
            const u = c.a?.usuario || c.b?.usuario || '';
            const mt = c.a?.monto ?? c.b?.monto ?? 0;
            const t = fmtTime(c.a?.fechaObj || c.b?.fechaObj);
            return `<button class="ops-cmp-sub-item" data-link-id="${escapeHtml(c.id)}">
              <div><strong>${escapeHtml(u)}</strong><span>${t}</span></div>
              <div class="mono ${mt < 0 ? 'neg' : 'pos'}">$ ${fmt(mt)}</div>
            </button>`;
          }).join('')}
      </div>
      <div class="ops-cmp-sub-actions">
        <button class="btn" id="opsCmpLinkClose"><i class="fas fa-times"></i> Cerrar</button>
      </div>
    `;
    m.classList.add('active');
    m.querySelector('#opsCmpLinkClose').onclick = () => m.classList.remove('active');
    m.querySelectorAll('[data-link-id]').forEach(btn => {
      btn.onclick = () => {
        const targetId = btn.getAttribute('data-link-id');
        const base = basePair;
        const target = STATE.pairs.find(p => p.id === targetId);
        if (!base || !target) return;
        const linked = {
          id: `link-${Date.now()}`,
          a: base.a || target.a, b: base.b || target.b,
          estado: 'MANUAL',
          tipoMovimiento: base.tipoMovimiento || target.tipoMovimiento,
          manualPairId: `${base.id}|${target.id}`
        };
        STATE.pairs = STATE.pairs.filter(p => p.id !== base.id && p.id !== target.id);
        STATE.pairs.push(linked);
        STATE.pairs.sort((x, y) => {
          const dx = x.a?.fechaObj || x.b?.fechaObj;
          const dy = y.a?.fechaObj || y.b?.fechaObj;
          return (dx?.getTime() || 0) - (dy?.getTime() || 0);
        });
        m.classList.remove('active');
        renderResults();
      };
    });
  }

  // ─── COPY / EXCEL / SYNC ──────────────────────────────────────────────────
  function copyTSV() {
    const filtered = getFiltered().filter(p => !STATE.ignoredIds.has(p.id));
    const rows = filtered.map(p => [
      (p.a?.etiqueta || '').toUpperCase(), p.a?.turno || p.b?.turno || '',
      fmtTime(p.a?.fechaObj), p.a?.isAdminCharge ? 'AJUSTE' : (p.a?.usuario || ''), p.a?.monto?.toLocaleString('es-AR') || '',
      fmtTime(p.b?.fechaObj), p.b?.usuario || '', p.b?.monto?.toLocaleString('es-AR') || '',
      (p.b?.operador || '').toUpperCase(), p.b?.medio || '',
      p.a?.isAdminCharge ? 'AJUSTE' : p.estado, p.tipoMovimiento
    ].join('\t'));
    navigator.clipboard.writeText(rows.join('\n')).then(() => {
      window.NexoActions?.showNotification?.('Copiado al portapapeles', 'success');
    });
  }

  function exportExcel() {
    if (typeof window.XLSX === 'undefined' && typeof XLSX === 'undefined') {
      alert('XLSX no disponible.');
      return;
    }
    const X = window.XLSX || XLSX;
    const filtered = getFiltered().filter(p => !STATE.ignoredIds.has(p.id));
    const egresos = filtered.filter(p => p.tipoMovimiento === 'EGRESO');
    const ingresos = filtered.filter(p => p.tipoMovimiento === 'INGRESO');
    const errors = filtered.filter(p => !p.a?.isAdminCharge && (p.estado === 'MISSING_CHUNIOR' || p.estado === 'MISSING_AGENT')).map(p => {
      const isAgentMiss = p.estado === 'MISSING_AGENT';
      const ref = isAgentMiss ? p.b : p.a;
      return { monto: ref?.monto || 0, usuario: ref?.usuario || '?', detalle: isAgentMiss ? 'FALTA EN AGENTE' : 'FALTA EN CHUNIOR', tipo: p.tipoMovimiento };
    });
    const sumA = arr => arr.reduce((a, p) => a + (p.a?.monto || 0), 0);
    const sumB = arr => arr.reduce((a, p) => a + (p.b?.monto || 0), 0);
    const totEgA = sumA(egresos), totEgB = sumB(egresos), totInA = sumA(ingresos), totInB = sumB(ingresos);
    const diffEg = totEgA - totEgB, diffIn = totInA - totInB;

    const border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    const center = { horizontal: 'center', vertical: 'center' };
    const s = {
      headEg: { font: { bold: true, sz: 12 }, fill: { fgColor: { rgb: 'E7E6E6' } }, alignment: center, border },
      subAg: { font: { bold: true }, fill: { fgColor: { rgb: 'FFC000' } }, alignment: center, border },
      subCh: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '5B9BD5' } }, alignment: center, border },
      valMoney: { numFmt: '$ #,##0.00', alignment: center, border, font: { bold: true } },
      valDiff: { numFmt: '$ #,##0.00', alignment: center, border, font: { bold: true, color: { rgb: 'FF0000' } } },
      labelDiff: { font: { bold: true }, fill: { fgColor: { rgb: 'D9D9D9' } }, alignment: center, border },
      colAg: { font: { bold: true }, fill: { fgColor: { rgb: 'FFC000' } }, alignment: center, border },
      colCh: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '5B9BD5' } }, alignment: center, border },
      cellMoney: { numFmt: '$ #,##0.00', border, alignment: { horizontal: 'right' } },
      cellText: { border, alignment: { horizontal: 'left' } },
      errHead: { font: { bold: true, color: { rgb: '9C0006' } }, fill: { fgColor: { rgb: 'FFC7CE' } }, alignment: center, border },
      errCell: { font: { color: { rgb: '9C0006' } }, fill: { fgColor: { rgb: 'FFC7CE' } }, border, alignment: center }
    };
    s.headIn = s.headEg;

    const ws_data = [
      [{ v: 'EGRESOS', s: s.headEg }, null, null, null, null, { v: 'INGRESOS', s: s.headIn }],
      [{ v: 'TOTAL AGENTE', s: s.subAg }, null, { v: 'TOTAL CHUNIOR', s: s.subCh }, null, null, { v: 'TOTAL AGENTE', s: s.subAg }, null, { v: 'TOTAL CHUNIOR', s: s.subCh }],
      [{ v: totEgA, s: s.valMoney }, null, { v: totEgB, s: s.valMoney }, null, null, { v: totInA, s: s.valMoney }, null, { v: totInB, s: s.valMoney }],
      [{ v: 'DIF. EGRESOS:', s: s.labelDiff }, { v: diffEg, s: s.valDiff }, null, null, null, { v: 'DIF. INGRESOS:', s: s.labelDiff }, { v: diffIn, s: s.valDiff }],
      [null],
      [{ v: 'RETIROS AGENTE', s: s.colAg }, { v: 'Usuario', s: s.colAg }, { v: 'RETIROS CHUNIOR', s: s.colCh }, { v: 'Usuario', s: s.colCh }, null, { v: 'DEPOSITOS AGENTE', s: s.colAg }, { v: 'Usuario', s: s.colAg }, { v: 'DEPOSITOS CHUNIOR', s: s.colCh }, { v: 'Usuario', s: s.colCh }]
    ];
    const maxRows = Math.max(egresos.length, ingresos.length);
    for (let i = 0; i < maxRows; i++) {
      const row = []; const eg = egresos[i]; const inG = ingresos[i];
      row.push(eg ? { v: eg.a?.monto || '', s: s.cellMoney } : null, eg ? { v: eg.a?.usuario || '', s: s.cellText } : null, eg ? { v: eg.b?.monto || '', s: s.cellMoney } : null, eg ? { v: eg.b?.usuario || '', s: s.cellText } : null);
      row.push(null);
      row.push(inG ? { v: inG.a?.monto || '', s: s.cellMoney } : null, inG ? { v: inG.a?.usuario || '', s: s.cellText } : null, inG ? { v: inG.b?.monto || '', s: s.cellMoney } : null, inG ? { v: inG.b?.usuario || '', s: s.cellText } : null);
      ws_data.push(row);
    }
    if (errors.length > 0) {
      ws_data.push([null], [null], [{ v: 'DISCREPANCIAS / ERRORES', s: s.errHead }, null, null, null], [{ v: 'DETALLE', s: s.errHead }, { v: 'USUARIO', s: s.errHead }, { v: 'MONTO', s: s.errHead }, { v: 'TIPO', s: s.errHead }]);
      errors.forEach(err => ws_data.push([{ v: err.detalle, s: s.errCell }, { v: err.usuario, s: s.errCell }, { v: err.monto, s: { ...s.errCell, numFmt: '$ #,##0.00' } }, { v: err.tipo, s: s.errCell }]));
    }
    const ws = X.utils.aoa_to_sheet([]);
    ws['!cols'] = [{ wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 5 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 15 }];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 0, c: 5 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }, { s: { r: 1, c: 2 }, e: { r: 1, c: 3 } }, { s: { r: 1, c: 5 }, e: { r: 1, c: 6 } }, { s: { r: 1, c: 7 }, e: { r: 1, c: 8 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }, { s: { r: 2, c: 2 }, e: { r: 2, c: 3 } }, { s: { r: 2, c: 5 }, e: { r: 2, c: 6 } }, { s: { r: 2, c: 7 }, e: { r: 2, c: 8 } }
    ];
    if (errors.length > 0) {
      const startRow = ws_data.findIndex(r => r && r[0] && r[0].v === 'DISCREPANCIAS / ERRORES');
      if (startRow > -1) ws['!merges'].push({ s: { r: startRow, c: 0 }, e: { r: startRow, c: 3 } });
    }
    let maxRow = 0, maxCol = 0;
    ws_data.forEach((r, rIdx) => {
      if (!r) return;
      r.forEach((c, cIdx) => {
        if (c !== null && c !== undefined) {
          const cellRef = X.utils.encode_cell({ r: rIdx, c: cIdx });
          ws[cellRef] = (typeof c === 'object' && 'v' in c) ? { t: typeof c.v === 'number' ? 'n' : 's', v: c.v, s: c.s, z: c.s?.numFmt } : { v: c };
          if (rIdx > maxRow) maxRow = rIdx;
          if (cIdx > maxCol) maxCol = cIdx;
        }
      });
    });
    // !ref es obligatorio — sin esto xlsx-js-style genera el archivo vacío.
    ws['!ref'] = `A1:${X.utils.encode_cell({ r: maxRow, c: maxCol })}`;
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'Conciliación');
    X.writeFile(wb, `Conciliacion_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function syncToNexo() {
    if (typeof window.mergeOpsProfiles !== 'function' || typeof window.syncOpsToContacts !== 'function') {
      alert('Sync no disponible: módulo Ops no expone hooks.');
      return;
    }
    const NM = window.NexoMetrics;
    if (!NM) { alert('NexoMetrics no disponible.'); return; }

    const conciliated = STATE.pairs.filter(p => !STATE.ignoredIds.has(p.id) && (p.estado === 'OK' || p.estado === 'MANUAL' || p.a?.isAdminCharge));
    if (conciliated.length === 0) { alert('No hay pares conciliados para subir.'); return; }

    const profilesByAlias = {};
    let added = 0;
    conciliated.forEach(p => {
      const ref = p.a || p.b;
      const aliasRaw = ref?.usuario || '';
      if (!aliasRaw) return;
      const alias = aliasRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!alias) return;
      const monto = (p.a?.monto != null) ? p.a.monto : (p.b?.monto || 0);
      // NexoMetrics espera ts como NÚMERO (epoch ms), no ISO string.
      const fechaMs = ref?.fechaObj instanceof Date ? ref.fechaObj.getTime() : Date.now();
      const granItem = { ts: fechaMs, amount: monto, type: monto < 0 ? 'retiro' : 'carga', source: 'comparador' };
      if (!profilesByAlias[alias]) profilesByAlias[alias] = { aliasLabel: aliasRaw, opsGranular: [] };
      profilesByAlias[alias].opsGranular.push(granItem);
      added++;
    });

    if (added === 0) { alert('Las filas conciliadas no tienen alias válido.'); return; }

    showLoader('Sincronizando con Nexo...');
    try {
      window.mergeOpsProfiles(profilesByAlias);
      window.syncOpsToContacts({ createNewUsers: false }).then(res => {
        hideLoader();
        const upd = res?.updatedCount || 0;
        window.NexoActions?.showNotification?.(`Sincronizado: ${upd} contactos actualizados (${added} ops)`, 'success');
      }).catch(e => { hideLoader(); alert('Error en sync: ' + e.message); });
    } catch (e) {
      hideLoader();
      alert('Error mergeando ops: ' + e.message);
    }
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────────────
  window.OpsComparator = { open, close };

  // Saneamiento defensivo: si alguna versión previa dejó la clase ops-cmp-open
  // pegada en el body (por un cierre inesperado), la limpiamos al cargar.
  document.body.classList.remove('ops-cmp-open');

  if (window.NexoBridge) window.NexoBridge.register('opsComparator');
})();
