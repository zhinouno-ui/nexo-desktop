const assert = require('assert');

function makeBaseline(users) {
  const map = {};
  for (const u of users) {
    const key = (u.phone || u.id || '').toString();
    if (!key) continue;
    map[key] = { status: u.status || 'sin revisar', name: u.name || '' };
  }
  return map;
}

function makeDelta(baseline, current) {
  const now = makeBaseline(current);
  const newUsers = [];
  const statusChanges = [];
  for (const [key, cur] of Object.entries(now)) {
    const old = baseline[key];
    if (!old) {
      newUsers.push({ key, ...cur });
      continue;
    }
    if (old.status !== cur.status) statusChanges.push({ key, from: old.status, to: cur.status });
  }
  return { newUsers, statusChanges };
}

(function run() {
  const monthUsers = [
    { id: 1, phone: '111', name: 'Ana', status: 'sin revisar' },
    { id: 2, phone: '222', name: 'Beto', status: 'contactado' }
  ];
  const baseline = makeBaseline(monthUsers);
  const todayUsers = [
    { id: 1, phone: '111', name: 'Ana', status: 'jugando' },
    { id: 2, phone: '222', name: 'Beto', status: 'contactado' },
    { id: 3, phone: '333', name: 'Caro', status: 'sin revisar' }
  ];

  const delta = makeDelta(baseline, todayUsers);
  assert.equal(delta.newUsers.length, 1, 'Debe detectar 1 usuario nuevo');
  assert.equal(delta.statusChanges.length, 1, 'Debe detectar 1 cambio de estado');
  assert.equal(delta.statusChanges[0].from, 'sin revisar');
  assert.equal(delta.statusChanges[0].to, 'jugando');

  console.log('selfcheck exports ok');
})();
