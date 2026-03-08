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
    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    if (type === 'daily-log') {
      const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
      const transitions = Array.isArray(payload.transitions) ? payload.transitions : [];
      const touched = contacts.filter((c) => {
        const at = c?.lastEditedAt || c?.lastUpdated || '';
        return at && String(at).slice(0, 10) === day;
      });
      const rows = transitions.filter((t) => String(t?.at || '').slice(0, 10) === day).map((t) => ({
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
