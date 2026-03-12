function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildProfileRows(profileList, profileCounts) {
  const rows = [];
  (profileList || []).forEach((profile, index) => {
    const profileId = profile?.id || `profile_${index}`;
    const profileName = String(profile?.name || `Perfil ${index + 1}`);
    const contactsForProfile = profileCounts?.[profileId] || 0;
    const canDelete = profileId !== 'default';
    rows.push(`
      <div class="history-item" style="display:flex;justify-content:space-between;align-items:center;">
        <div><strong>${escapeHtml(profileName)}</strong><div class="history-item-muted">${contactsForProfile} contactos</div></div>
        <div style="display:flex;gap:8px;">
          <button class="btn" data-profile-action="open" data-profile-id="${escapeHtml(profileId)}">Abrir</button>
          <button class="btn" data-profile-action="rename" data-profile-id="${escapeHtml(profileId)}">Renombrar</button>${canDelete ? `<button class="btn btn-danger" data-profile-action="delete" data-profile-id="${escapeHtml(profileId)}">Borrar</button>` : ''}
        </div>
      </div>
    `);
  });
  return rows.join('');
}

window.NexoProfilesUI = {
  buildProfileRows
};

export { buildProfileRows };
