const { parentPort, workerData } = require('worker_threads');

function toCsvRows(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}

(function run() {
  try {
    const payload = workerData || {};
    const type = String(payload.type || 'full');
    const now = new Date(payload.nowIso || Date.now());
    const day = now.toISOString().slice(0, 10);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();
    const nowMs = now.getTime();
    const inLast24h = (iso) => {
      const ts = new Date(iso || 0).getTime();
      return Number.isFinite(ts) && ts >= (nowMs - 24 * 60 * 60 * 1000) && ts <= nowMs;
    };
    const inToday = (iso) => {
      const ts = new Date(iso || 0).getTime();
      return Number.isFinite(ts) && ts >= dayStartMs && ts <= nowMs;
    };

    if (type === 'daily-log') {
      const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
      const transitions = Array.isArray(payload.transitions) ? payload.transitions : [];
      const touched = contacts.filter((c) => {
        const at = c?.lastEditedAt || c?.lastUpdated || '';
        return inLast24h(at);
      });
      const rows = transitions.filter((t) => inLast24h(t?.at)).map((t) => ({
        at: t.at || '',
        contactId: t.contactId || '',
        from: t.from || '',
        to: t.to || '',
        profileId: t.profileId || '',
        shift: t.shift || ''
      }));
      const json = {
        exportType: 'nexo-daily-log-v1',
        exportedAt: new Date().toISOString(),
        day,
        window: { from: new Date(nowMs - 24 * 60 * 60 * 1000).toISOString(), to: now.toISOString() },
        todayCount: transitions.filter((t) => inToday(t?.at)).length,
        touchedUsers: touched,
        transitions: rows
      };
      parentPort.postMessage({ ok: true, jsonText: JSON.stringify(json, null, 2), csvText: toCsvRows(rows) });
      return;
    }

    const full = {
      exportType: 'nexo-full-backup-v1',
      exportedAt: new Date().toISOString(),
      state: payload.state || {}
    };
    parentPort.postMessage({ ok: true, jsonText: JSON.stringify(full, null, 2) });
  } catch (error) {
    parentPort.postMessage({ ok: false, message: error?.message || String(error) });
  }
})();
