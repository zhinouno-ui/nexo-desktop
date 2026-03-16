    (() => {
        const hasBridge = !!(window.nexoStore && typeof window.nexoStore.getAll === 'function');
        if (!hasBridge) {
            window.__nexoStoreReady = Promise.resolve();
            return;
        }
        if (typeof window.nexoStore.getState !== 'function') {
            window.nexoStore.getState = () => window.nexoStore.getAll();
        }

        const emitStoreError = (message) => {
            window.dispatchEvent(new CustomEvent('nexo-store-error', { detail: message }));
            console.error(message);
        };

        const state = { map: {}, saveTimer: null, pendingFlush: false, lastFlushAt: 0 };
        const KNOWN_KEYS = new Set(['contactsData', 'contactsHistory', 'whatsappTemplate', 'duplicateMergeMode', 'lastExportAt', 'backups', 'extraStorage']);

        const mapFromDb = (db) => {
            const nextMap = {};
            nextMap.contactsData = JSON.stringify(Array.isArray(db.contactsData) ? db.contactsData : []);
            nextMap.contactsHistory = JSON.stringify(Array.isArray(db.contactsHistory) ? db.contactsHistory : []);
            nextMap.whatsappTemplate = typeof db.whatsappTemplate === 'string' ? db.whatsappTemplate : 'Hola {usuario}, ¿cómo estás? Te escribo por la propuesta que vimos.';
            nextMap.duplicateMergeMode = typeof db.duplicateMergeMode === 'string' ? db.duplicateMergeMode : 'phone-auto';
            if (db.lastExportAt) nextMap.lastExportAt = String(db.lastExportAt);
            if (db.backups && typeof db.backups === 'object') {
                Object.entries(db.backups).forEach(([key, value]) => {
                    nextMap[`bk_${key}`] = JSON.stringify(value);
                });
            }
            if (db.extraStorage && typeof db.extraStorage === 'object') {
                Object.entries(db.extraStorage).forEach(([key, value]) => {
                    if (typeof value === 'string') nextMap[key] = value;
                });
            }
            return nextMap;
        };

        const parseJson = (raw, fallback) => {
            if (!raw) return fallback;
            try { return JSON.parse(raw); } catch (_) { return fallback; }
        };

        const dbFromMap = (map) => {
            const backups = {};
            const extraStorage = {};
            Object.entries(map).forEach(([key, value]) => {
                if (key.startsWith('bk_')) {
                    backups[key.slice(3)] = parseJson(value, []);
                } else if (!KNOWN_KEYS.has(key)) {
                    extraStorage[key] = String(value);
                }
            });
            return {
                contactsData: parseJson(map.contactsData, []),
                contactsHistory: parseJson(map.contactsHistory, []),
                whatsappTemplate: map.whatsappTemplate || 'Hola {usuario}, ¿cómo estás? Te escribo por la propuesta que vimos.',
                duplicateMergeMode: map.duplicateMergeMode || 'phone-auto',
                lastExportAt: map.lastExportAt || null,
                backups,
                extraStorage
            };
        };

        const flushToDisk = async () => {
            try {
                await window.nexoStore.setAll(dbFromMap(state.map));
            } catch (error) {
                emitStoreError(`No se pudo guardar en disco: ${error.message || error}`);
            }
        };

        const FLUSH_DEBOUNCE_MS = 1800;
        const FLUSH_MAX_WAIT_MS = 3000;
        const scheduleFlush = () => {
            clearTimeout(state.saveTimer);
            const elapsed = Date.now() - (state.lastFlushAt || 0);
            const delay = elapsed > FLUSH_MAX_WAIT_MS ? 50 : FLUSH_DEBOUNCE_MS;
            state.saveTimer = setTimeout(() => {
                if (state.pendingFlush) return;
                state.pendingFlush = true;
                const run = async () => {
                    try { await flushToDisk(); } finally {
                        state.pendingFlush = false;
                        state.lastFlushAt = Date.now();
                    }
                };
                if (typeof requestIdleCallback === 'function') requestIdleCallback(() => { run(); }, { timeout: 1200 });
                else setTimeout(() => { run(); }, 0);
            }, delay);
        };

        const storageShim = {
            getItem(key) {
                const value = state.map[String(key)];
                return value === undefined ? null : value;
            },
            setItem(key, value) {
                state.map[String(key)] = String(value);
                scheduleFlush();
            },
            removeItem(key) {
                delete state.map[String(key)];
                scheduleFlush();
            },
            clear() {
                state.map = {};
                scheduleFlush();
            },
            key(index) {
                return Object.keys(state.map)[index] ?? null;
            },
            get length() {
                return Object.keys(state.map).length;
            }
        };

        const installShim = () => {
            try {
                Object.defineProperty(window, 'localStorage', { value: storageShim, configurable: true });
            } catch (_) {
                const proto = Object.getPrototypeOf(window.localStorage);
                proto.getItem = storageShim.getItem;
                proto.setItem = storageShim.setItem;
                proto.removeItem = storageShim.removeItem;
                proto.clear = storageShim.clear;
                proto.key = storageShim.key;
                Object.defineProperty(proto, 'length', { get: () => Object.keys(state.map).length });
            }
        };

        window.__nexoStoreReady = (async () => {
            try {
                const db = await window.nexoStore.getAll();
                state.map = mapFromDb(db || {});
                installShim();
            } catch (error) {
                emitStoreError(`No se pudo cargar la base local: ${error.message || error}`);
                installShim();
            }
        })();
    })();
    
