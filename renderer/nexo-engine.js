/**
 * nexo-engine.js — Utilidades puras de Nexo Desktop
 * No accede a AppState ni al DOM. Funciones sin efectos secundarios.
 * Expone: window.NexoEngine
 */
(function () {
    'use strict';

    // ─── Normalización de teléfonos y nombres ────────────────────────────────

    function normalizePhoneNumber(phone) {
        if (!phone) return '';
        return phone.toString().replace(/\D/g, '');
    }

    function hasMissingUsername(contact) {
        const rawName = String(contact?.name || '').trim();
        const nameDigits = rawName.replace(/\D/g, '');
        const phoneDigits = normalizePhoneNumber(contact?.phone || '');
        if (!rawName) return true;
        if (/^\d+$/.test(rawName)) return true;
        if (nameDigits && phoneDigits && nameDigits === phoneDigits) return true;
        return false;
    }

    function isApocryphalPhone(phone) {
        const digits = normalizePhoneNumber(phone || '');
        if (!digits) return false;
        if (/^(\d)\1{7,}$/.test(digits)) return true;
        if (/^(012345|123456|987654|000000)/.test(digits)) return true;
        if (digits.startsWith('54')) {
            if (digits.length < 12 || digits.length > 13) return true;
        } else if (digits.length < 10 || digits.length > 15) {
            return true;
        }
        if (digits.includes('0000000')) return true;
        return false;
    }

    function normalizeUsername(name) {
        if (!name) return '';
        return name.toString().toLowerCase().trim();
    }

    function normalizeName(name) {
        return normalizeUsername(name).replace(/\s+/g, ' ').trim();
    }

    function normalizeAlias(alias) {
        if (!alias) return '';
        return alias.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function extractPrimaryAlias(name = '') {
        const base = (name || '').split('/')[0].trim();
        const token = base.split(/\s+/)[0] || base;
        return token.trim();
    }

    // ─── CSV ─────────────────────────────────────────────────────────────────

    function parseCsvRow(line) {
        const out = [];
        let cur = '';
        let q = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (q && line[i + 1] === '"') { cur += '"'; i++; }
                else q = !q;
            } else if (ch === ',' && !q) {
                out.push(cur); cur = '';
            } else cur += ch;
        }
        out.push(cur);
        return out.map(v => v.trim());
    }

    function median(values) {
        if (!values.length) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // ─── Operaciones (OPS) — utilidades puras ────────────────────────────────

    function getOpsSuggestedStatus(lastCargaAt) {
        if (!lastCargaAt) return 'sin revisar';
        const ms = Date.now() - new Date(lastCargaAt).getTime();
        if (Number.isNaN(ms)) return 'sin revisar';
        const hours = ms / 3600000;
        const days = ms / 86400000;
        if (hours <= 48) return 'jugando';
        if (days <= 7) return 'contactado';
        // > 7d y <= 30d → frío, candidato a revinculación
        // > 30d → congelado, devuelve 'revisado' para no reinsertar en cola activa
        return 'revisado';
    }

    function suggestStatusByName(name) {
        try {
            const n = normalizeName(name || '');
            if (!n) return 'sin revisar';
            if (n.includes('vip') || n.includes('high roller')) return 'contactado';
            if (n.includes('activo') || n.includes('hot') || n.includes('reciente')) return 'jugando';
            if (n.includes('dormido') || n.includes('frio') || n.includes('cold')) return 'revisado';
            return 'sin revisar';
        } catch (error) {
            console.warn('[import] suggest fallback', error);
            return 'sin revisar';
        }
    }

    function getOpsHeatLabel(lastCargaAt) {
        if (!lastCargaAt) return { text: 'Sin datos', cls: 'cold', tier: 'none' };
        const ms = Date.now() - new Date(lastCargaAt).getTime();
        if (Number.isNaN(ms)) return { text: 'Fecha inválida', cls: 'cold', tier: 'none' };
        const hours = ms / 3600000;
        const days = ms / 86400000;
        if (hours <= 48) return { text: '🔥 Jugando Activo', cls: 'hot', tier: 'active' };
        if (days <= 7) return { text: '⏳ Tibio', cls: '', tier: 'warm' };
        if (days <= 30) return { text: '🧊 Target Revinculación', cls: 'cold', tier: 'cold' };
        return { text: '💀 Inactivo (Congelado)', cls: 'cold', tier: 'frozen' };
    }

    function calcDominantShift(hourHist) {
        if (!Array.isArray(hourHist) || hourHist.length !== 24) return { shift: '', label: '', emoji: '', pct: 0 };
        const tm = (hourHist[6] || 0) + (hourHist[7] || 0) + (hourHist[8] || 0) + (hourHist[9] || 0) + (hourHist[10] || 0) + (hourHist[11] || 0) + (hourHist[12] || 0) + (hourHist[13] || 0);
        const tt = (hourHist[14] || 0) + (hourHist[15] || 0) + (hourHist[16] || 0) + (hourHist[17] || 0) + (hourHist[18] || 0) + (hourHist[19] || 0) + (hourHist[20] || 0) + (hourHist[21] || 0);
        const tn = (hourHist[22] || 0) + (hourHist[23] || 0) + (hourHist[0] || 0) + (hourHist[1] || 0) + (hourHist[2] || 0) + (hourHist[3] || 0) + (hourHist[4] || 0) + (hourHist[5] || 0);
        const total = tm + tt + tn;
        if (total === 0) return { shift: '', label: '', emoji: '', pct: 0 };
        const maxVal = Math.max(tm, tt, tn);
        if (maxVal === tm) return { shift: 'TM', label: '🌅 Predilección: TM', emoji: '🌅', pct: Math.round((tm / total) * 100) };
        if (maxVal === tt) return { shift: 'TT', label: '☀️ Predilección: TT', emoji: '☀️', pct: Math.round((tt / total) * 100) };
        return { shift: 'TN', label: '🌙 Líder: TN', emoji: '🌙', pct: Math.round((tn / total) * 100) };
    }

    // ─── Búsqueda y filtros ───────────────────────────────────────────────────

    function normalizeSearchText(value) {
        return (value || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    function parseSearchQuery(rawQuery) {
        const normalized = normalizeSearchText(rawQuery);
        const tokens = normalized.split(/\s+/).filter(Boolean);
        const parsed = { terms: [], status: '', origin: '', shift: '' };
        tokens.forEach(token => {
            if (token.startsWith('estado:') || token.startsWith('status:')) {
                parsed.status = token.split(':').slice(1).join(' ').trim();
                return;
            }
            if (token.startsWith('origen:') || token.startsWith('origin:')) {
                parsed.origin = token.split(':').slice(1).join(' ').trim();
                return;
            }
            if (token.startsWith('turno:') || token.startsWith('shift:')) {
                parsed.shift = token.split(':').slice(1).join(' ').trim();
                return;
            }
            parsed.terms.push(token);
        });
        return parsed;
    }

    function buildContactDerivedFields(contact) {
        if (!contact) return;
        const source = [
            contact.name,
            contact.phone,
            contact.origin,
            contact.status,
            contact.alias,
            contact.assignedShift,
            contact.ops?.heat,
            contact.ops?.suggestedStatus
        ].map(v => v || '').join('|');
        if (contact._derivedSource === source) return;
        contact._nameKey = normalizeSearchText(contact.name || '');
        contact._searchKey = normalizeSearchText([
            contact.name,
            contact.phone,
            contact.origin,
            contact.status,
            contact.alias,
            contact.assignedShift,
            contact.ops?.heat,
            contact.ops?.suggestedStatus
        ].filter(Boolean).join(' | '));
        contact._derivedSource = source;
    }

    // ─── Prioridad de estados ─────────────────────────────────────────────────

    function getStatusRank(status) {
        const map = {
            'sin revisar': 0,
            'contactado': 1,
            'revisado': 2,
            'jugando': 3,
            'no interesado': 1,
            'sin wsp': 0
        };
        return map[status] ?? 0;
    }

    function getHigherPriorityStatus(currentStatus, suggestedStatus) {
        if (!suggestedStatus) return currentStatus;
        if (currentStatus === 'sin wsp') return currentStatus;
        return getStatusRank(suggestedStatus) > getStatusRank(currentStatus) ? suggestedStatus : currentStatus;
    }

    function intersectIds(baseIds, allowedSet) {
        if (!allowedSet) return baseIds;
        return baseIds.filter((id) => allowedSet.has(id));
    }

    // ─── STATUS_OPTIONS lookup ────────────────────────────────────────────────

    function getStatusOption(status) {
        const opts = window.STATUS_OPTIONS || [];
        return opts.find(s => s.id === status) || opts[0] || { id: status, label: status, icon: 'fa-circle', color: '#9ca3af', rgb: '156, 163, 175' };
    }

    // ─── Helpers de contacto ──────────────────────────────────────────────────

    function isRecontactDue(contact) {
        if (contact.status !== 'revisado') return false;
        const lastEditTime = contact.lastEditedAt || contact.lastUpdated;
        if (!lastEditTime) return false;
        const hoursElapsed = (Date.now() - new Date(lastEditTime).getTime()) / 3600000;
        return hoursElapsed > 48;
    }

    function getContactUrgency(contact) {
        if (contact.status !== 'revisado') return null;
        const base = contact.reviewedAt || contact.lastUpdated;
        if (!base) return null;
        const elapsedH = (Date.now() - new Date(base).getTime()) / 36e5;
        if (elapsedH < 16) return null;
        if (elapsedH < 24) return { level: 1, label: '16h', title: 'Revisado hace más de 16 horas' };
        if (elapsedH < 48) return { level: 2, label: '1 día', title: 'Revisado hace más de 1 día' };
        if (elapsedH < 72) return { level: 3, label: '2 días', title: 'Revisado hace más de 2 días' };
        return { level: 4, label: '3+ días', title: 'Revisado hace más de 3 días' };
    }

    function getMessageSentBadge(contact) {
        if (!contact?.lastMessageSentAt) return '';
        const sentAt = new Date(contact.lastMessageSentAt);
        const title = `Mensaje enviado: ${sentAt.toLocaleString('es-ES')}`;
        return `<span class="message-sent-tick" title="${title}"><i class="fas fa-check-double"></i></span>`;
    }

    // ─── Turnos — utilidades de fecha/hora puras ──────────────────────────────

    function getLocalCompetitionShift(date = new Date()) {
        const hour = date.getHours();
        if (hour >= 6 && hour < 14) return 'tm';
        if (hour >= 14 && hour < 22) return 'tt';
        return 'tn';
    }

    function getShiftDateRange(shiftKey, referenceDate = new Date()) {
        const d = new Date(referenceDate);
        const y = d.getFullYear(), mo = d.getMonth(), day = d.getDate();
        if (shiftKey === 'tm') return { from: new Date(y, mo, day, 6, 0, 0), to: new Date(y, mo, day, 13, 59, 59, 999) };
        if (shiftKey === 'tt') return { from: new Date(y, mo, day, 14, 0, 0), to: new Date(y, mo, day, 21, 59, 59, 999) };
        const prevDay = new Date(y, mo, day - 1);
        return {
            from: new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 22, 0, 0),
            to: new Date(y, mo, day, 5, 59, 59, 999)
        };
    }

    function inferShiftFromIso(isoString) {
        if (!isoString) return '';
        const dt = new Date(isoString);
        if (Number.isNaN(dt.getTime())) return '';
        return getLocalCompetitionShift(dt);
    }

    // ─── Registro público ─────────────────────────────────────────────────────

    window.NexoEngine = {
        normalizePhoneNumber,
        hasMissingUsername,
        isApocryphalPhone,
        normalizeUsername,
        normalizeName,
        normalizeAlias,
        extractPrimaryAlias,
        parseCsvRow,
        median,
        getOpsSuggestedStatus,
        suggestStatusByName,
        getOpsHeatLabel,
        calcDominantShift,
        normalizeSearchText,
        parseSearchQuery,
        buildContactDerivedFields,
        getStatusRank,
        getHigherPriorityStatus,
        intersectIds,
        getStatusOption,
        isRecontactDue,
        getContactUrgency,
        getMessageSentBadge,
        getLocalCompetitionShift,
        getShiftDateRange,
        inferShiftFromIso
    };

    console.log('[NexoEngine] ✅ Motor de utilidades listo. ' + Object.keys(window.NexoEngine).length + ' funciones.');
})();
