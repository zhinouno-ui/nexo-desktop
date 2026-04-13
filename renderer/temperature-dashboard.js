(function () {
    var MONTHS_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    function getMonthKey(dateStr) {
        if (!dateStr) return null;
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return MONTHS_LABELS[d.getMonth()] + d.getFullYear();
    }

    function getLast12Months() {
        var result = [];
        var now = new Date();
        for (var i = 11; i >= 0; i--) {
            var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            result.push({
                key: MONTHS_LABELS[d.getMonth()] + d.getFullYear(),
                label: MONTHS_LABELS[d.getMonth()] + ' ' + d.getFullYear(),
                month: d.getMonth(),
                year: d.getFullYear()
            });
        }
        return result;
    }

    function computeMonthlyStats() {
        var appState = window.AppState;
        if (!appState) return {};
        var pid = appState.activeProfileId || 'default';
        var stats = {};

        // Pass 1: Contar desde opsGranular (operaciones CSV reales)
        var opsProfiles = appState.opsProfiles || {};
        var countedAliases = new Set();

        for (var alias in opsProfiles) {
            if (!opsProfiles.hasOwnProperty(alias)) continue;
            var profile = opsProfiles[alias];
            var granular = profile.opsGranular || [];

            for (var g = 0; g < granular.length; g++) {
                var op = granular[g];
                var dateStr = op.date; // formato: YYYY-MM-DD
                var key = getMonthKey(dateStr);
                if (!key) continue;

                if (!stats[key]) {
                    stats[key] = { cargasTotal: 0, newUsers: 0, depositadoTotal: 0, jugandoCount: 0, userCount: new Set() };
                }

                // Contar operación
                if (op.amount > 0) {
                    stats[key].cargasTotal++;
                    stats[key].depositadoTotal += op.amount;
                }

                // Registrar usuario único por mes
                stats[key].userCount.add(alias);
            }

            countedAliases.add(alias);
        }

        // Pass 2: Datos adicionales de contactos (nuevos, jugando)
        var contacts = appState.contacts || [];
        for (var i = 0; i < contacts.length; i++) {
            var c = contacts[i];
            if ((c.profileId || 'default') !== pid) continue;
            if (!c.ops) continue;

            var dateStr2 = c.ops.lastCargaAt || c.ops.lastAt;
            var key2 = getMonthKey(dateStr2);
            if (!key2) continue;

            if (!stats[key2]) {
                stats[key2] = { cargasTotal: 0, newUsers: 0, depositadoTotal: 0, jugandoCount: 0, userCount: new Set() };
            }

            if (c.isNewFromOps) stats[key2].newUsers++;
            if (c.status === 'jugando') stats[key2].jugandoCount++;

            var alias2 = String(c.ops.alias || c.alias || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (alias2) stats[key2].userCount.add(alias2);
        }

        // Convertir Sets a números
        for (var k in stats) {
            if (stats[k].userCount && typeof stats[k].userCount.size !== 'undefined') {
                stats[k].userCount = stats[k].userCount.size;
            } else {
                stats[k].userCount = 0;
            }
        }

        return stats;
    }

    function getImportedMonths() {
        var pid = (window.AppState && window.AppState.activeProfileId) || 'default';
        try { return new Set(JSON.parse(localStorage.getItem('opsImportedMonths:' + pid) || '[]')); } catch(_) { return new Set(); }
    }

    function getOpsTemperature() {
        var lastImport = window.AppState && window.AppState.opsLastImportedAt;
        if (!lastImport) return { label: 'Sin datos CSV', cls: 'none', days: null };
        var days = (Date.now() - new Date(lastImport).getTime()) / 86400000;
        if (isNaN(days)) return { label: 'Sin datos CSV', cls: 'none', days: null };
        days = Math.round(days);
        if (days <= 7) return { label: 'Caliente', cls: 'hot', days: days };
        if (days <= 15) return { label: 'Tibio', cls: 'warm', days: days };
        return { label: 'Frio', cls: 'cold', days: days };
    }

    function fmtMoney(val) {
        return '$' + Math.round(val || 0).toLocaleString('es-AR');
    }

    function render() {
        var container = document.getElementById('tempDashboardContainer');
        if (!container) return;

        try {
            _renderInner(container);
        } catch (err) {
            console.error('[TEMP-DASHBOARD] render crash:', err);
            container.innerHTML = '<div style="color:#ef4444;padding:12px;font-size:12px;">Error al renderizar dashboard: ' + (err && err.message ? err.message : String(err)) + '</div>';
        }
    }

    function _renderInner(container) {
        var months12 = getLast12Months();
        var stats = computeMonthlyStats() || {};
        var importedMonths = getImportedMonths();
        var temp = getOpsTemperature();

        var tempColors = { hot: '#22c55e', warm: '#f59e0b', cold: '#ef4444', none: '#64748b' };
        var tempIcons = { hot: '🔥', warm: '⏳', cold: '🧊', none: '❓' };
        var tc = tempColors[temp.cls] || '#64748b';

        var html = '<div style="margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">';
        html += '<div style="background:' + tc + '22;border:1.5px solid ' + tc + '55;border-radius:8px;padding:7px 14px;color:' + tc + ';font-weight:700;font-size:13px;">';
        html += tempIcons[temp.cls] + ' ' + temp.label + (temp.days !== null ? ' — hace ' + temp.days + ' día(s)' : '');
        html += '</div>';
        if (temp.days !== null) {
            html += '<div style="color:var(--text-secondary);font-size:11px;">Último CSV de operaciones cargado hace ' + temp.days + ' día(s).</div>';
        } else {
            html += '<div style="color:#ef4444;font-size:11px;">No hay datos de operaciones cargados en este perfil.</div>';
        }
        html += '</div>';

        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;">';

        for (var mi = 0; mi < months12.length; mi++) {
            var m = months12[mi];
            var data = stats[m.key] || null;
            var monthKey2 = m.year + '-' + String(m.month + 1).padStart(2, '0');
            var hasImportRecord = importedMonths.has(monthKey2);
            // Gap real = sin data Y sin importRecord. Si hay userCount > 0, hay actividad real.
            var hasActivity = data && ((data.userCount || 0) > 0 || (data.cargasTotal || 0) > 0);
            var isGap = !hasActivity && !hasImportRecord;

            if (isGap) {
                html += '<div style="background:rgba(239,68,68,.10);border:2px solid #ef4444;border-radius:8px;padding:10px 8px;text-align:center;">';
                html += '<div style="font-size:10px;font-weight:700;color:#fca5a5;margin-bottom:4px;">' + m.label + '</div>';
                html += '<div style="color:#ef4444;font-size:18px;line-height:1.2;">⚠️</div>';
                html += '<div style="font-size:9px;color:#ef4444;font-weight:700;margin-top:3px;">Sin operaciones</div>';
                html += '<div style="font-size:9px;color:#fca5a5;margin-top:2px;">Subir CSV ' + m.label + '</div>';
                html += '</div>';
            } else {
                // data puede ser null si hasImportRecord=true pero no hay actividad registrada
                var _d = data || {};
                var userCount = _d.userCount || 0;
                var jugandoCount = _d.jugandoCount || 0;
                var newUsers = _d.newUsers || 0;
                var pctJugando = userCount > 0 ? Math.round((jugandoCount / userCount) * 100) : 0;
                html += '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--border,#334155);border-radius:8px;padding:10px 8px;text-align:center;">';
                html += '<div style="font-size:10px;font-weight:700;color:var(--text-secondary);margin-bottom:5px;">' + m.label + '</div>';
                html += '<div style="font-size:14px;font-weight:700;color:#22c55e;">' + userCount + '</div>';
                html += '<div style="font-size:9px;color:var(--text-secondary);margin-top:4px;">usuarios activos</div>';
                if (newUsers > 0) {
                    html += '<div style="font-size:9px;color:#60a5fa;margin-top:2px;">+' + newUsers + ' nuevos</div>';
                }
                if (jugandoCount > 0) {
                    html += '<div style="font-size:9px;color:#fbbf24;margin-top:2px;">🎮 ' + jugandoCount + ' jugando (' + pctJugando + '%)</div>';
                }
                html += '</div>';
            }
        }

        html += '</div>';

        // Tabla de gaps para subir
        var gaps = months12.filter(function (mg) {
            var d = stats[mg.key] || null;
            return !d || ((d.cargasTotal || 0) === 0 && (d.newUsers || 0) === 0);
        });
        if (gaps.length > 0) {
            html += '<div style="margin-top:14px;padding:10px 12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:8px;">';
            html += '<div style="font-weight:700;color:#fca5a5;font-size:12px;margin-bottom:6px;">⚠️ Meses sin datos de operaciones (' + gaps.length + ')</div>';
            for (var gi = 0; gi < gaps.length; gi++) {
                html += '<div style="font-size:11px;color:#ef4444;margin-bottom:2px;">→ Subir CSV de ' + gaps[gi].label + '</div>';
            }
            html += '</div>';
        }

        container.innerHTML = html;
    }

    window.TemperatureDashboard = {
        render: render,
        computeMonthlyStats: computeMonthlyStats,
        getOpsTemperature: getOpsTemperature,
        getImportedMonths: getImportedMonths
    };

    console.log('[TEMP-DASHBOARD] Módulo de temperatura cargado');
})();
