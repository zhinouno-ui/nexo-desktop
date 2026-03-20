(function () {
  'use strict';

  const nowTs = () => Date.now();
  const CONTROL_MINUTES = 30;
  const CONTROL_KEY = 'nexo-admin-access';

  async function hasAccess() {
    try {
      const stored = localStorage.getItem(CONTROL_KEY);
      if (!stored) return false;
      const result = JSON.parse(stored);
      if (!result?.expiresAt) return false;
      return nowTs() <= Number(result.expiresAt);
    } catch (_) {
      return false;
    }
  }

  async function ensureUploadUnlocked({ profileId = 'default', onAudit = () => {}, onSave = () => {}, notify = () => {} } = {}) {
    const already = await hasAccess();
    if (already) return true;

    const typed = window.prompt('Clave de administrador para habilitar uploads');
    if (!typed) return false;
    if (typed !== 'Nexo2024!') {
      notify('Clave incorrecta', 'error');
      return false;
    }

    const result = {
      unlockedAt: nowTs(),
      expiresAt: nowTs() + (CONTROL_MINUTES * 60 * 1000),
      profileId,
      method: 'password'
    };

    try {
      localStorage.setItem(CONTROL_KEY, JSON.stringify(result));
      onAudit({ action: 'admin-unlock', profileId, method: 'password' });
      onSave();
      const remainMin = Math.max(1, Math.round(((Number(result?.expiresAt || 0) - nowTs()) / 60000)));
      notify(`Acceso admin habilitado (${remainMin} min)`, 'success');
      return true;
    } catch (error) {
      console.error('[ADMIN-AUTH] Error guardando acceso:', error);
      notify('Error al habilitar acceso', 'error');
      return false;
    }
  }

  // Exponer funciones globalmente
    window.hasAccess = hasAccess;
    window.ensureUploadUnlocked = ensureUploadUnlocked;
    
    // Registrar módulo en el bridge
    if (window.NexoBridge) {
        window.NexoBridge.register('auth');
    } else {
        console.warn('[ADMIN-AUTH] NexoBridge no disponible');
    }
    
    console.log('[ADMIN-AUTH] ✅ Módulo de autenticación cargado');

})();
