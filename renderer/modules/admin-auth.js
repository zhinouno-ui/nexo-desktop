function nowTs() {
  return Date.now();
}

async function hasAccess() {
  try {
    const res = await window.electronAPI?.hasAdminAccess?.();
    return !!res?.ok;
  } catch (_) {
    return false;
  }
}

async function ensureUploadUnlocked({ profileId = 'default', onAudit = () => {}, onSave = () => {}, notify = () => {} } = {}) {
  const already = await hasAccess();
  if (already) return true;

  const typed = window.prompt('Clave para subir reporte');
  if (!typed) {
    onAudit({ at: new Date().toISOString(), profileId, ok: false, action: 'upload-auth' });
    onSave();
    return false;
  }

  const result = await window.electronAPI?.verifyAdminPassword?.(typed);
  const ok = !!result?.ok;
  onAudit({ at: new Date().toISOString(), profileId, ok, action: 'upload-auth', expiresAt: result?.expiresAt || 0 });
  onSave();

  if (!ok) {
    notify(result?.message || 'Clave incorrecta para subir reporte', 'error');
    return false;
  }

  const remainMin = Math.max(1, Math.round(((Number(result?.expiresAt || 0) - nowTs()) / 60000)));
  notify(`Acceso admin habilitado (${remainMin} min)`, 'success');
  return true;
}

window.NexoAdminAuth = {
  hasAccess,
  ensureUploadUnlocked
};

// Exponer también globalmente para compatibilidad
window.hasAccess = hasAccess;
window.ensureUploadUnlocked = ensureUploadUnlocked;

export { hasAccess, ensureUploadUnlocked };
