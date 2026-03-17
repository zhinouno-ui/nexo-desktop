const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');

const DEFAULT_PROFILE = { id: 'default', name: 'Base principal' };

function safeSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase() || 'perfil';
}

function getProfilesMetaPath(userDataPath) {
  return path.join(userDataPath, 'profiles.json');
}

function getProfilesDir(userDataPath) {
  return path.join(userDataPath, 'profiles');
}

function getProfileFilePath(userDataPath, fileName) {
  return path.join(getProfilesDir(userDataPath), fileName);
}

async function resolveUniqueProfileFileName(userDataPath, baseName) {
  await fs.mkdir(getProfilesDir(userDataPath), { recursive: true });
  let candidate = `${baseName}.json`;
  let n = 2;
  while (fssync.existsSync(getProfileFilePath(userDataPath, candidate))) {
    candidate = `${baseName}-${n}.json`;
    n += 1;
  }
  return candidate;
}

async function ensureProfileStorageFile(userDataPath, profile) {
  if (!profile || !profile.id) return profile;
  await fs.mkdir(getProfilesDir(userDataPath), { recursive: true });
  if (!profile.fileName) {
    const base = `${safeSlug(profile.name)}-${safeSlug(profile.id)}`;
    const preferred = `${base}.json`;
    const preferredPath = getProfileFilePath(userDataPath, preferred);
    profile.fileName = fssync.existsSync(preferredPath)
      ? preferred
      : await resolveUniqueProfileFileName(userDataPath, base);
  }
  const fullPath = getProfileFilePath(userDataPath, profile.fileName);
  if (!fssync.existsSync(fullPath)) {
    const payload = {
      id: profile.id,
      name: profile.name,
      createdAt: new Date().toISOString(),
      contactsData: [],
      contactsHistory: []
    };
    await fs.writeFile(fullPath, JSON.stringify(payload, null, 2), 'utf8');
  }
  return profile;
}

async function readProfilesMeta(userDataPath) {
  const fallback = [DEFAULT_PROFILE];
  try {
    const raw = await fs.readFile(getProfilesMetaPath(userDataPath), 'utf8');
    const parsed = JSON.parse(raw);
    const profiles = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
    const safeProfiles = profiles.length ? profiles : fallback;
    for (const profile of safeProfiles) {
      await ensureProfileStorageFile(userDataPath, profile);
    }
    return safeProfiles;
  } catch {
    for (const profile of fallback) {
      await ensureProfileStorageFile(userDataPath, profile);
    }
    return fallback;
  }
}

async function writeProfilesMeta(userDataPath, profiles) {
  const safe = Array.isArray(profiles) && profiles.length ? profiles : [DEFAULT_PROFILE];
  for (const profile of safe) {
    await ensureProfileStorageFile(userDataPath, profile);
  }
  await fs.mkdir(path.dirname(getProfilesMetaPath(userDataPath)), { recursive: true });
  await fs.writeFile(getProfilesMetaPath(userDataPath), JSON.stringify({ profiles: safe }, null, 2), 'utf8');
  return safe;
}

async function readProfileData(userDataPath, profile) {
  const ensured = await ensureProfileStorageFile(userDataPath, profile);
  const fullPath = getProfileFilePath(userDataPath, ensured.fileName);
  try {
    const raw = await fs.readFile(fullPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      contactsData: Array.isArray(parsed?.contactsData) ? parsed.contactsData : [],
      contactsHistory: Array.isArray(parsed?.contactsHistory) ? parsed.contactsHistory : []
    };
  } catch {
    return { id: profile.id, name: profile.name, contactsData: [], contactsHistory: [] };
  }
}

async function writeProfileData(userDataPath, profile, payload = {}) {
  const ensured = await ensureProfileStorageFile(userDataPath, profile);
  const fullPath = getProfileFilePath(userDataPath, ensured.fileName);
  const current = await readProfileData(userDataPath, ensured);
  const next = {
    ...current,
    ...payload,
    id: profile.id,
    name: profile.name,
    contactsData: Array.isArray(payload?.contactsData) ? payload.contactsData : Array.isArray(current.contactsData) ? current.contactsData : [],
    contactsHistory: Array.isArray(payload?.contactsHistory) ? payload.contactsHistory : Array.isArray(current.contactsHistory) ? current.contactsHistory : [],
    updatedAt: new Date().toISOString()
  };
  const tmpPath = `${fullPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2), 'utf8');
  await fs.rename(tmpPath, fullPath);
  return next;
}

function splitByProfile(items = []) {
  const byProfile = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const profileId = String(item?.profileId || 'default');
    const bucket = byProfile.get(profileId) || [];
    bucket.push(item);
    byProfile.set(profileId, bucket);
  }
  return byProfile;
}

async function loadProfilesState(userDataPath, profiles) {
  const allContacts = [];
  const allHistory = [];
  const previewByProfile = Object.create(null);

  for (const profile of profiles) {
    const profileState = await readProfileData(userDataPath, profile);
    const contacts = (profileState.contactsData || []).map((c) => ({ ...c, profileId: c?.profileId || profile.id }));
    const history = (profileState.contactsHistory || []).map((h) => ({ ...h, profileId: h?.profileId || profile.id }));
    previewByProfile[profile.id] = contacts.length;
    allContacts.push(...contacts);
    allHistory.push(...history);
  }

  return { contactsData: allContacts, contactsHistory: allHistory, previewByProfile };
}

async function persistProfilesState(userDataPath, profiles, state = {}) {
  const contactsByProfile = splitByProfile(state.contactsData || []);
  const historyByProfile = splitByProfile(state.contactsHistory || []);

  for (const profile of profiles) {
    await writeProfileData(userDataPath, profile, {
      contactsData: contactsByProfile.get(profile.id) || [],
      contactsHistory: historyByProfile.get(profile.id) || []
    });
  }
}

module.exports = {
  safeSlug,
  getProfilesDir,
  getProfilesMetaPath,
  getProfileFilePath,
  resolveUniqueProfileFileName,
  ensureProfileStorageFile,
  readProfilesMeta,
  writeProfilesMeta,
  readProfileData,
  writeProfileData,
  loadProfilesState,
  persistProfilesState
};
