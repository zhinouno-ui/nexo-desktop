// nexo-metrics.js — Capa unificada de lectura de métricas de operación.
//
// Fuente de verdad: AppState.opsProfiles[alias].opsGranular (array inmutable de ops).
// Cada op: { ts: number, amount: number, shift: 'tm'|'tt'|'tn', date: 'YYYY-MM-DD' }.
//
// Reglas de turno:
//   tm = 06:00–13:59  |  tt = 14:00–21:59  |  tn = 22:00–05:59 (cruza medianoche)
//
// Día operativo: el día al que pertenece el turno.
//   Ej: evento a las 01:30 del 22/04 → día operativo 21/04, turno tn.
//   Así "ver ayer a las 06:40 de hoy" siempre funciona aunque sean las 05:00.
//
// Nunca muta estado. No guarda. Solo lee y agrega.

(function () {
    'use strict';

    const SHIFT_TM_START = 6;   // 06:00
    const SHIFT_TT_START = 14;  // 14:00
    const SHIFT_TN_START = 22;  // 22:00

    // Clasifica una fecha (ts ms) a turno + día operativo.
    // Si es 00:00–05:59 Y el op tiene shift/date propios (CSV sin hora), los usa
    // directamente en vez de asumir TN del día anterior — evita desplazar ops
    // de CSVs que solo tienen fecha sin componente horario.
    // Si es 00:00–05:59 con hora real conocida → TN del día anterior (regla operativa).
    function classifyTs(ts, opShift, opDate) {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return null;
        const h = d.getHours();
        const m = d.getMinutes();
        const s = d.getSeconds();
        const ms = d.getMilliseconds();
        // Si el ts tiene hora exactamente 00:00:00.000 Y viene con shift/date del worker,
        // el CSV no tenía hora → respetar lo que calculó el worker.
        const noTimeComponent = (h === 0 && m === 0 && s === 0 && ms === 0);
        if (noTimeComponent && opShift && opDate) {
            return {
                shift: opShift,
                operDay: opDate,
                calDay: opDate,
                hour: 0,
                month: opDate.slice(0, 7)
            };
        }
        let shift, operDay;
        if (h >= SHIFT_TM_START && h < SHIFT_TT_START) {
            shift = 'tm';
            operDay = d;
        } else if (h >= SHIFT_TT_START && h < SHIFT_TN_START) {
            shift = 'tt';
            operDay = d;
        } else if (h >= SHIFT_TN_START) {
            shift = 'tn';
            operDay = d;
        } else {
            // 00:00–05:59 con hora real → tn del día anterior
            shift = 'tn';
            operDay = new Date(d.getTime() - 86400000);
        }
        return {
            shift,
            operDay: isoDate(operDay),
            calDay: isoDate(d),
            hour: h,
            month: isoMonth(operDay)
        };
    }

    function isoDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function isoMonth(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }

    // Itera todas las ops de todos los alias sin materializar el array completo.
    function* iterateAllOps(opsProfiles) {
        const aliases = Object.keys(opsProfiles || {});
        for (let i = 0; i < aliases.length; i++) {
            const alias = aliases[i];
            const prof = opsProfiles[alias];
            const granular = (prof && prof.opsGranular) || [];
            for (let j = 0; j < granular.length; j++) {
                const op = granular[j];
                if (!op || typeof op.ts !== 'number') continue;
                yield { alias, op };
            }
        }
    }

    // Devuelve el día operativo para "ahora" — útil para consultas relativas.
    function getOperDayForNow() {
        return classifyTs(Date.now()).operDay;
    }

    // Devuelve operDay N días atrás del de hoy.
    function operDayOffset(daysBack) {
        const today = classifyTs(Date.now()).operDay;
        const d = new Date(today + 'T12:00:00');
        d.setDate(d.getDate() - daysBack);
        return isoDate(d);
    }

    // query({ operDay?, fromOperDay?, toOperDay?, shift?, alias?, month?, kind? })
    //   kind: 'carga' (amount>0), 'retiro' (amount<0), 'all' (default)
    // Retorna: { count, cargas, retiros, volumenCargas, volumenRetiros, neto, uniqueAliases, byShift, byOperDay, items? }
    function query(filters = {}) {
        const state = window.AppState || {};
        const opsProfiles = state.opsProfiles || {};
        const {
            operDay = null,
            fromOperDay = null,
            toOperDay = null,
            shift = null,
            alias = null,
            month = null,
            kind = 'all',
            includeItems = false,
            itemsLimit = 500
        } = filters;

        const aliasKey = alias ? String(alias).toLowerCase().replace(/[^a-z0-9]/g, '') : null;

        const result = {
            count: 0,
            cargas: 0,
            retiros: 0,
            volumenCargas: 0,
            volumenRetiros: 0,
            neto: 0,
            uniqueAliases: 0,
            byShift: { tm: 0, tt: 0, tn: 0 },
            byShiftVolume: { tm: 0, tt: 0, tn: 0 },
            byOperDay: {},
            items: includeItems ? [] : undefined
        };
        const aliasSet = new Set();

        for (const { alias: a, op } of iterateAllOps(opsProfiles)) {
            if (aliasKey && a !== aliasKey) continue;
            const cls = classifyTs(op.ts, op.shift, op.date);
            if (!cls) continue;
            if (operDay && cls.operDay !== operDay) continue;
            if (fromOperDay && cls.operDay < fromOperDay) continue;
            if (toOperDay && cls.operDay > toOperDay) continue;
            if (month && cls.month !== month) continue;
            if (shift && cls.shift !== shift) continue;

            const isCarga = op.amount > 0;
            const isRetiro = op.amount < 0;
            if (kind === 'carga' && !isCarga) continue;
            if (kind === 'retiro' && !isRetiro) continue;

            result.count++;
            aliasSet.add(a);
            if (isCarga) {
                result.cargas++;
                result.volumenCargas += op.amount;
            } else if (isRetiro) {
                result.retiros++;
                result.volumenRetiros += Math.abs(op.amount);
            }
            result.neto += op.amount;
            result.byShift[cls.shift] = (result.byShift[cls.shift] || 0) + 1;
            if (isCarga) result.byShiftVolume[cls.shift] = (result.byShiftVolume[cls.shift] || 0) + op.amount;

            if (!result.byOperDay[cls.operDay]) {
                result.byOperDay[cls.operDay] = { count: 0, cargas: 0, retiros: 0, volumenCargas: 0, volumenRetiros: 0, byShift: { tm: 0, tt: 0, tn: 0 } };
            }
            const bd = result.byOperDay[cls.operDay];
            bd.count++;
            if (isCarga) { bd.cargas++; bd.volumenCargas += op.amount; }
            else if (isRetiro) { bd.retiros++; bd.volumenRetiros += Math.abs(op.amount); }
            bd.byShift[cls.shift]++;

            if (includeItems && result.items.length < itemsLimit) {
                result.items.push({ alias: a, ts: op.ts, amount: op.amount, shift: cls.shift, operDay: cls.operDay, calDay: cls.calDay, hour: cls.hour });
            }
        }

        result.uniqueAliases = aliasSet.size;
        return result;
    }

    // Serie mensual para los últimos N meses operativos.
    // Retorna: { [YYYY-MM]: { cargas, retiros, volumenCargas, volumenRetiros, uniqueAliases, newAliases } }
    function monthlySeries(monthsBack = 12) {
        const state = window.AppState || {};
        const opsProfiles = state.opsProfiles || {};
        const now = new Date();
        const wanted = new Set();
        const keys = [];
        for (let i = monthsBack - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const k = isoMonth(d);
            wanted.add(k);
            keys.push(k);
        }

        const acc = {};
        const aliasesByMonth = {};
        const firstSeenMonthByAlias = {};

        for (const { alias, op } of iterateAllOps(opsProfiles)) {
            const cls = classifyTs(op.ts, op.shift, op.date);
            if (!cls) continue;
            const mk = cls.month;
            if (!firstSeenMonthByAlias[alias] || mk < firstSeenMonthByAlias[alias]) {
                firstSeenMonthByAlias[alias] = mk;
            }
            if (!wanted.has(mk)) continue;

            if (!acc[mk]) acc[mk] = { cargas: 0, retiros: 0, volumenCargas: 0, volumenRetiros: 0, uniqueAliases: 0, newAliases: 0 };
            if (!aliasesByMonth[mk]) aliasesByMonth[mk] = new Set();
            aliasesByMonth[mk].add(alias);

            if (op.amount > 0) { acc[mk].cargas++; acc[mk].volumenCargas += op.amount; }
            else if (op.amount < 0) { acc[mk].retiros++; acc[mk].volumenRetiros += Math.abs(op.amount); }
        }

        // newAliases = alias cuyo firstSeen es ESTE mes
        for (const mk of keys) {
            if (!acc[mk]) continue;
            const set = aliasesByMonth[mk] || new Set();
            acc[mk].uniqueAliases = set.size;
            let newCount = 0;
            for (const a of set) if (firstSeenMonthByAlias[a] === mk) newCount++;
            acc[mk].newAliases = newCount;
        }

        return { months: acc, keys };
    }

    // Rebuild de derivados de un perfil desde su opsGranular. Puro — no toca estado.
    // Reemplaza la lógica bugueada de mergeOpsProfiles (Math.max, avg naive, etc.).
    function rebuildProfileDerived(granular, aliasLabel) {
        const g = Array.isArray(granular) ? granular : [];
        const now = Date.now();
        let cargasCount = 0, descargasCount = 0, cargadoTotal = 0, descargadoTotal = 0, netoTotal = 0;
        let lastAt = null, lastCargaAt = null;
        const cargasVals = [];
        const hourHist = Array(24).fill(0);
        const shiftBreakdown = { tm: 0, tt: 0, tn: 0 };
        const weeks30 = new Set();
        const months90 = new Set();
        let cargas30d = 0, cargado30d = 0, cargado90d = 0;

        for (let i = 0; i < g.length; i++) {
            const op = g[i];
            if (!op || typeof op.ts !== 'number') continue;
            const cls = classifyTs(op.ts, op.shift, op.date);
            if (!cls) continue;
            const amount = Number(op.amount) || 0;
            netoTotal += amount;
            hourHist[cls.hour] += 1;
            if (!lastAt || op.ts > lastAt) lastAt = op.ts;
            const ageDays = (now - op.ts) / 86400000;

            if (amount > 0) {
                cargasCount++;
                cargadoTotal += amount;
                cargasVals.push(amount);
                if (!lastCargaAt || op.ts > lastCargaAt) lastCargaAt = op.ts;
                shiftBreakdown[cls.shift]++;
                if (ageDays <= 30) {
                    cargas30d++;
                    cargado30d += amount;
                    const d = new Date(op.ts);
                    const wk = String(d.getFullYear()) + '-' + String(Math.ceil((((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + d.getDay() + 1) / 7));
                    weeks30.add(wk);
                }
                if (ageDays <= 90) {
                    cargado90d += amount;
                    const d = new Date(op.ts);
                    months90.add(String(d.getFullYear()) + '-' + String(d.getMonth() + 1));
                }
            } else if (amount < 0) {
                descargasCount++;
                descargadoTotal += Math.abs(amount);
            }
        }

        // Medianas y promedios desde la distribución real
        let avgCarga = 0, medianCarga = 0;
        if (cargasVals.length) {
            avgCarga = Math.round(cargadoTotal / cargasCount);
            const sorted = [...cargasVals].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            medianCarga = Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
        }

        // Top hours
        const topHours = hourHist
            .map((v, i) => ({ h: i, v }))
            .sort((a, b) => b.v - a.v)
            .slice(0, 3)
            .filter(x => x.v > 0)
            .map(x => String(x.h).padStart(2, '0') + ':00');

        // Dominant shift
        const totalShift = shiftBreakdown.tm + shiftBreakdown.tt + shiftBreakdown.tn;
        let dominantShift = null, dominantShiftPct = 0;
        if (totalShift > 0) {
            const top = Object.entries(shiftBreakdown).sort((a, b) => b[1] - a[1])[0];
            dominantShift = top[0];
            dominantShiftPct = Math.round((top[1] / totalShift) * 100);
        }

        const loyalty = (weeks30.size >= 2 ? 1 : 0) + (months90.size >= 2 ? 1 : 0) + (cargado30d >= 50000 ? 1 : 0) + (cargas30d >= 8 ? 1 : 0);
        const recencyDays = lastCargaAt ? (now - lastCargaAt) / 86400000 : 999;
        const recencyScore = Math.max(0, 40 - recencyDays);
        const score = Math.round(recencyScore + Math.min(35, cargas30d * 3) + Math.min(20, cargado90d / 10000) + (loyalty * 8));

        const suggestedStatus = getOpsSuggestedStatus(lastCargaAt);
        const heat = getOpsHeatLabel(lastCargaAt);
        const isFrozen = heat.tier === 'frozen';

        return {
            aliasLabel: aliasLabel || '',
            cargasCount,
            descargasCount,
            cargadoTotal,
            descargadoTotal,
            netoTotal,
            lastAt: lastAt ? new Date(lastAt).toISOString() : null,
            lastCargaAt: lastCargaAt ? new Date(lastCargaAt).toISOString() : null,
            cargas30d,
            cargado30d,
            cargado90d,
            avgCarga,
            medianCarga,
            topHours,
            loyalty,
            score,
            suggestedStatus,
            heat,
            isFrozen,
            dominantShift,
            dominantShiftPct,
            hourHist,
            shiftBreakdown,
            opsGranular: g
        };
    }

    function getOpsSuggestedStatus(lastCargaAt) {
        if (!lastCargaAt) return 'sin revisar';
        const ms = Date.now() - new Date(lastCargaAt).getTime();
        if (Number.isNaN(ms)) return 'sin revisar';
        const h = ms / 3600000, d = ms / 86400000;
        if (h <= 48) return 'jugando';
        if (d <= 7) return 'contactado';
        return 'revisado';
    }

    function getOpsHeatLabel(lastCargaAt) {
        if (!lastCargaAt) return { text: 'Sin datos', cls: 'cold', tier: 'none' };
        const ms = Date.now() - new Date(lastCargaAt).getTime();
        if (Number.isNaN(ms)) return { text: 'Fecha inválida', cls: 'cold', tier: 'none' };
        const h = ms / 3600000, d = ms / 86400000;
        if (h <= 48) return { text: '🔥 Jugando Activo', cls: 'hot', tier: 'active' };
        if (d <= 7) return { text: '⏳ Tibio', cls: '', tier: 'warm' };
        if (d <= 30) return { text: '🧊 Target Revinculación', cls: 'cold', tier: 'cold' };
        return { text: '💀 Inactivo', cls: 'cold', tier: 'frozen' };
    }

    // Merge idempotente de opsGranular: dedup por (ts|amount|alias).
    // Cuando dos ops tienen exactamente el mismo ts+amount+alias son duplicados
    // por definición (misma operación re-exportada en distintos CSVs).
    function mergeGranular(prevGranular, newGranular) {
        const seen = new Set();
        const out = [];
        const push = (op) => {
            if (!op || typeof op.ts !== 'number') return;
            const k = `${op.ts}|${op.amount}`;
            if (seen.has(k)) return;
            seen.add(k);
            out.push(op);
        };
        for (let i = 0; i < (prevGranular || []).length; i++) push(prevGranular[i]);
        for (let i = 0; i < (newGranular || []).length; i++) push(newGranular[i]);
        out.sort((a, b) => a.ts - b.ts);
        return out;
    }

    window.NexoMetrics = {
        classifyTs,
        getOperDayForNow,
        operDayOffset,
        query,
        monthlySeries,
        rebuildProfileDerived,
        mergeGranular,
        isoDate,
        isoMonth
    };

    console.log('[NexoMetrics] módulo de métricas cargado');
})();
