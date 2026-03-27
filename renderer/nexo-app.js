    (async () => {
        const $ = (sel) => document.querySelector(sel);
        const $$ = (sel) => document.querySelectorAll(sel);

        const STATUS_OPTIONS = [
            { id: 'sin revisar', label: 'Sin Revisar', icon: 'fa-question-circle', color: '#9ca3af', rgb: '156, 163, 175' },
            { id: 'contactado', label: 'Contactado', icon: 'fa-check-circle', color: '#10b981', rgb: '16, 185, 129' },
            { id: 'revisado', label: 'Revisado', icon: 'fa-user-check', color: '#34d399', rgb: '52, 211, 153' },
            { id: 'jugando', label: 'Jugando', icon: 'fa-gamepad', color: '#8b5cf6', rgb: '139, 92, 246' },
            { id: 'sin wsp', label: 'Sin WhatsApp', icon: 'fa-ban', color: '#f59e0b', rgb: '245, 158, 11' },
            { id: 'no interesado', label: 'No Interesado', icon: 'fa-times-circle', color: '#ef4444', rgb: '239, 68, 68' }
        ];

        const AppState = {
            contacts: [],
            filteredContacts: [],
            selectedContacts: new Set(),
            currentPage: 1,
            itemsPerPage: 400,
            searchTerm: '',
            statusFilter: '',
            originFilter: '',
            sortBy: 'name',
            sortOrder: 'asc',
            duplicates: [],
            history: [],
            lastEditedContact: null,
            undoStack: [],
            currentView: 'cards',
            whatsappTemplate: 'Hola {usuario}, ¿cómo estás? Te escribo por la propuesta que vimos.',
            duplicateMergeMode: 'phone-auto',
            opsProfiles: {},
            opsLastImportedAt: null,
            opsFilter: 'all',
            shiftFilter: '',
            phoneFilter: 'all',
            editActivityFilter: 'all',
            shiftMode: {
                tm: { name: 'TM', queue: [], cursor: 0, stack: [] },
                tt: { name: 'TT', queue: [], cursor: 0, stack: [] },
                tn: { name: 'TN', queue: [], cursor: 0, stack: [] }
            },
            activeShift: null,
            editingContactId: null,
            lastSelectedContactId: null,
            autoDownloadBackupIntervalMs: 30 * 60 * 1000,
            lastAutoDownloadAt: 0,
            lastAutoBackupSignature: '',
            autoBackupStorageMode: 'download',
            autoBackupFileHandle: null,
            storageEstimate: null,
            lastStorageWarnAt: 0,
            perfDebug: false,
            importCancelRequested: false,
            reviewPositiveCounter: 0,
            reviewMilestonesShown: {},
            runtimeHash: '',
            profiles: [{ id: 'default', name: 'Base principal' }],
            activeProfileId: 'default',
            splitImportByFile: false,
            operatorName: 'PC local',
            lastImportBatchId: '',
            previousImportBatchId: '',
            lastImportFileName: '',
            statusTransitions: [],
            buttonPressEvents: [],
            shiftSnapshots: [],
            searchGhostTerm: '',
            searchGhostActive: false,
            midnightExportPending: false,
            lastMidnightExportDate: '',
            controlImportUnlocked: false,
            controlPasswordHash: '',
            controlLastImportedAt: '',
            controlReports: [],
            metricEvents: [],
            monthlyBaselineByProfile: {},
            metricsHourRange: null,
            uploadUnlockedUntil: 0,
            uploadAuditLog: [],
            queuedUploads: [],
            themeCatalog: {},
            activeThemeId: 'whaticket-blue',
            lightMode: false,
            profilePageMap: {},
            perfStats: { filterMs: 0, renderMs: 0, renderContactsMs: 0, saveMs: 0, domItems: 0, longTasks: 0, longTaskTop: [] },
            searchIndex: { allIds: [], byId: new Map(), byStatus: new Map(), byShift: new Map(), byProfile: new Map(), byPhoneType: new Map(), byOrigin: new Map() },
            searchIndexDirty: true,
            renderQueued: false,
            virtualization: {
                cards: { scrollTop: 0, itemHeight: 340, bufferRows: 2 },
                list: { scrollTop: 0, itemHeight: 108, bufferRows: 3 }
            },
            currentPerfStage: 'idle',
            perfStageCosts: {},
            statsDirty: true,
            lastStatsAt: 0,
            statsCacheByProfile: {},
            refreshKey: 0,
            pendingStatusDeltas: [],
            deltaQueueTimer: null
        };

        function ensureReviewMilestonesState() {
            if (!AppState.reviewMilestonesShown || typeof AppState.reviewMilestonesShown !== 'object') {
                AppState.reviewMilestonesShown = {};
            }
            if (typeof AppState.reviewPositiveCounter !== 'number') {
                AppState.reviewPositiveCounter = Number(AppState.reviewPositiveCounter || 0) || 0;
            }
        }

        const elements = {
            uploadScreen: $('#uploadScreen'),
            mainApp: $('#mainApp'),
            fileInput: $('#fileInput'),
            opsFileInput: $('#opsFileInput'),
            uploadArea: $('#uploadArea'),
            fileList: $('#fileList'),
            originInput: $('#originInput'),
            startBtn: $('#startBtn'),
            preStartCheckUpdatesBtn: $('#preStartCheckUpdatesBtn'),
            profileSelect: $('#profileSelect'),
            manageProfilesBtn: $('#manageProfilesBtn'),
            cardsView: $('#cardsView'),
            listView: $('#listView'),
            shiftsView: $('#shiftsView'),
            quickReview: $('#quickReview'),
            searchInput: $('#searchInput'),
            statusFilter: $('#statusFilter'),
            originFilter: $('#originFilter'),
            opsSegmentFilter: $('#opsSegmentFilter'),
            shiftFilter: $('#shiftFilter'),
            phoneFilter: $('#phoneFilter'),
            editActivityFilter: $('#editActivityFilter'),
            clearFiltersBtn: $('#clearFiltersBtn'),
            selectFilteredBtn: $('#selectFilteredBtn'),
            clearSelectionBtn: $('#clearSelectionBtn'),
            viewCardsBtn: $('#viewCardsBtn'),
            viewListBtn: $('#viewListBtn'),
            viewShiftsBtn: $('#viewShiftsBtn'),
            exportBtn: $('#exportBtn'),
            bulkActionsBar: $('#bulkActionsBar'),
            selectedCount: $('#selectedCount'),
            bulkStatusSelect: $('#bulkStatusSelect'),
            pagination: $('#pagination'),
            manageDuplicatesBtn: $('#manageDuplicatesBtn'),
            duplicatesModal: $('#duplicatesModal'),
            duplicatesStatBox: $('#duplicatesStatBox'),
            addMoreBtn: $('#addMoreBtn'),
            addSingleBtn: $('#addSingleBtn'),
            checkUpdatesBtn: $('#checkUpdatesBtn'),
            settingsBtn: $('#settingsBtn'),
            historyBtn: $('#historyBtn'),
            historyModal: $('#historyModal'),
            contactHistoryModal: $('#contactHistoryModal'),
            contactHistoryList: $('#contactHistoryList'),
            contactHistoryMeta: $('#contactHistoryMeta'),
            deleteAllBtn: $('#deleteAllBtn'),
            importOpsBtn: $('#importOpsBtn'),
            midnightExportBtn: $('#midnightExportBtn'),
            undoBtn: $('#undoBtn'),
            whatsappTemplateInput: $('#whatsappTemplateInput'),
            saveTemplateBtn: $('#saveTemplateBtn'),
            checkUpdatesOption: $('#checkUpdatesOption'),
            restartUpdateOption: $('#restartUpdateOption'),
            openGithubReleasesOption: $('#openGithubReleasesOption'),
            openStable110Option: $('#openStable110Option'),
            openErrorLogOption: $('#openErrorLogOption'),
            rollbackPreviousOption: $('#rollbackPreviousOption'),
            showQuickMetricsOption: $('#showQuickMetricsOption'),
            openThemesOption: $('#openThemesOption'),
            metricsModal: $('#metricsModal'),
            metricEditedToday: $('#metricEditedToday'),
            metricEditedYesterday: $('#metricEditedYesterday'),
            metricTopShift: $('#metricTopShift'),
            metricTransitions24h: $('#metricTransitions24h'),
            metricTopShift24h: $('#metricTopShift24h'),
            metricButtonsPerHour: $('#metricButtonsPerHour'),
            metricShiftBreakdown: $('#metricShiftBreakdown'),
            metricTransitionSummary: $('#metricTransitionSummary'),
            metricShiftRanking: $('#metricShiftRanking'),
            controlReportsSummary: $('#controlReportsSummary'),
            metricsShiftFilter: $('#metricsShiftFilter'),
            metricsShiftMorningBtn: $('#metricsShiftMorningBtn'),
            metricsShiftAfternoonBtn: $('#metricsShiftAfternoonBtn'),
            metricsShiftNightBtn: $('#metricsShiftNightBtn'),
            metricsShiftResetBtn: $('#metricsShiftResetBtn'),
            metricsFromDate: $('#metricsFromDate'),
            metricsToDate: $('#metricsToDate'),
            metricsStatusFilter: $('#metricsStatusFilter'),
            metricsSelectionTypeFilter: $('#metricsSelectionTypeFilter'),
            metricsOnlyChanges: $('#metricsOnlyChanges'),
            statusDonutChart: $('#statusDonutChart'),
            selectionDonutChart: $('#selectionDonutChart'),
            transitionBarChart: $('#transitionBarChart'),
            uploadReportBtn: $('#uploadReportBtn'),
            resetBaselineBtn: $('#resetBaselineBtn'),
            metricsDateLabel: $('#metricsDateLabel'),
            metricsOpsSummary: $('#metricsOpsSummary'),
            metricsFilterLastBatchBtn: $('#metricsFilterLastBatchBtn'),
            metricsDeleteLastBatchBtn: $('#metricsDeleteLastBatchBtn'),
            exportDailyNexoBtn: $('#exportDailyNexoBtn'),
            exportBackupNexoBtn: $('#exportBackupNexoBtn'),
            importFullSnapshotBtn: $('#importFullSnapshotBtn'),
            importControlBtn: $('#importControlBtn'),
            controlPasswordPanel: $('#controlPasswordPanel'),
            controlPasswordNew: $('#controlPasswordNew'),
            controlPasswordSaveBtn: $('#controlPasswordSaveBtn'),
            metricTransitionsBreakdown: $('#metricTransitionsBreakdown'),
            metricRareTransitions: $('#metricRareTransitions'),
            metricRareTransitionsBody: $('#metricRareTransitionsBody'),
            importDiagnosticsModal: $('#importDiagnosticsModal'),
            importDiagSummary: $('#importDiagSummary'),
            importDiagTableWrap: $('#importDiagTableWrap'),
            importMapName: $('#importMapName'),
            importMapPhone: $('#importMapPhone'),
            importMapTag: $('#importMapTag'),
            importDiagIssues: $('#importDiagIssues'),
            importDiagCancel: $('#importDiagCancel'),
            importDiagContinue: $('#importDiagContinue'),
            themesModal: $('#themesModal'),
            themeCards: $('#themeCards'),
            themeNameInput: $('#themeNameInput'),
            themePrimary: $('#themePrimary'),
            themeAccent: $('#themeAccent'),
            themeBg: $('#themeBg'),
            themeSurface: $('#themeSurface'),
            themeText: $('#themeText'),
            saveCustomThemeBtn: $('#saveCustomThemeBtn'),
            exportThemesBtn: $('#exportThemesBtn'),
            importThemesBtn: $('#importThemesBtn'),
            lightModeToggle: $('#lightModeToggle'),
            closeThemesModal: $('#closeThemesModal'),
            profilesModal: $('#profilesModal'),
            profilesList: $('#profilesList'),
            newProfileName: $('#newProfileName'),
            addProfileBtn: $('#addProfileBtn'),
            closeProfilesModal: $('#closeProfilesModal'),
            splitImportByFileToggle: $('#splitImportByFileToggle'),
            updateStatusText: $('#updateStatusText'),
            updateProgressFill: $('#updateProgressFill'),
            perfDebugToggle: $('#perfDebugToggle'),
            perfDomItems: $('#perfDomItems'),
            perfFilterMs: $('#perfFilterMs'),
            perfRenderMs: $('#perfRenderMs'),
            perfLongTasks: $('#perfLongTasks'),
            perfLongTasksTop: $('#perfLongTasksTop'),
            appLoadingOverlay: $('#appLoadingOverlay'),
            appLoadingText: $('#appLoadingText'),
            appLoadingProgress: $('#appLoadingProgress'),
            cancelImportBtn: $('#cancelImportBtn'),
            insertUserTokenBtn: $('#insertUserTokenBtn'),
            resetTemplateBtn: $('#resetTemplateBtn'),
            shortcutsModal: $('#shortcutsModal'),
            userOptionsModal: $('#userOptionsModal'),
            whatsappMessageModal: $('#whatsappMessageModal'),
            saveStateBadge: $('#saveStateBadge'),
            storageMeter: $('#storageMeter'),
            globalAnnouncement: $('#globalAnnouncement'),
            loadingOverlay: $('#loadingOverlay'),
            loadingOverlayText: $('#loadingOverlayText'),
            loadingOverlayProgress: $('#loadingOverlayProgress'),
            loadingOverlayMeta: $('#loadingOverlayMeta'),
            loadingPreviewTrack: $('#loadingPreviewTrack')
        };

        // Exponer elementos inmediatamente — módulos externos los necesitan desde el arranque
        window.NexoElements = elements;
        window.elements = elements;
        window.STATUS_OPTIONS = STATUS_OPTIONS;

        // Compatibilidad defensiva: evita ReferenceError en handlers legacy cacheados por el navegador.
        let shift = '';
        let mode = '';

        let selectedFiles = [];

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
            return normalizeUsername(alias).replace(/\s+/g, '');
        }

        function extractPrimaryAlias(name = '') {
            const base = (name || '').split('/')[0].trim();
            const token = base.split(/\s+/)[0] || base;
            return token.trim();
        }

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

        function getOpsSuggestedStatus(lastCargaAt) {
            if (!lastCargaAt) return 'sin revisar';
            const days = (Date.now() - new Date(lastCargaAt).getTime()) / 86400000;
            if (days <= 2) return 'jugando';
            if (days <= 7) return 'contactado';
            if (days <= 21) return 'revisado';
            // Nota: datos de operaciones no implican disponibilidad de WhatsApp.
            // Evitamos sugerir 'sin wsp' solo por recencia.
            return 'sin revisar';
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
            if (!lastCargaAt) return { text: 'Sin datos', cls: 'cold' };
            const days = (Date.now() - new Date(lastCargaAt).getTime()) / 86400000;
            if (days <= 7) return { text: '🔥 Activo', cls: 'hot' };
            if (days <= 21) return { text: '⏳ Tibio', cls: '' };
            return { text: '❄️ Frío', cls: 'cold' };
        }

        function parseOperationsCsvChunkedFallback(text, onProgress) {
            return new Promise((resolve) => {
                const lines = text.split('\n').map(line => line.replace(/\r$/, '')).filter(Boolean);
                if (!lines.length) return resolve({ byAlias: {}, importedRows: 0 });

                let idx = 0;
                if (lines[0].toLowerCase().startsWith('sep=')) idx = 1;
                const header = parseCsvRow(lines[idx] || '');
                idx++;
                const h = header.map(v => normalizeUsername(v));
                const aliasIdx = h.findIndex(v => v.includes('alias'));
                const amountIdx = h.findIndex(v => v.includes('cantidad'));
                const dateIdx = h.findIndex(v => v.includes('fecha'));
                const stats = new Map();
                const now = Date.now();
                const chunk = 700;
                const totalRows = Math.max(0, lines.length - idx);
                const startIdx = idx;
                let importedRows = 0;

                const process = () => {
                    const end = Math.min(lines.length, idx + chunk);
                    for (; idx < end; idx++) {
                        const row = parseCsvRow(lines[idx]);
                        const aliasRaw = row[aliasIdx] || '';
                        const alias = normalizeAlias(aliasRaw);
                        if (!alias) continue;
                        const amount = parseInt((row[amountIdx] || '0').replace(/[^\d-]/g, ''), 10);
                        if (Number.isNaN(amount)) continue;
                        const dateRaw = row[dateIdx] || '';
                        const ts = Date.parse(dateRaw.replace(' ', 'T')) || Date.now();
                        const hour = new Date(ts).getHours();

                        if (!stats.has(alias)) {
                            stats.set(alias, {
                                alias,
                                aliasLabel: aliasRaw.trim(),
                                cargasCount: 0,
                                descargasCount: 0,
                                cargadoTotal: 0,
                                descargadoTotal: 0,
                                netoTotal: 0,
                                lastAt: null,
                                lastCargaAt: null,
                                cargasVals: [],
                                hourHist: Array(24).fill(0),
                                cargas30d: 0,
                                cargado30d: 0,
                                cargado90d: 0,
                                weeks30: new Set(),
                                months90: new Set()
                            });
                        }
                        const st = stats.get(alias);
                        importedRows++;
                        st.netoTotal += amount;
                        st.hourHist[hour] += 1;
                        if (!st.lastAt || ts > st.lastAt) st.lastAt = ts;

                        const ageDays = (now - ts) / 86400000;
                        if (amount > 0) {
                            st.cargasCount++;
                            st.cargadoTotal += amount;
                            st.cargasVals.push(amount);
                            if (!st.lastCargaAt || ts > st.lastCargaAt) st.lastCargaAt = ts;
                            if (ageDays <= 30) {
                                st.cargas30d++;
                                st.cargado30d += amount;
                                const d = new Date(ts);
                                const wk = `${d.getFullYear()}-${Math.ceil((((d - new Date(d.getFullYear(),0,1)) / 86400000) + d.getDay() + 1) / 7)}`;
                                st.weeks30.add(wk);
                            }
                            if (ageDays <= 90) {
                                st.cargado90d += amount;
                                const d = new Date(ts);
                                st.months90.add(`${d.getFullYear()}-${d.getMonth()+1}`);
                            }
                        } else {
                            st.descargasCount++;
                            st.descargadoTotal += Math.abs(amount);
                        }
                    }

                    if (typeof onProgress === 'function') {
                        onProgress({ processed: Math.max(0, idx - startIdx), total: totalRows });
                    }

                    if (idx < lines.length) return setTimeout(process, 0);

                    const byAlias = {};
                    for (const [alias, st] of stats.entries()) {
                        const topHours = st.hourHist.map((v, i) => ({ h: i, v })).sort((a, b) => b.v - a.v).slice(0, 3).map(x => `${String(x.h).padStart(2, '0')}:00`);
                        const avgCarga = st.cargasCount ? (st.cargadoTotal / st.cargasCount) : 0;
                        const mediana = median(st.cargasVals);
                        const loyalty = (st.weeks30.size >= 2 ? 1 : 0) + (st.months90.size >= 2 ? 1 : 0) + (st.cargado30d >= 50000 ? 1 : 0) + (st.cargas30d >= 8 ? 1 : 0);
                        const recencyDays = st.lastCargaAt ? (Date.now() - st.lastCargaAt) / 86400000 : 999;
                        const recencyScore = Math.max(0, 40 - recencyDays);
                        const score = recencyScore + Math.min(35, st.cargas30d * 3) + Math.min(20, st.cargado90d / 10000) + (loyalty * 8);
                        byAlias[alias] = {
                            ...st,
                            lastAt: st.lastAt ? new Date(st.lastAt).toISOString() : null,
                            lastCargaAt: st.lastCargaAt ? new Date(st.lastCargaAt).toISOString() : null,
                            avgCarga: Math.round(avgCarga),
                            medianCarga: Math.round(mediana),
                            topHours,
                            loyalty,
                            score: Math.round(score),
                            suggestedStatus: getOpsSuggestedStatus(st.lastCargaAt),
                            heat: getOpsHeatLabel(st.lastCargaAt)
                        };
                        delete byAlias[alias].cargasVals;
                        delete byAlias[alias].weeks30;
                        delete byAlias[alias].months90;
                    }
                    resolve({ byAlias, importedRows });
                };
                process();
            });
        }

        function parseOperationsCsvChunked(text, onProgress) {
            if (typeof Worker === 'undefined') {
                return parseOperationsCsvChunkedFallback(text, onProgress);
            }
            return new Promise((resolve, reject) => {
                const workerScript = `
                    const normalizeUsername = (value = '') => (value || '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    const normalizeAlias = (value = '') => normalizeUsername(value).replace(/\s+/g, '');
                    const parseCsvRow = (line = '') => {
                        const out = [];
                        let cur = '';
                        let inQuotes = false;
                        for (let i = 0; i < line.length; i++) {
                            const ch = line[i];
                            if (ch === '"') {
                                if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
                                else inQuotes = !inQuotes;
                            } else if (ch === ',' && !inQuotes) {
                                out.push(cur);
                                cur = '';
                            } else cur += ch;
                        }
                        out.push(cur);
                        return out.map(v => v.trim());
                    };
                    const median = (values) => {
                        if (!values.length) return 0;
                        const sorted = [...values].sort((a, b) => a - b);
                        const mid = Math.floor(sorted.length / 2);
                        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
                    };
                    const getOpsSuggestedStatus = (lastCargaAt) => {
                        if (!lastCargaAt) return 'sin revisar';
                        const days = (Date.now() - new Date(lastCargaAt).getTime()) / 86400000;
                        if (days <= 2) return 'jugando';
                        if (days <= 7) return 'contactado';
                        if (days <= 21) return 'revisado';
                        return 'sin revisar';
                    };
                    const getOpsHeatLabel = (lastCargaAt) => {
                        if (!lastCargaAt) return { text: 'Sin datos', cls: 'cold' };
                        const days = (Date.now() - new Date(lastCargaAt).getTime()) / 86400000;
                        if (days <= 7) return { text: '🔥 Activo', cls: 'hot' };
                        if (days <= 21) return { text: '⏳ Tibio', cls: '' };
                        return { text: '❄️ Frío', cls: 'cold' };
                    };

                    self.onmessage = (event) => {
                        try {
                            const text = String(event.data && event.data.text || '');
                            const lines = text.split(/\r?\n/).filter(Boolean);
                            if (!lines.length) {
                                self.postMessage({ type: 'done', payload: { byAlias: {}, importedRows: 0 } });
                                return;
                            }

                            let idx = 0;
                            if ((lines[0] || '').toLowerCase().startsWith('sep=')) idx = 1;
                            const header = parseCsvRow(lines[idx] || '');
                            idx++;
                            const h = header.map(v => normalizeUsername(v));
                            const aliasIdx = h.findIndex(v => v.includes('alias'));
                            const amountIdx = h.findIndex(v => v.includes('cantidad'));
                            const dateIdx = h.findIndex(v => v.includes('fecha'));
                            const stats = new Map();
                            const now = Date.now();
                            const chunk = 1200;
                            const totalRows = Math.max(0, lines.length - idx);
                            let importedRows = 0;

                            while (idx < lines.length) {
                                const end = Math.min(lines.length, idx + chunk);
                                for (; idx < end; idx++) {
                                    const row = parseCsvRow(lines[idx]);
                                    const aliasRaw = row[aliasIdx] || '';
                                    const alias = normalizeAlias(aliasRaw);
                                    if (!alias) continue;
                                    const amount = parseInt((row[amountIdx] || '0').replace(/[^\d-]/g, ''), 10);
                                    if (Number.isNaN(amount)) continue;
                                    const dateRaw = row[dateIdx] || '';
                                    const ts = Date.parse(dateRaw.replace(' ', 'T')) || Date.now();
                                    const hour = new Date(ts).getHours();

                                    if (!stats.has(alias)) {
                                        stats.set(alias, {
                                            alias,
                                            aliasLabel: aliasRaw.trim(),
                                            cargasCount: 0,
                                            descargasCount: 0,
                                            cargadoTotal: 0,
                                            descargadoTotal: 0,
                                            netoTotal: 0,
                                            lastAt: null,
                                            lastCargaAt: null,
                                            cargasVals: [],
                                            hourHist: Array(24).fill(0),
                                            cargas30d: 0,
                                            cargado30d: 0,
                                            cargado90d: 0,
                                            weeks30: new Set(),
                                            months90: new Set()
                                        });
                                    }

                                    const st = stats.get(alias);
                                    importedRows++;
                                    st.netoTotal += amount;
                                    st.hourHist[hour] += 1;
                                    if (!st.lastAt || ts > st.lastAt) st.lastAt = ts;

                                    const ageDays = (now - ts) / 86400000;
                                    if (amount > 0) {
                                        st.cargasCount++;
                                        st.cargadoTotal += amount;
                                        st.cargasVals.push(amount);
                                        if (!st.lastCargaAt || ts > st.lastCargaAt) st.lastCargaAt = ts;
                                        if (ageDays <= 30) {
                                            st.cargas30d++;
                                            st.cargado30d += amount;
                                            const d = new Date(ts);
                                            const wk = String(d.getFullYear()) + '-' + String(Math.ceil((((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + d.getDay() + 1) / 7));
                                            st.weeks30.add(wk);
                                        }
                                        if (ageDays <= 90) {
                                            st.cargado90d += amount;
                                            const d = new Date(ts);
                                            st.months90.add(String(d.getFullYear()) + '-' + String(d.getMonth() + 1));
                                        }
                                    } else {
                                        st.descargasCount++;
                                        st.descargadoTotal += Math.abs(amount);
                                    }
                                }

                                self.postMessage({ type: 'progress', payload: { processed: Math.max(0, idx - (lines[0].toLowerCase().startsWith('sep=') ? 2 : 1)), total: totalRows } });
                            }

                            const byAlias = {};
                            for (const [alias, st] of stats.entries()) {
                                const topHours = st.hourHist
                                    .map((v, i) => ({ h: i, v }))
                                    .sort((a, b) => b.v - a.v)
                                    .slice(0, 3)
                                    .map(x => String(x.h).padStart(2, '0') + ':00');
                                const avgCarga = st.cargasCount ? (st.cargadoTotal / st.cargasCount) : 0;
                                const mediana = median(st.cargasVals);
                                const loyalty = (st.weeks30.size >= 2 ? 1 : 0) + (st.months90.size >= 2 ? 1 : 0) + (st.cargado30d >= 50000 ? 1 : 0) + (st.cargas30d >= 8 ? 1 : 0);
                                const recencyDays = st.lastCargaAt ? (Date.now() - st.lastCargaAt) / 86400000 : 999;
                                const recencyScore = Math.max(0, 40 - recencyDays);
                                const score = recencyScore + Math.min(35, st.cargas30d * 3) + Math.min(20, st.cargado90d / 10000) + (loyalty * 8);
                                byAlias[alias] = {
                                    ...st,
                                    lastAt: st.lastAt ? new Date(st.lastAt).toISOString() : null,
                                    lastCargaAt: st.lastCargaAt ? new Date(st.lastCargaAt).toISOString() : null,
                                    avgCarga: Math.round(avgCarga),
                                    medianCarga: Math.round(mediana),
                                    topHours,
                                    loyalty,
                                    score: Math.round(score),
                                    suggestedStatus: getOpsSuggestedStatus(st.lastCargaAt),
                                    heat: getOpsHeatLabel(st.lastCargaAt)
                                };
                                delete byAlias[alias].cargasVals;
                                delete byAlias[alias].weeks30;
                                delete byAlias[alias].months90;
                            }

                            self.postMessage({ type: 'done', payload: { byAlias, importedRows } });
                        } catch (err) {
                            self.postMessage({ type: 'error', payload: String((err && err.message) || err || 'Error procesando CSV de operaciones') });
                        }
                    };
                `;

                const blob = new Blob([workerScript], { type: 'application/javascript' });
                const workerUrl = URL.createObjectURL(blob);
                const worker = new Worker(workerUrl);
                let settled = false;

                worker.onmessage = (event) => {
                    const { type, payload } = event.data || {};
                    if (type === 'progress' && typeof onProgress === 'function') {
                        onProgress(payload || {});
                        return;
                    }
                    if (type === 'done') {
                        if (settled) return;
                        settled = true;
                        worker.terminate();
                        URL.revokeObjectURL(workerUrl);
                        resolve(payload || { byAlias: {}, importedRows: 0 });
                        return;
                    }
                    if (type === 'error') {
                        if (settled) return;
                        settled = true;
                        worker.terminate();
                        URL.revokeObjectURL(workerUrl);
                        parseOperationsCsvChunkedFallback(text, onProgress).then(resolve).catch(reject);
                    }
                };

                worker.onerror = () => {
                    if (settled) return;
                    settled = true;
                    worker.terminate();
                    URL.revokeObjectURL(workerUrl);
                    parseOperationsCsvChunkedFallback(text, onProgress).then(resolve).catch(reject);
                };

                worker.postMessage({ text: String(text || '') });
            });
        }

        function applyOpsHeuristicsToContact(contact) {
            if (!contact || !contact.ops?.suggestedStatus) return;
            const suggested = contact.ops.suggestedStatus;
            const nextStatus = getHigherPriorityStatus(contact.status, suggested);
            if (nextStatus !== contact.status) {
                const oldStatus = contact.status;
                contact.status = nextStatus;
                touchContactEdit(contact, 'ops_sync');
                const opsAt = contact?.ops?.lastCargaAt || new Date().toISOString();
                const opsShift = inferShiftFromIso(opsAt);
                AppState.statusTransitions.unshift({ at: opsAt, from: oldStatus, to: nextStatus, contactId: contact.id, profileId: contact.profileId || 'default', actor: 'ops-import', shift: opsShift || contact.assignedShift || '' });
                AppState.buttonPressEvents.unshift({ at: opsAt, action: 'ops-sync', from: oldStatus, to: nextStatus, shift: opsShift || contact.assignedShift || '', profileId: contact.profileId || 'default', actor: 'ops-import' });
                recordMetricEvent('operation_created', { profileId: contact.profileId || 'default', contactId: contact.id, status: nextStatus, from: oldStatus, to: nextStatus, at: opsAt, shift: opsShift, selectionType: 'ops' });
                saveStatusTransitions();
                saveButtonPressEvents();
            }
        }

        async function syncOpsToContacts({ createNewUsers = true, onProgress = null } = {}) {
            const profiles = AppState.opsProfiles || {};
            const matchedAliases = new Set();
            let updatedCount = 0;
            let createdCount = 0;
            const CHUNK = 500;

            // Build index for O(1) lookups
            const contactsForProfile = AppState.contacts.filter(c => (c.profileId || 'default') === (AppState.activeProfileId || 'default'));
            const total = contactsForProfile.length;

            for (let i = 0; i < total; i += CHUNK) {
                const end = Math.min(total, i + CHUNK);
                for (let j = i; j < end; j++) {
                    const contact = contactsForProfile[j];
                    const prevStatus = contact.status;
                    const prevAlias = contact.alias || '';
                    const keys = [normalizeAlias(contact.alias || ''), normalizeAlias(extractPrimaryAlias(contact.name || '')), normalizeAlias(contact.name || '')].filter(Boolean);
                    const foundKey = keys.find(k => profiles[k]);
                    contact.ops = foundKey ? profiles[foundKey] : null;
                    if (foundKey) {
                        contact.alias = contact.alias || extractPrimaryAlias(contact.name || '') || profiles[foundKey].aliasLabel;
                        matchedAliases.add(foundKey);
                        applyOpsHeuristicsToContact(contact);
                    }
                    if (contact.status !== prevStatus || (contact.alias || '') !== prevAlias) updatedCount++;
                }
                if (onProgress) onProgress({ processed: end, total });
                // Yield to UI thread every chunk
                await new Promise(r => setTimeout(r, 0));
            }

            if (createNewUsers) {
                const newAliases = Object.keys(profiles).filter(alias => !matchedAliases.has(alias));
                const newTotal = newAliases.length;
                for (let i = 0; i < newTotal; i += CHUNK) {
                    const end = Math.min(newTotal, i + CHUNK);
                    for (let j = i; j < end; j++) {
                        const alias = newAliases[j];
                        const p = profiles[alias];
                        const newId = Date.now() + Math.random();
                        const newContact = {
                            id: newId,
                            name: p.aliasLabel || alias,
                            alias: p.aliasLabel || alias,
                            phone: '',
                            profileId: AppState.activeProfileId || 'default',
                            origin: 'Operaciones panel',
                            status: 'jugando',
                            lastUpdated: new Date().toISOString(),
                            lastEditedAt: new Date().toISOString(),
                            lastEditReason: 'ops_create',
                            recontactAttempts: 0,
                            isDuplicate: false,
                            isNewFromOps: true,
                            ops: p
                        };
                        AppState.contacts.push(newContact);
                        recordMetricEvent('user_created', { profileId: AppState.activeProfileId || 'default', contactId: newId, status: 'jugando', selectionType: 'ops' });
                        applyOpsHeuristicsToContact(AppState.contacts[AppState.contacts.length - 1]);
                        addToHistory('Nuevo usuario desde operaciones', p.aliasLabel || alias);
                        createdCount++;
                    }
                    if (onProgress) onProgress({ processed: total + i + (end - i), total: total + newTotal });
                    await new Promise(r => setTimeout(r, 0));
                }
            }
            return { updatedCount, createdCount };
        }

        function mergeOpsProfiles(newProfiles) {
            const merged = { ...(AppState.opsProfiles || {}) };
            Object.entries(newProfiles || {}).forEach(([alias, n]) => {
                const prev = merged[alias];
                if (!prev) { merged[alias] = n; return; }
                merged[alias] = {
                    ...n,
                    cargasCount: (prev.cargasCount || 0) + (n.cargasCount || 0),
                    descargasCount: (prev.descargasCount || 0) + (n.descargasCount || 0),
                    cargadoTotal: (prev.cargadoTotal || 0) + (n.cargadoTotal || 0),
                    descargadoTotal: (prev.descargadoTotal || 0) + (n.descargadoTotal || 0),
                    netoTotal: (prev.netoTotal || 0) + (n.netoTotal || 0),
                    cargas30d: Math.max(prev.cargas30d || 0, n.cargas30d || 0),
                    cargado30d: Math.max(prev.cargado30d || 0, n.cargado30d || 0),
                    cargado90d: Math.max(prev.cargado90d || 0, n.cargado90d || 0),
                    lastAt: (!prev.lastAt || (n.lastAt && n.lastAt > prev.lastAt)) ? n.lastAt : prev.lastAt,
                    lastCargaAt: (!prev.lastCargaAt || (n.lastCargaAt && n.lastCargaAt > prev.lastCargaAt)) ? n.lastCargaAt : prev.lastCargaAt,
                    avgCarga: Math.round(((prev.avgCarga || 0) + (n.avgCarga || 0)) / 2),
                    medianCarga: Math.round(((prev.medianCarga || 0) + (n.medianCarga || 0)) / 2),
                    loyalty: Math.max(prev.loyalty || 0, n.loyalty || 0),
                    score: Math.max(prev.score || 0, n.score || 0),
                    suggestedStatus: n.suggestedStatus || prev.suggestedStatus,
                    heat: n.heat || prev.heat,
                    topHours: n.topHours?.length ? n.topHours : (prev.topHours || [])
                };
            });
            AppState.opsProfiles = merged;
            AppState.opsLastImportedAt = new Date().toISOString();
            saveOpsData();
        }

        function saveOpsData() {
            try {
                const pid = AppState.activeProfileId || 'default';
                localStorage.setItem(`opsProfilesData:${pid}`, JSON.stringify(AppState.opsProfiles || {}));
                localStorage.setItem(`opsLastImportedAt:${pid}`, AppState.opsLastImportedAt || '');
            } catch (e) {
                console.error('Error guardando operaciones:', e);
            }
        }

        function loadOpsData() {
            try {
                const _pid = AppState.activeProfileId || 'default';
                AppState.opsProfiles = JSON.parse(localStorage.getItem(`opsProfilesData:${_pid}`) || localStorage.getItem('opsProfilesData') || '{}');
                AppState.opsLastImportedAt = localStorage.getItem(`opsLastImportedAt:${_pid}`) || localStorage.getItem('opsLastImportedAt') || null;
            } catch (e) {
                AppState.opsProfiles = {};
                AppState.opsLastImportedAt = null;
            }
        }

        function updateOpsUploadReminder() {
            if (!elements.importOpsBtn) return;
            elements.importOpsBtn.classList.remove('needs-upload');
            if (!AppState.opsLastImportedAt) {
                elements.importOpsBtn.classList.add('needs-upload');
                elements.importOpsBtn.title = 'Importá operaciones (sin importación previa)';
                return;
            }
            const hours = (Date.now() - new Date(AppState.opsLastImportedAt).getTime()) / 36e5;
            if (hours >= 48) elements.importOpsBtn.classList.add('needs-upload');
            elements.importOpsBtn.title = `Última importación: ${new Date(AppState.opsLastImportedAt).toLocaleString('es-ES')}`;
        }

        function getOpsMiniHtml(contact) {
            if (!contact.ops) return '';
            const o = contact.ops;
            const heat = o.heat || getOpsHeatLabel(o.lastCargaAt);
            const last = o.lastCargaAt ? new Date(o.lastCargaAt).toLocaleString('es-ES') : '-';
            const topHours = (o.topHours || []).join(' / ') || '-';
            return `
                <div class="ops-chip-row">
                    <span class="ops-chip ${heat.cls}">${heat.text}</span>
                    <span class="ops-chip">↑${o.cargasCount || 0} ↓${o.descargasCount || 0}</span>
                    <span class="ops-chip">Σ $${Math.round(o.netoTotal || 0)}</span>
                    <span class="ops-chip">Score ${o.score || 0}</span>
                    <div class="ops-info-wrap">
                        <button class="ops-info-btn" type="button" onclick="event.stopPropagation()">ℹ️</button>
                        <div class="ops-tooltip" onclick="event.stopPropagation()">
                            <div class="line"><span>Última actividad</span><strong>${last}</strong></div>
                            <div class="line"><span>Promedio / Mediana</span><strong>$${Math.round(o.avgCarga || 0)} / $${Math.round(o.medianCarga || 0)}</strong></div>
                            <div class="line"><span>Cargado 30d / 90d</span><strong>$${Math.round(o.cargado30d || 0)} / $${Math.round(o.cargado90d || 0)}</strong></div>
                            <div class="line"><span>Horas top</span><strong>${topHours}</strong></div>
                            <div class="line"><span>Lealtad</span><strong>${o.loyalty || 0}/4</strong></div>
                            <div style="display:flex; gap:6px; margin-top:8px;">
                                <button class="btn" style="padding:4px 8px;font-size:.72rem;" onclick="applyOpsSuggestion(${contact.id}, event)">Aplicar ${o.suggestedStatus || 'sin revisar'}</button>
                                <button class="btn" style="padding:4px 8px;font-size:.72rem;" onclick="pinContact(${contact.id}, event)">${contact.pinned ? 'Desfijar' : 'Pin'}</button>
                            </div>
                        </div>
                    </div>
                </div>`;
        }

        function addContactTimeline(contactId, action, details) {
            const contact = AppState.contacts.find(c => c.id === contactId);
            if (!contact) return;
            if (!Array.isArray(contact.timeline)) contact.timeline = [];
            contact.timeline.unshift({
                timestamp: new Date().toISOString(),
                action,
                details
            });
            if (contact.timeline.length > 500) contact.timeline = contact.timeline.slice(0, 500);
        }

        const motivationalPhrases = [
            '🔥 Excelente ritmo, seguí así.',
            '🎯 Estás en modo pro, impecable.',
            '😎 Alto laburo, el CRM te aplaude.',
            '💪 Tremenda consistencia, crack.',
            '🧠 Productividad desbloqueada.'
        ];

        function currentShiftWindowKey() {
            const now = new Date();
            const block = Math.floor(now.getHours() / 8);
            return `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}-${block}`;
        }

        function ensureMotivationWindow() {
            const key = currentShiftWindowKey();
            if (AppState.motivationWindowKey !== key) {
                AppState.motivationWindowKey = key;
                AppState.reviewPositiveCounter = 0;
                AppState.reviewMilestonesShown = {};
            }
        }

        async function sendNativeMotivation(count) {
            const phrase = motivationalPhrases[Math.floor(Math.random() * motivationalPhrases.length)];
            const body = `${phrase} Ya llevás ${count} revisiones en este bloque de 8h.`;
            showNotification(body, 'success');
            // Mostrar en badge por 6 segundos
            setSaveState('ok', `🎯 ${count} revisiones · ${phrase.slice(0, 30)}`);
            setTimeout(() => {
                setSaveState('ok', `Guardado · ${new Date().toLocaleTimeString('es-ES')}`);
            }, 6000);
            if (window.electronAPI?.notify) await window.electronAPI.notify({ title: 'Nexo · Felicitaciones', body });
        }

        function addToHistory(action, details, contactId = null) {
            const historyEntry = {
                timestamp: new Date().toISOString(),
                action: action,
                details: details,
                contactId: contactId || null,
                actor: AppState.operatorName || 'PC local'
            };
            AppState.history.unshift(historyEntry);
            if (AppState.history.length > 500) {
                AppState.history = AppState.history.slice(0, 500);
            }
            if (contactId) addContactTimeline(contactId, action, details);
            saveHistory();
        }


        let auxSaveTimer = null;
        function queueAuxStorageSave() {
            if (auxSaveTimer) clearTimeout(auxSaveTimer);
            auxSaveTimer = setTimeout(() => {
                auxSaveTimer = null;
                try {
                    localStorage.setItem(`buttonPressEvents:${AppState.activeProfileId||'default'}`, JSON.stringify((AppState.buttonPressEvents || []).slice(0, 20000)));
                    localStorage.setItem(`statusTransitions:${AppState.activeProfileId||'default'}`, JSON.stringify((AppState.statusTransitions || []).slice(0, 5000)));
                    localStorage.setItem(`contactsHistory:${AppState.activeProfileId||'default'}`, JSON.stringify(AppState.history || []));
                } catch (e) {
                    reportError('queueAuxStorageSave', e);
                }
            }, AppState.perfDebug ? 1400 : 2400);
        }

        function flushAuxStorageSave() {
            if (auxSaveTimer) {
                clearTimeout(auxSaveTimer);
                auxSaveTimer = null;
            }
            try {
                localStorage.setItem(`buttonPressEvents:${AppState.activeProfileId||'default'}`, JSON.stringify((AppState.buttonPressEvents || []).slice(0, 20000)));
                localStorage.setItem(`statusTransitions:${AppState.activeProfileId||'default'}`, JSON.stringify((AppState.statusTransitions || []).slice(0, 5000)));
                localStorage.setItem(`contactsHistory:${AppState.activeProfileId||'default'}`, JSON.stringify(AppState.history || []));
            } catch (e) {
                reportError('flushAuxStorageSave', e);
            }
        }

        function saveButtonPressEvents() {
            queueAuxStorageSave();
        }

        function saveShiftSnapshots() {
            try { localStorage.setItem(`shiftSnapshots:${AppState.activeProfileId||'default'}`, JSON.stringify((AppState.shiftSnapshots || []).slice(0, 3650))); } catch (e) { reportError('saveShiftSnapshots', e); }
        }

        function saveStatusTransitions() {
            queueAuxStorageSave();
        }

        function saveHistory() {
            queueAuxStorageSave();
        }

        function loadHistory() {
            try {
                const saved = localStorage.getItem(`contactsHistory:${AppState.activeProfileId||'default'}`);
                if (saved) {
                    AppState.history = JSON.parse(saved);
                }
            } catch (e) {
                reportError('loadHistory', e);
            }
        }

        function mergeContact(existing, newContact) {
            const merged = { ...existing };
            
            merged.name = existing.name || newContact.name;
            
            if (newContact.phone && !existing.phone) {
                merged.phone = newContact.phone;
            } else if (existing.phone) {
                merged.phone = existing.phone;
            }
            
            if (newContact.origin && !existing.origin) {
                merged.origin = newContact.origin;
            } else if (existing.origin) {
                merged.origin = existing.origin;
            }
            
            const statusPriority = {
                'jugando': 5,
                'contactado': 4,
                'revisado': 3.5,
                'sin wsp': 3,
                'sin revisar': 2,
                'no interesado': 1
            };
            
            const existingPriority = statusPriority[existing.status] || 0;
            const newPriority = statusPriority[newContact.status] || 0;
            
            if (newPriority > existingPriority) {
                merged.status = newContact.status;
                merged.lastUpdated = new Date().toISOString();
            } else {
                merged.status = existing.status;
            }
            
            return merged;
        }

        function detectDuplicates() {
            const nameMap = new Map();
            const phoneMap = new Map();
            const duplicateGroups = [];
            const duplicateIds = new Set();
            const activeProfileId = AppState.activeProfileId || 'default';
            const contactsInProfile = (AppState.contacts || []).filter((c) => (c.profileId || 'default') === activeProfileId);

            // Agrupar por nombre normalizado
            contactsInProfile.forEach(contact => {
                const normalizedName = normalizeUsername(contact.name);
                if (!nameMap.has(normalizedName)) {
                    nameMap.set(normalizedName, []);
                }
                nameMap.get(normalizedName).push(contact);
            });

            // Agrupar por teléfono
            contactsInProfile.forEach(contact => {
                if (contact.phone) {
                    const normalizedPhone = normalizePhoneNumber(contact.phone);
                    if (!phoneMap.has(normalizedPhone)) {
                        phoneMap.set(normalizedPhone, []);
                    }
                    phoneMap.get(normalizedPhone).push(contact);
                }
            });

            // Detectar duplicados por nombre
            nameMap.forEach((contacts, name) => {
                if (contacts.length > 1) {
                    duplicateGroups.push({
                        type: 'nombre',
                        name: contacts[0].name,
                        contacts: contacts
                    });
                    contacts.forEach(c => duplicateIds.add(c.id));
                }
            });

            // Detectar duplicados por teléfono
            phoneMap.forEach((contacts, phone) => {
                if (contacts.length > 1) {
                    const uniqueNames = new Set(contacts.map(c => normalizeUsername(c.name)));
                    if (uniqueNames.size > 1) {
                        duplicateGroups.push({
                            type: 'teléfono',
                            name: `Teléfono: ${contacts[0].phone}`,
                            contacts: contacts
                        });
                        contacts.forEach(c => duplicateIds.add(c.id));
                    }
                }
            });

            AppState.duplicates = duplicateGroups;
            
            // Marcar contactos duplicados + alertas de teléfono sospechoso
            AppState.contacts.forEach(contact => {
                const profileId = contact.profileId || 'default';
                const inActiveProfile = profileId === activeProfileId;
                contact.isDuplicate = inActiveProfile ? duplicateIds.has(contact.id) : false;
                contact.phoneAlert = inActiveProfile ? isApocryphalPhone(contact.phone) : false;
            });

            return duplicateGroups;
        }

        function parseCSV(text) {
            // Detectar si es VCF
            if (text.trim().startsWith('BEGIN:VCARD')) {
                return parseVCF(text);
            }

            const normalizeHeader = (header) => (header || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();

            const parseCSVRow = (line, delimiter) => {
                const row = [];
                let current = '';
                let inQuotes = false;

                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    const nextChar = line[i + 1];

                    if (char === '"') {
                        if (inQuotes && nextChar === '"') {
                            current += '"';
                            i++;
                        } else {
                            inQuotes = !inQuotes;
                        }
                    } else if (char === delimiter && !inQuotes) {
                        row.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }

                row.push(current.trim());
                return row.map(v => v.replace(/^"|"$/g, '').trim());
            };

            const detectDelimiter = (headerLine) => {
                const candidates = [',', ';', '\t', '|'];
                let best = ',';
                let bestScore = -1;

                candidates.forEach((candidate) => {
                    const score = parseCSVRow(headerLine, candidate).length;
                    if (score > bestScore) {
                        best = candidate;
                        bestScore = score;
                    }
                });

                return best;
            };

            const lines = text.replace(/\r/g, '').split('\n').filter(line => line.trim());
            if (lines.length === 0) return [];

            const delimiter = detectDelimiter(lines[0]);
            const headers = parseCSVRow(lines[0], delimiter).map(normalizeHeader);
            const contacts = [];

            const isNameHeader = (header) => {
                return [
                    'name', 'nombre', 'usuario', 'fullname', 'full name', 'displayname', 'display name', 'contacto', 'contact'
                ].includes(header) || header.includes('nombre') || header.includes('usuario') || header.includes('name');
            };

            const isPhoneHeader = (header) => {
                return [
                    'number', 'phone', 'telefono', 'tel', 'cel', 'celular', 'mobile', 'movil', 'whatsapp', 'msisdn'
                ].includes(header)
                    || header.includes('telefono')
                    || header.includes('numero')
                    || header.includes('phone')
                    || header.includes('mobile')
                    || header.includes('whatsapp');
            };

            const mapStatus = (value) => {
                const lowerValue = (value || '').toLowerCase();
                if (lowerValue.includes('promo enviada') || lowerValue.includes('contactado')) return 'contactado';
                if (lowerValue.includes('no esta en wsp') || lowerValue.includes('sin wsp')) return 'sin wsp';
                if (lowerValue.includes('en contacto') || lowerValue.includes('jugando')) return 'jugando';
                if (lowerValue.includes('eliminado') || lowerValue.includes('no interesado')) return 'no interesado';
                if (lowerValue.includes('revisado') || lowerValue.includes('verificado')) return 'revisado';
                if (lowerValue.includes('a contactar') || lowerValue.includes('sin revisar')) return 'sin revisar';
                return undefined;
            };

            for (let i = 1; i < lines.length; i++) {
                const values = parseCSVRow(lines[i], delimiter);
                const contact = {};

                headers.forEach((header, index) => {
                    const value = values[index] || '';
                    if (!value) return;

                    if (isNameHeader(header)) {
                        contact.name = value;
                    } else if (isPhoneHeader(header)) {
                        contact.phone = normalizePhoneNumber(value);
                    } else if (header.includes('estado') && !header.includes('revision')) {
                        const status = mapStatus(value);
                        if (status) contact.status = status;
                    }
                });

                // Fallback: si el CSV no tiene headers claros, tomar la primera celda numérica como teléfono.
                if (!contact.phone) {
                    const probablePhone = values.find(v => /\d{6,}/.test((v || '').replace(/\D/g, '')));
                    if (probablePhone) contact.phone = normalizePhoneNumber(probablePhone);
                }

                if (!contact.name && contact.phone) {
                    contact.name = contact.phone;
                }

                if (contact.name || contact.phone) {
                    contacts.push(contact);
                }
            }

            return contacts;
        }

        function parseBackupJson(text) {
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                throw new Error('JSON inválido');
            }
            const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.contacts) ? parsed.contacts : null);
            if (!list) throw new Error('El JSON no contiene una lista de contactos válida');
            return list
                .map(c => ({
                    name: (c?.name || '').toString().trim(),
                    phone: normalizePhoneNumber(c?.phone || ''),
                    status: c?.status || 'sin revisar',
                    origin: (c?.origin || 'Backup JSON').toString().trim()
                }))
                .filter(c => c.name);
        }

        function parseContactsByFile(fileName, text) {
            const lower = (fileName || '').toLowerCase();
            if (lower.endsWith('.json')) return parseBackupJson(text);
            return parseCSV(text);
        }


        function parseDelimitedWithMapping(text, mapping = {}) {
            const delimiter = mapping.delimiter || detectDelimiter(text);
            const lines = String(text || '').split(/\r?\n/).filter(Boolean);
            if (lines.length < 2) return [];
            const split = (line) => delimiter === ',' ? parseCsvRow(line) : String(line || '').split(delimiter).map((v) => v.trim());
            const rows = lines.map(split);
            const nameIdx = Number(mapping.nameIdx ?? -1);
            const phoneIdx = Number(mapping.phoneIdx ?? -1);
            const tagIdx = Number(mapping.tagIdx ?? -1);
            const out = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i] || [];
                const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
                const phone = phoneIdx >= 0 ? normalizePhoneNumber(row[phoneIdx] || '') : '';
                const origin = tagIdx >= 0 ? String(row[tagIdx] || '').trim() : '';
                if (!name && !phone) continue;
                out.push({ name: name || phone, phone: phone || '', origin: origin || '', status: 'sin revisar' });
            }
            return out;
        }

        async function persistContactsChunkedForImport(contacts) {
            if (!(window.nexoStore && typeof window.nexoStore.importContactsChunk === 'function')) return false;
            const chunkSize = 400;
            const total = contacts.length;
            const started = Date.now();
            console.info('[import] store chunked start', { total, chunkSize });
            for (let i = 0; i < total; i += chunkSize) {
                const chunk = contacts.slice(i, i + chunkSize);
                await window.nexoStore.importContactsChunk({ chunk, reset: i === 0 });
                const done = Math.min(total, i + chunk.length);
                const pct = total ? Math.min(99, 60 + Math.round((done / total) * 39)) : 99;
                setLoadingState(true, `Guardando… ${done}/${total}`, pct, true);
                setSaveState('pending', `Guardando ${done}/${total} contactos`);
                await new Promise((r) => setTimeout(r, 0));
            }
            console.info('[import] store chunked done', { ms: Date.now() - started, total });
            return true;
        }


        function detectDelimiter(text) {
            const lines = String(text || '').split(/\r?\n/).slice(0, 8).filter(Boolean);
            const candidates = [',', ';', '\t'];
            let best = ',';
            let bestScore = -1;
            candidates.forEach((d) => {
                const score = lines.reduce((acc, line) => acc + (line.split(d).length - 1), 0);
                if (score > bestScore) { bestScore = score; best = d; }
            });
            return best;
        }

        async function showImportDiagnosticsPanel(fileName, text, profileName) {
            const delimiter = detectDelimiter(text);
            const lines = String(text || '').split(/\r?\n/).filter(Boolean);
            const parsePreviewRow = (line) => {
                if (delimiter === ',') return parseCsvRow(line);
                return String(line || '').split(delimiter).map((v) => v.trim());
            };
            const rows = lines.slice(0, 11).map((l) => parsePreviewRow(l));
            const header = rows[0] || [];
            const dataRows = rows.slice(1, 11);

            const colOptions = ['(vacío)', ...header];
            const fillSelect = (el, preferredRegex) => {
                if (!el) return;
                el.innerHTML = colOptions.map((c, i) => `<option value="${i-1}">${c}</option>`).join('');
                const idx = header.findIndex((h) => preferredRegex.test(String(h || '').toLowerCase()));
                el.value = String(idx);
            };
            fillSelect(elements.importMapName, /nombre|name|usuario/);
            fillSelect(elements.importMapPhone, /tel|phone|cel|whatsapp|wsp/);
            fillSelect(elements.importMapTag, /origen|tag|etiqueta|label/);

            const getMapped = (row, selectEl) => {
                const idx = parseInt(selectEl?.value || '-1', 10);
                return idx >= 0 ? String(row[idx] || '').trim() : '';
            };

            const evaluate = () => {
                const phones = new Map();
                let invalidPhones = 0;
                let emptyNames = 0;
                let duplicates = 0;
                dataRows.forEach((row) => {
                    const name = getMapped(row, elements.importMapName);
                    const phone = normalizePhoneNumber(getMapped(row, elements.importMapPhone));
                    if (!name) emptyNames += 1;
                    if (phone && phone.length < 8) invalidPhones += 1;
                    if (phone) {
                        const prev = phones.get(phone) || 0;
                        phones.set(phone, prev + 1);
                    }
                });
                phones.forEach((v) => { if (v > 1) duplicates += (v - 1); });
                return { invalidPhones, emptyNames, duplicates };
            };

            const renderTable = () => {
                const activeIdx = header.map((_, i) => i).filter((i) => dataRows.some((row) => String(row[i] || "").trim()));
                const idx = activeIdx.length ? activeIdx : header.map((_, i) => i);
                const head = idx.map((i) => `<th>${header[i] || "(columna)"}</th>`).join("");
                const body = dataRows.map((row) => `<tr>${idx.map((i)=>`<td>${(row[i]||"").toString().replace(/</g,"&lt;")}</td>`).join("")}</tr>`).join("");
                elements.importDiagTableWrap.innerHTML = `<table class="import-diag-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
            };

            const renderIssues = () => {
                const r = evaluate();
                elements.importDiagIssues.innerHTML = `
                    <div>• Delimitador detectado: <strong>${delimiter === '\t' ? 'tab' : delimiter}</strong></div>
                    <div>• Nombres vacíos: <strong>${r.emptyNames}</strong></div>
                    <div>• Teléfonos inválidos: <strong>${r.invalidPhones}</strong></div>
                    <div>• Duplicados en preview: <strong>${r.duplicates}</strong></div>
                `;
            };

            renderTable();
            renderIssues();
            elements.importDiagSummary.textContent = `Archivo: ${fileName} · Perfil: ${profileName} · Filas analizadas: ${dataRows.length}`;
            setLoadingState(false, 'Revisión previa lista', 100, false);
            elements.importDiagnosticsModal.classList.add('active');

            [elements.importMapName, elements.importMapPhone, elements.importMapTag].forEach((el) => {
                if (!el) return;
                el.onchange = () => renderIssues();
            });

            return new Promise((resolve) => {
                elements.importDiagCancel.onclick = () => {
                    elements.importDiagnosticsModal.classList.remove('active');
                    resolve({ ok: false });
                };
                elements.importDiagContinue.onclick = () => {
                    elements.importDiagnosticsModal.classList.remove('active');
                    resolve({ ok: true, mapping: { delimiter, nameIdx: parseInt(elements.importMapName?.value || "-1",10), phoneIdx: parseInt(elements.importMapPhone?.value || "-1",10), tagIdx: parseInt(elements.importMapTag?.value || "-1",10) } });
                };
            });
        }

        async function loadFiles() {
            const origin = elements.originInput.value.trim() || 'Sin especificar';
            let totalNewContacts = 0;
            let totalMerged = 0;
            let totalRenamedCleanup = 0;
            const batchId = `imp_${Date.now()}`;
            const batchFiles = [];

            if (selectedFiles.length === 0) return;
            AppState.importCancelRequested = false;
            const importStarted = Date.now();
            setLoadingState(true, 'Leyendo archivo…', 2, true);
            setSaveState('pending', 'Leyendo CSV…');

            try {
            const snapshotStamp = new Date().toISOString().replace(/[:.]/g, '-');
            const activeProfileBefore = AppState.activeProfileId || 'default';
            const profileContactsBefore = AppState.contacts.filter(c => (c.profileId || 'default') === activeProfileBefore);
            localStorage.setItem(`bk_profile_${activeProfileBefore}_${snapshotStamp}`, JSON.stringify(profileContactsBefore));

            for (let fileIndex = 0; fileIndex < selectedFiles.length; fileIndex++) {
                const file = selectedFiles[fileIndex];
                batchFiles.push(file.name);
                const text = await file.text();
                const profileIdForFile = AppState.activeProfileId || 'default';
                const profileLabel = (AppState.profiles.find(p => p.id === profileIdForFile)?.name || 'Base principal');
                // ── Detectar si es archivo de operaciones (agent_operations) ──────
                const firstLines = text.slice(0, 400).toLowerCase();
                const isOpsFile = (
                    (firstLines.includes('alias') && firstLines.includes('estado') && firstLines.includes('fecha')) ||
                    (firstLines.includes('fecha') && firstLines.includes('done') && firstLines.includes('deposito'))
                );
                if (isOpsFile) {
                    const useAsOps = await new Promise((resolveOps) => {
                        const overlay = document.createElement('div');
                        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;';
                        overlay.innerHTML = `
                            <div style="background:var(--bg-card);border:1px solid rgba(148,163,184,.3);border-radius:16px;padding:28px 32px;max-width:420px;text-align:center;">
                                <div style="font-size:1.3rem;margin-bottom:12px;"><i class="fas fa-exclamation-triangle" style="color:#f59e0b;"></i></div>
                                <div style="font-weight:700;font-size:1rem;margin-bottom:12px;">Este archivo parece un reporte de operaciones</div>
                                <div style="color:var(--text-secondary);font-size:.85rem;margin-bottom:20px;line-height:1.5;">
                                    Detectamos columnas como Alias, Estado y Fecha.<br>
                                    Elegí cómo procesarlo:
                                </div>
                                <div style="display:flex;flex-direction:column;gap:8px;">
                                    <button id="_opsYes" class="btn btn-success" style="padding:10px 20px;width:100%;font-size:.88rem;">
                                        <i class="fas fa-chart-bar"></i> Actualizar actividad de jugadores
                                    </button>
                                    <button id="_opsNo" class="btn" style="padding:10px 20px;width:100%;font-size:.88rem;">
                                        <i class="fas fa-user-plus"></i> Importar como contactos nuevos
                                    </button>
                                    <button id="_opsCancel" class="btn" style="padding:8px 20px;width:100%;font-size:.82rem;opacity:.7;">
                                        Cancelar
                                    </button>
                                </div>
                            </div>`;
                        document.body.appendChild(overlay);
                        overlay.querySelector('#_opsYes').onclick = () => { document.body.removeChild(overlay); resolveOps('ops'); };
                        overlay.querySelector('#_opsNo').onclick = () => { document.body.removeChild(overlay); resolveOps('contacts'); };
                        overlay.querySelector('#_opsCancel').onclick = () => { document.body.removeChild(overlay); resolveOps('cancel'); };
                    });
                    if (useAsOps === 'cancel') continue;
                    if (useAsOps === 'ops') {
                        // Importar directamente como operaciones
                        setLoadingState(true, 'Procesando operaciones…', 20, true);
                        setSaveState('pending', 'Procesando operaciones…');
                        try {
                            const opsResult = await parseOperationsCsvChunked(text, (pct) => {
                                setLoadingState(true, `Procesando operaciones ${pct}%`, 20 + Math.round(pct * 0.4), true);
                            });
                            setLoadingState(true, 'Fusionando perfiles…', 62, true);
                            mergeOpsProfiles(opsResult.byAlias || {});
                            setLoadingState(true, 'Sincronizando contactos…', 66, true);
                            const syncResult = await syncOpsToContacts({ createNewUsers: true, onProgress: ({ processed, total }) => {
                                const pct = 66 + (total > 0 ? Math.min(24, Math.round((processed / total) * 24)) : 0);
                                setLoadingState(true, `Sincronizando ${processed}/${total}`, pct, true);
                            }});
                            setLoadingState(true, 'Detectando duplicados…', 92, true);
                            detectDuplicates();
                            setLoadingState(true, 'Guardando…', 97, true);
                            saveData();
                            render();
                            setLoadingState(false, '', 100, false);
                            setSaveState('ok', `Operaciones importadas: ${opsResult.importedRows} filas`);
                            showNotification(`Operaciones importadas: ${opsResult.importedRows} filas · ${syncResult.createdCount} nuevos · ${syncResult.updatedCount} actualizados`, 'success');
                        } catch (opsErr) {
                            setLoadingState(false, '', 100, false);
                            showNotification(`Error procesando operaciones: ${opsErr?.message || opsErr}`, 'error');
                        }
                        continue;
                    }
                    // Si eligió 'contacts', sigue el flujo normal abajo
                }
                // ────────────────────────────────────────────────────────────────
                const previewResult = await showImportDiagnosticsPanel(file.name, text, profileLabel);
                if (!previewResult?.ok) continue;
                if (AppState.importCancelRequested) break;

                setLoadingState(true, `Parseando… ${file.name}`, 10, true);
                let parsedContacts = [];
                try {
                    parsedContacts = await perfMark('import parse', () => parseContactsInWorker(file.name, String(text || ''), ({ processed = 0, total = 0 }) => {
                        const pct = total > 0 ? Math.round((processed / total) * 45) : 0;
                        setLoadingState(true, `Parseando… ${processed}/${total}`, 10 + pct, true);
                    }));
                } catch (parseErr) {
                    reportError('import-parse-worker', parseErr, { file: file.name });
                }
                if (!Array.isArray(parsedContacts) || parsedContacts.length === 0) {
                    parsedContacts = parseDelimitedWithMapping(text, previewResult?.mapping || {});
                    if (parsedContacts.length) {
                        showNotification(`Lectura asistida aplicada en ${file.name}: ${parsedContacts.length} filas`, "info");
                    } else {
                        throw new Error(`No se pudo leer ${file.name}. Revisá mapeo de columnas.`);
                    }
                }

                setLoadingState(true, `Integrando… ${file.name}`, 60, true);
                setSaveState('pending', `Integrando ${file.name}`);
                console.info('[import] merge start', { file: file.name, rows: parsedContacts.length });
                const nowIso = new Date().toISOString();
                let fileNewContacts = 0;
                let fileMerged = 0;
                let fileRenamedCleanup = 0;
                const phoneIndex = new Map();
                const nameIndex = new Map();
                for (const existingContact of AppState.contacts) {
                    const existingPhone = normalizePhoneNumber(existingContact.phone || '');
                    if (existingPhone && !phoneIndex.has(existingPhone)) phoneIndex.set(existingPhone, existingContact);
                    const existingName = normalizeName(existingContact.name || '');
                    if (existingName && !nameIndex.has(existingName)) nameIndex.set(existingName, existingContact);
                }

                let integrationChunk = 900;
                if (parsedContacts.length > 12000) integrationChunk = 2200;
                else if (parsedContacts.length > 5000) integrationChunk = 1400;
                for (let i = 0; i < parsedContacts.length; i++) {
                    if (AppState.importCancelRequested) break;
                    const newContact = parsedContacts[i];
                    const normalizedName = normalizeName(newContact.name || '');
                    const normalizedPhone = normalizePhoneNumber(newContact.phone || '');

                    const byPhone = normalizedPhone ? phoneIndex.get(normalizedPhone) : null;
                    const byName = normalizedName ? nameIndex.get(normalizedName) : null;
                    const existingContact = byPhone || byName || null;

                    if (existingContact) {
                        let touched = false;
                        if ((!existingContact.phone || !existingContact.phone.trim()) && normalizedPhone) {
                            existingContact.phone = newContact.phone;
                            phoneIndex.set(normalizedPhone, existingContact);
                            touched = true;
                        }
                        const previousOrigin = (existingContact.origin || '').trim();
                        const previousName = (existingContact.name || '').trim();
                        const incomingName = (newContact.name || '').trim();
                        if (incomingName && normalizeName(incomingName) !== normalizeName(previousName)) {
                            existingContact.name = incomingName;
                            if (!Array.isArray(existingContact.previousNames)) existingContact.previousNames = [];
                            existingContact.previousNames.unshift({ at: nowIso, from: previousName || '(vacío)', to: incomingName, file: file.name });
                            existingContact.previousNames = existingContact.previousNames.slice(0, 40);
                            existingContact.cleanupLabel = 'contactos a borrar';
                            existingContact.markedForCleanup = true;
                            fileRenamedCleanup++;
                            totalRenamedCleanup++;
                            touched = true;
                        }
                        if (origin && previousOrigin !== origin) {
                            existingContact.origin = origin;
                            if (!Array.isArray(existingContact.originHistory)) existingContact.originHistory = [];
                            existingContact.originHistory.unshift({ at: nowIso, from: previousOrigin || '(vacío)', to: origin, file: file.name });
                            existingContact.originHistory = existingContact.originHistory.slice(0, 30);
                            touched = true;
                        }
                        if (touched) {
                            existingContact.lastUpdated = nowIso;
                            existingContact.lastImportBatchId = batchId;
                            existingContact.lastImportFile = file.name;
                            existingContact.lastImportedAt = nowIso;
                            existingContact.profileId = profileIdForFile;
                            totalMerged++;
                            fileMerged++;
                        }
                    } else if (newContact.name || newContact.phone) {
                        let suggestedStatus = 'sin revisar';
                        try { suggestedStatus = suggestStatusByName(newContact.name || ''); } catch (e) { console.warn('[import] sugerencia estado falló, fallback', e); }
                        const created = {
                            id: Date.now() + Math.random() + i,
                            name: newContact.name || newContact.phone,
                            phone: newContact.phone || '',
                            origin: origin,
                            status: newContact.status || suggestedStatus,
                            lastUpdated: nowIso,
                            isDuplicate: false,
                            lastImportBatchId: batchId,
                            lastImportFile: file.name,
                            lastImportedAt: nowIso,
                            profileId: profileIdForFile
                        };
                        AppState.contacts.push(created);
                        recordMetricEvent('user_created', { profileId: created.profileId || profileIdForFile, contactId: created.id, status: created.status, selectionType: 'import', at: nowIso });
                        if (normalizedPhone) phoneIndex.set(normalizedPhone, created);
                        if (normalizedName) nameIndex.set(normalizedName, created);
                        totalNewContacts++;
                        fileNewContacts++;
                    }

                    if (i % integrationChunk === 0) {
                        const base = 60 + Math.round((i / Math.max(parsedContacts.length, 1)) * 35);
                        const etaHint = parsedContacts.length > 0 ? `Integrando… ${i}/${parsedContacts.length}` : `Integrando… ${file.name}`;
                        setLoadingState(true, etaHint, base, true);
                        await new Promise((r) => setTimeout(r, 0));
                    }
                }

                addToHistory('Importación de archivo', `${file.name}: +${fileNewContacts} nuevos / ${fileMerged} actualizados / ${fileRenamedCleanup} renombrados (contactos a borrar)`);
                console.info('[import] merge done', { file: file.name, nuevos: fileNewContacts, actualizados: fileMerged });
            }

            AppState.previousImportBatchId = AppState.lastImportBatchId || '';
            AppState.lastImportBatchId = batchId;
            AppState.lastImportFileName = batchFiles[batchFiles.length - 1] || '';
            localStorage.setItem('lastImportBatchId', AppState.lastImportBatchId);
            localStorage.setItem('previousImportBatchId', AppState.previousImportBatchId);
            localStorage.setItem('lastImportFileName', AppState.lastImportFileName);

            detectDuplicates();
            const chunkedSaved = await persistContactsChunkedForImport(sanitizeContactsForStorage(AppState.contacts));
            if (!chunkedSaved) saveData();
            elements.uploadScreen.classList.add('hidden');
            elements.mainApp.style.display = 'block';
            await perfMark('render inicial', async () => { render(true); });
            setLoadingState(false, 'Listo', 100, false);
            showNotification(
                AppState.importCancelRequested
                    ? `Importación cancelada. ${totalNewContacts} nuevos, ${totalMerged} actualizados, ${totalRenamedCleanup} renombrados`
                    : `✅ ${totalNewContacts} nuevos, ${totalMerged} actualizados, ${totalRenamedCleanup} renombrados`,
                AppState.importCancelRequested ? 'warning' : 'success'
            );
            console.info('[import] complete', { ms: Date.now() - importStarted, newContacts: totalNewContacts, merged: totalMerged });
            } catch (error) {
                reportError('import', error, { phase: 'loadFiles' });
                setLoadingState(false, 'Error de importación', null, false);
                showNotification(`Error al importar: ${error?.message || error}`, 'error');
            } finally {
                selectedFiles = [];
                elements.fileInput.value = '';
                elements.fileList.innerHTML = '';
            }
        }


        function importOperationsFile(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    showNotification('Procesando operaciones...', 'info');
                    announceGeneral('Procesando archivo de operaciones…', 'info');
                    setSaveState('pending', 'Procesando operaciones 0%');
                    const { byAlias, importedRows } = await parseOperationsCsvChunked(String(e.target.result || ''), ({ processed = 0, total = 0 }) => {
                        const pct = total > 0 ? Math.min(49, Math.round((processed / total) * 50)) : 0;
                        setSaveState('pending', `Procesando operaciones ${pct}%`);
                        setLoadingState(true, `Procesando operaciones ${processed}/${total}`, pct, false);
                    });
                    setLoadingState(true, 'Fusionando perfiles…', 50, false);
                    mergeOpsProfiles(byAlias);
                    setLoadingState(true, 'Sincronizando contactos…', 55, false);
                    const syncResult = await syncOpsToContacts({ createNewUsers: true, onProgress: ({ processed, total }) => {
                        const pct = 55 + (total > 0 ? Math.min(35, Math.round((processed / total) * 35)) : 0);
                        setSaveState('pending', `Sincronizando ${processed}/${total}`);
                        setLoadingState(true, `Sincronizando contactos ${processed}/${total}`, pct, false);
                    }});
                    setLoadingState(true, 'Detectando duplicados…', 92, false);
                    detectDuplicates();
                    setLoadingState(true, 'Guardando…', 96, false);
                    saveData();
                    addToHistory('Operaciones importadas', `${importedRows} filas · ${syncResult.createdCount} nuevos · ${syncResult.updatedCount} actualizados`);
                    render(true);
                    setLoadingState(false, '', 100, false);
                    setSaveState('ok', `Operaciones listas ${new Date().toLocaleTimeString('es-ES')}`);
                    showNotification(`✅ Operaciones actualizadas (${importedRows} filas · +${syncResult.createdCount} nuevos)`, 'success');
                    announceGeneral(`Operaciones importadas: ${importedRows} filas`, 'success');
                } catch (err) {
                    console.error('Error importando operaciones:', err);
                    setLoadingState(false, '', 100, false);
                    setSaveState('warn', 'Error procesando operaciones');
                    showNotification('Error al importar operaciones', 'error');
                    announceGeneral('No se pudo procesar operaciones. Se aplicó modo seguro.', 'warn', 4500);
                    setTimeout(() => setSaveState('pending', 'Pendiente'), 5000);
                }
            };
            reader.readAsText(file);
        }

        function sanitizeContactsForStorage(contacts = []) {
            return contacts.map(contact => {
                const { ops, _nameKey, _searchKey, _derivedSource, ...rest } = contact;
                return { ...rest };
            });
        }

        function getLatestBackupContacts() {
            try {
                const activeProfile = AppState.activeProfileId || 'default';
                const backupKeys = Object.keys(localStorage)
                    .filter(k => k.startsWith('bk_'))
                    .sort()
                    .reverse();
                for (const key of backupKeys) {
                    const raw = localStorage.getItem(key);
                    if (!raw) continue;
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length) {
                        // SEPARACIÓN ESTRICTA: Solo retornar contactos del perfil activo
                        const profileContacts = parsed.filter(c => (c.profileId || 'default') === activeProfile);
                        if (profileContacts.length > 0) {
                            console.log(`[getLatestBackupContacts] Recuperando ${profileContacts.length} contactos del perfil ${activeProfile} desde backup ${key}`);
                            return profileContacts;
                        }
                    }
                }
            } catch (e) {
                console.error('Error leyendo backups:', e);
            }
            return null;
        }

        function manageAutomaticBackup() {
            if (!AppState.contacts || AppState.contacts.length === 0) return;
            // Skip localStorage backup for large datasets — contacts are persisted to disk via IPC
            if (AppState.contacts.length > 5000) return;
            const currentPct = AppState.storageEstimate?.pct || 0;
            if (currentPct >= 90) {
                const nowTs = Date.now();
                if (nowTs - (AppState.lastStorageWarnAt || 0) > 60000) {
                    AppState.lastStorageWarnAt = nowTs;
                    announceGeneral('Espacio local crítico: se omite backup interno para evitar bloqueo.', 'warn', 4200);
                }
                return;
            }

            const now = new Date();
            const hour = now.getHours();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            let slot;
            if (hour >= 6 && hour < 14) slot = 'tm';
            else if (hour >= 14 && hour < 22) slot = 'tt';
            else slot = 'tn';

            const backupKey = `bk_${slot}_${dateStr}`;
            if (localStorage.getItem(backupKey)) return;

            try {
                const backupData = JSON.stringify(sanitizeContactsForStorage(AppState.contacts));
                localStorage.setItem(backupKey, backupData);
                console.log(`Backup automático creado: ${backupKey}`);
                
                const yesterday = new Date(now);
                yesterday.setDate(now.getDate() - 1);
                const prevYear = yesterday.getFullYear();
                const prevMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
                const prevDay = String(yesterday.getDate()).padStart(2, '0');
                const prevDateStr = `${prevYear}-${prevMonth}-${prevDay}`;
                const oldBackupKey = `bk_${slot}_${prevDateStr}`;
                if(localStorage.getItem(oldBackupKey)) {
                    localStorage.removeItem(oldBackupKey);
                    console.log(`Backup antiguo eliminado: ${oldBackupKey}`);
                }
            } catch (e) {
                console.error('Error al crear backup automático:', e);
            }
        }

        function computeAutoBackupSignature() {
            if (!AppState.contacts || AppState.contacts.length === 0) return 'empty';
            const first = AppState.contacts[0];
            const last = AppState.contacts[AppState.contacts.length - 1];
            return [
                AppState.contacts.length,
                first?.id || '-',
                first?.lastUpdated || '-',
                last?.id || '-',
                last?.lastUpdated || '-'
            ].join('|');
        }

        async function ensureAutoBackupTarget() {
            if (AppState.autoBackupStorageMode === 'file' && AppState.autoBackupFileHandle) return true;
            if (AppState.autoBackupStorageMode === 'download') return false;
            if (typeof window.showSaveFilePicker !== 'function') {
                AppState.autoBackupStorageMode = 'download';
                try { localStorage.setItem('autoBackupStorageMode', 'download'); } catch (_) {}
                return false;
            }

            // Evitamos prompts/avisos intrusivos en flujos automáticos.
            AppState.autoBackupStorageMode = 'download';
            try { localStorage.setItem('autoBackupStorageMode', 'download'); } catch (_) {}
            return false;
        }

        async function persistAutomaticBackup(payload, fileName) {
            const canUseFileTarget = await ensureAutoBackupTarget();
            if (canUseFileTarget && AppState.autoBackupFileHandle) {
                try {
                    const writable = await AppState.autoBackupFileHandle.createWritable();
                    await writable.write(JSON.stringify(payload, null, 2));
                    await writable.close();
                    return 'file';
                } catch (e) {
                    console.warn('Fallo escritura sobre archivo elegido, se cae a descarga:', e);
                    AppState.autoBackupStorageMode = 'download';
                    try { localStorage.setItem('autoBackupStorageMode', 'download'); } catch (_) {}
                }
            }
            downloadFile(JSON.stringify(payload, null, 2), fileName, 'application/json;charset=utf-8;');
            return 'download';
        }

        function maybeDownloadAutomaticBackup(reason = 'interval') {
            if (!AppState.contacts || AppState.contacts.length === 0) return;
            const now = Date.now();
            if (now - AppState.lastAutoDownloadAt < AppState.autoDownloadBackupIntervalMs) return;

            const signature = computeAutoBackupSignature();
            if (signature === AppState.lastAutoBackupSignature && reason !== 'manual-force') return;

            const stamp = new Date(now).toISOString().replace(/[:T]/g, '-').slice(0, 16);
            const fileName = `nexo_backup_auto_${stamp}.json`;
            const payload = {
                exportedAt: new Date(now).toISOString(),
                reason,
                contactsCount: AppState.contacts.length,
                contacts: sanitizeContactsForStorage(AppState.contacts)
            };

            persistAutomaticBackup(payload, fileName).then((mode) => {
                AppState.lastAutoDownloadAt = now;
                AppState.lastAutoBackupSignature = signature;
                try {
                    localStorage.setItem('lastAutoBackupDownloadAt', String(now));
                    localStorage.setItem('lastAutoBackupSignature', signature);
                } catch (_) {}
                const text = mode === 'file'
                    ? `📦 Backup auto guardado en archivo elegido (${AppState.contacts.length} contactos)`
                    : `📦 Backup auto descargado (${AppState.contacts.length} contactos)`;
                showNotification(text, 'info');
                announceGeneral(text, 'info');
            }).catch((e) => {
                console.error('Error en backup automático:', e);
                announceGeneral('No se pudo guardar el backup automático', 'warn', 4200);
            });
        }

        let lastSaveErrorAt = 0;
        function setSaveState(type = 'pending', text = 'Pendiente') {
            if (!elements.saveStateBadge) return;
            elements.saveStateBadge.classList.remove('ok', 'warn', 'pending');
            elements.saveStateBadge.classList.add(type);
            elements.saveStateBadge.textContent = `● ${text}`;
        }

        function tryStorageRecovery() {
            try {
                const backupKeys = Object.keys(localStorage).filter(k => k.startsWith('bk_')).sort();
                while (backupKeys.length > 2) {
                    localStorage.removeItem(backupKeys.shift());
                }
                if (AppState.history.length > 25) {
                    AppState.history = AppState.history.slice(0, 25);
                    localStorage.setItem(`contactsHistory:${AppState.activeProfileId||'default'}`, JSON.stringify(AppState.history));
                }
                const opsRaw = localStorage.getItem('opsProfilesData');
                if (opsRaw && opsRaw.length > 1200000) {
                    localStorage.removeItem('opsProfilesData');
                    localStorage.removeItem('opsLastImportedAt');
                    AppState.opsProfiles = {};
                    AppState.opsLastImportedAt = null;
                }
            } catch (_) {}
        }

        async function refreshStorageDiagnostics() {
            try {
                const usageBytes = (() => {
                    let total = 0;
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i) || '';
                        const val = localStorage.getItem(key) || '';
                        total += (key.length + val.length) * 2;
                    }
                    return total;
                })();

                let quotaBytes = 5 * 1024 * 1024;
                if (navigator.storage && typeof navigator.storage.estimate === 'function') {
                    const estimate = await navigator.storage.estimate();
                    if (estimate?.quota) quotaBytes = estimate.quota;
                }

                const pct = Math.min(100, Math.round((usageBytes / Math.max(1, quotaBytes)) * 100));
                AppState.storageEstimate = { usageBytes, quotaBytes, pct };

                const mb = (n) => `${(n / (1024 * 1024)).toFixed(2)} MB`;
                const detail = `Almacenamiento local: ${mb(usageBytes)} / ${mb(quotaBytes)} (${pct}%)`;
                if (elements.saveStateBadge) {
                    elements.saveStateBadge.title = detail;
                }
                if (elements.storageMeter) {
                    elements.storageMeter.classList.remove('ok', 'warn', 'critical');
                    elements.storageMeter.classList.add(pct >= 92 ? 'critical' : (pct >= 80 ? 'warn' : 'ok'));
                    elements.storageMeter.textContent = `Almacenamiento ${pct}%`;
                    elements.storageMeter.title = `${detail}. Ejecutá getStorageStatus() en consola para más detalle.`;
                }
                if (pct >= 92) {
                    setSaveState('warn', `Espacio crítico ${pct}%`);
                }
            } catch (e) {
                console.warn('No se pudo estimar almacenamiento:', e);
            }
        }

        let saveDebounceTimer = null;
        let lastLoadingPreviewAt = 0;
        let lastStorageDiagAt = 0;
        let pendingContactMutations = 0;
        let lastContactSaveAt = 0;
        let contactsDirty = false;
        let contactsFlushInFlight = false;
        let hiddenAt = 0;
        let lastInteractionAt = Date.now();
        let contactBuffer = [];
        const CONTACT_BUFFER_SIZE = 1000;
        const CONTACT_SAVE_BATCH_SIZE = 300;
        const CONTACT_SAVE_MAX_WAIT_MS = 12000;
        function queueSaveData(delayMs = 1200) {
            if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
            saveDebounceTimer = setTimeout(() => {
                saveDebounceTimer = null;
                if (contactsDirty) flushSaveQueue('debounce');
            }, delayMs);
        }

        async function flushSaveQueue(reason = 'forced') {
            if (saveDebounceTimer) {
                clearTimeout(saveDebounceTimer);
                saveDebounceTimer = null;
            }
            await saveDataImmediate(reason);
        }

        window.getStorageStatus = () => {
            const est = AppState.storageEstimate;
            if (!est) return 'Aún sin medición. Probá guardar o recargar.';
            const mb = (n) => `${(n / (1024 * 1024)).toFixed(2)}MB`;
            const free = Math.max(0, est.quotaBytes - est.usageBytes);
            return `Uso ${mb(est.usageBytes)} / ${mb(est.quotaBytes)} (${est.pct}%), libre ${mb(free)}.`;
        };

        async function saveDataImmediate(reason = 'manual') {
            if (!contactsDirty || contactsFlushInFlight) return;
            contactsFlushInFlight = true;
            const startedAt = performance.now();
            const safeContacts = sanitizeContactsForStorage(AppState.contacts);
            AppState.currentPerfStage = 'save';
            try {
                // Guardar en disco via IPC — fuente de verdad, no localStorage
                const _saveProfileId = AppState.activeProfileId || 'default';
                const _profileContacts = safeContacts.filter(c => (c.profileId || 'default') === _saveProfileId);

                if (window.electronAPI?.saveProfile) {
                    // IPC directo al archivo de perfil en disco
                    await window.electronAPI.saveProfile({ profileId: _saveProfileId, contacts: _profileContacts });
                } else if (window.nexoStore && typeof window.nexoStore.asyncSaveRequest === 'function') {
                    // Fallback legacy — manda solo los del perfil activo
                    window.nexoStore.asyncSaveRequest({ contactsData: _profileContacts });
                }
                manageAutomaticBackup();
                maybeDownloadAutomaticBackup(`save:${reason}`);
                setSaveState('ok', `Guardado · ${AppState.contacts.length.toLocaleString()} contactos · ${new Date().toLocaleTimeString('es-ES')}`);
                if (Date.now() - lastStorageDiagAt > 15000) {
                    lastStorageDiagAt = Date.now();
                    refreshStorageDiagnostics();
                }
                lastContactSaveAt = Date.now();
                pendingContactMutations = 0;
                contactsDirty = false;
                AppState.perfStats.saveMs = Math.round(performance.now() - startedAt);
                recordStageCost('save', AppState.perfStats.saveMs);
            } catch (e) {
                console.warn('No se pudo guardar diferido, fallback localStorage:', e);
                try { localStorage.setItem(`contactsData:${AppState.activeProfileId || 'default'}`, JSON.stringify(safeContacts)); } catch (_) {}
                setSaveState('warn', 'Guardado diferido con fallback');
                return false;
            } finally {
                AppState.currentPerfStage = 'idle';
                contactsFlushInFlight = false;
            }
            return true;
        }

        function saveData(force = false, options = {}) {
            const deltaOnly = !!options?.deltaOnly;
            if (!deltaOnly) AppState.searchIndexDirty = true;
            AppState.statsDirty = true;
            if (!deltaOnly) contactsDirty = true;
            pendingContactMutations += 1;
            
            // Guardar datos livianos en localStorage siempre
            saveLightweightData();
            
            // Buffer system: acumular cambios hasta 1000 o forzar
            contactBuffer.push(...AppState.contacts.slice(-10)); // Últimos contactos modificados
            if (contactBuffer.length >= CONTACT_BUFFER_SIZE || force) {
                setSaveState('pending', 'Guardando en disco...');
                return flushSaveQueue(force ? 'force' : 'buffer-full');
            } else {
                setSaveState('ok', `Buffer: ${contactBuffer.length}/${CONTACT_BUFFER_SIZE} cambios`);
            }
            
            queueSaveData(800);
        }

        function saveLightweightData() {
            try {
                const profileId = AppState.activeProfileId || 'default';
                
                // MÉTRICAS TOTALES - no limitadas
                localStorage.setItem(`metricEvents:${profileId}`, JSON.stringify(AppState.metricEvents || []));
                
                // HISTORIAL COMPLETO - 500+ movimientos
                localStorage.setItem(`history:${profileId}`, JSON.stringify(AppState.history || []));
                
                // TRANSICIONES DE ESTADO COMPLETAS
                localStorage.setItem(`statusTransitions:${profileId}`, JSON.stringify(AppState.statusTransitions || []));
                
                // SNAPSHOTS DE TURNOS HISTÓRICOS
                localStorage.setItem(`shiftSnapshots:${profileId}`, JSON.stringify(AppState.shiftSnapshots || []));
                
                // DATOS DE RENDIMIENTO
                localStorage.setItem(`perfStats:${profileId}`, JSON.stringify(AppState.perfStats || {}));
                
                console.log(`[saveLightweightData] ✅ Datos históricos completos guardados para ${profileId}`);
            } catch (e) {
                console.warn('Error guardando datos históricos:', e);
                // Si localStorage se llena, guardar en disco
                if (window.electronAPI?.saveProfileMetrics) {
                    window.electronAPI.saveProfileMetrics({
                        profileId: AppState.activeProfileId,
                        metricEvents: AppState.metricEvents,
                        history: AppState.history,
                        statusTransitions: AppState.statusTransitions,
                        shiftSnapshots: AppState.shiftSnapshots
                    }).catch(diskError => console.warn('Error guardando métricas en disco:', diskError));
                }
            }
        }

        // Detectar cierre de aplicación
        window.addEventListener('beforeunload', () => {
            if (contactBuffer.length > 0) {
                flushSaveQueue('app-closing');
            }
        });

        function compactExactDuplicatesForLargeDatasets() {
            const contacts = Array.isArray(AppState.contacts) ? AppState.contacts : [];
            if (contacts.length < 8000) return 0;
            const seen = new Map();
            const makeKey = (c) => {
                const nm = normalizeUsername(c?.name || '');
                const ph = normalizePhoneToE164(c?.phone || '') || normalizePhoneNumber(c?.phone || '') || '';
                const pf = String(c?.profileId || 'default');
                return `${nm}::${ph}::${pf}`;
            };
            contacts.forEach((c) => {
                const key = makeKey(c);
                const prev = seen.get(key);
                if (!prev) {
                    seen.set(key, c);
                    return;
                }
                const prevAt = new Date(prev.lastUpdated || prev.lastEditedAt || prev.lastImportedAt || 0).getTime();
                const nowAt = new Date(c.lastUpdated || c.lastEditedAt || c.lastImportedAt || 0).getTime();
                if ((nowAt || 0) >= (prevAt || 0)) seen.set(key, c);
            });
            const compacted = Array.from(seen.values());
            const removed = Math.max(0, contacts.length - compacted.length);
            if (removed > 0) {
                AppState.contacts = compacted;
            }
            return removed;
        }

        async function loadData() {
            showLoadingOverlay('Cargando contactos…', 'Preparando base local, turnos y validaciones iniciales.');
            try {
                // SOLO cargar el perfil activo desde disco via IPC
                // Los otros perfiles se cargan al hacer switchProfile
                const _activePid = AppState.activeProfileId || 'default';
                let _loadedContacts = [];

                if (window.electronAPI?.loadProfile) {
                    setLoadingState(true, 'Cargando desde disco…', 5, false);
                    const result = await window.electronAPI.loadProfile({ profileId: _activePid });
                    if (result?.ok && Array.isArray(result.contacts)) {
                        _loadedContacts = result.contacts;
                        _loadedContacts.forEach(c => { if (!c.profileId) c.profileId = _activePid; });
                        console.log(`[loadData] Perfil ${_activePid}: ${_loadedContacts.length} contactos desde disco`);
                    }
                }

                // Fallback localStorage SOLO del perfil específico (sin mezclar perfiles)
                if (_loadedContacts.length === 0) {
                    const _raw = localStorage.getItem(`contactsData:${_activePid}`);
                    if (_raw) {
                        try {
                            const _parsed = JSON.parse(_raw);
                            if (Array.isArray(_parsed)) {
                                _loadedContacts = _parsed.filter(c => (c.profileId || 'default') === _activePid);
                                _loadedContacts.forEach(c => { if (!c.profileId) c.profileId = _activePid; });
                                console.log(`[loadData] Fallback localStorage perfil ${_activePid}: ${_loadedContacts.length} contactos`);
                            }
                        } catch (_) {}
                    }
                }

                const saved = _loadedContacts.length > 0;
                if (saved) {
                    AppState.contacts = _loadedContacts;
                    const removedByCompaction = compactExactDuplicatesForLargeDatasets();
                    if (removedByCompaction > 0) {
                        addToHistory('Compactación automática', `Se removieron ${removedByCompaction} duplicados exactos al iniciar`);
                        showNotification(`Compactación: ${removedByCompaction} duplicados exactos removidos`, 'warning');
                    }
                    for (let i = 0; i < AppState.contacts.length; i++) {
                        const contact = AppState.contacts[i];
                        if (!contact.lastEditedAt) contact.lastEditedAt = contact.lastUpdated || new Date().toISOString();
                        if (!contact.lastEditReason) contact.lastEditReason = 'legacy';
                        if (typeof contact.recontactAttempts !== 'number') contact.recontactAttempts = 0;
                        if (typeof contact.shiftReviewed !== 'boolean') contact.shiftReviewed = !!(contact.status && contact.status !== 'sin revisar');
                        if (!contact.shiftReviewedByShift && contact.shiftReviewed) {
                            contact.shiftReviewedByShift = contact.assignedShift || getLocalCompetitionShift(new Date(contact.lastUpdated || Date.now()));
                        }
                        if (i % 500 === 0) {
                            setLoadingState(true, 'Hidratando contactos…', Math.round((i / Math.max(AppState.contacts.length, 1)) * 100), false);
                            await new Promise((r) => setTimeout(r, 0));
                        }
                    }
                } else {
                    const backupContacts = getLatestBackupContacts();
                    if (backupContacts) {
                        AppState.contacts = backupContacts;
                        try {
                            localStorage.setItem(`contactsData:${AppState.activeProfileId || 'default'}`, JSON.stringify(sanitizeContactsForStorage(AppState.contacts)));
                        } catch (persistErr) {
                            reportError('loadData:backup-persist', persistErr);
                            setSaveState('warn', 'Recovery sin persistir (storage lleno)');
                        }
                        showNotification('Datos recuperados desde backup local', 'info');
                        announceGeneral('Datos recuperados desde backup local', 'warn', 4200);
                    }
                }

                if (AppState.contacts.length > 0) {
                    ensureActiveProfile();
                    const availableProfileIds = new Set((AppState.contacts || []).map((contact) => String(contact?.profileId || 'default')));
                    if (!availableProfileIds.has(String(AppState.activeProfileId || 'default'))) {
                        AppState.activeProfileId = availableProfileIds.has('default') ? 'default' : (Array.from(availableProfileIds)[0] || 'default');
                    }

                    AppState.searchTerm = '';
                    AppState.statusFilter = '';
                    AppState.originFilter = '';
                    AppState.shiftFilter = '';
                    AppState.phoneFilter = 'all';
                    AppState.editActivityFilter = 'all';
                    if (elements.searchInput) elements.searchInput.value = '';
                    if (elements.statusFilter) elements.statusFilter.value = '';
                    if (elements.originFilter) elements.originFilter.value = '';
                    if (elements.shiftFilter) elements.shiftFilter.value = '';
                    if (elements.phoneFilter) elements.phoneFilter.value = 'all';
                    if (elements.editActivityFilter) elements.editActivityFilter.value = 'all';

                    assignShifts();
                    detectDuplicates();
                    const syncResult = await syncOpsToContacts({ createNewUsers: false });
                    if (syncResult.updatedCount > 0) saveData();
                    elements.uploadScreen.classList.add('hidden');
                    elements.mainApp.style.display = 'block';
                    refreshOriginSuggestions();
                    remountDashboardState('loadData');
                    AppState.refreshKey += 1;
                    manageAutomaticBackup();
                    setSaveState('ok', `${AppState.contacts.length.toLocaleString()} contactos · ${new Date().toLocaleTimeString('es-ES')}`);
                    if (Date.now() - lastStorageDiagAt > 15000) {
                    lastStorageDiagAt = Date.now();
                    refreshStorageDiagnostics();
                }
                    announceGeneral(`Base cargada: ${AppState.contacts.length} contactos`, 'success');
                } else {
                    elements.uploadScreen.classList.remove('hidden');
                }
            } catch (e) {
                reportError('loadData', e);
                elements.uploadScreen.classList.remove('hidden');
            } finally {
                hideLoadingOverlay();
            }
        }

        function serializeClientError(error) {
            if (!error) return { name: 'Error', message: 'Error vacío', stack: '' };
            if (typeof error === 'string') return { name: 'Error', message: error, stack: '' };
            return {
                name: error.name || 'Error',
                message: error.message || String(error),
                stack: error.stack || '',
                code: error.code || ''
            };
        }

        function reportError(scope, error, extra = {}) {
            const payload = serializeClientError(error);
            const enriched = { scope, ...payload, extra };
            try { console.error(`[nexo:error:${scope}]`, payload.message, extra, error); } catch (_) {}
            try {
                if (window.electronAPI?.logError) {
                    window.electronAPI.logError(enriched).catch(() => {});
                }
            } catch (_) {}
            return enriched;
        }

        function showNotification(message, type = 'info') {
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
            notification.innerHTML = `<i class="fas ${icons[type]}"></i><span>${message}</span>`;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 4000);
        }

        let announceTimer = null;
        let loadingInterval = null;

        function showLoadingOverlay(message = 'Cargando contactos…', details = 'Preparando datos para trabajar sin bloqueos visuales.') {
            if (!elements.loadingOverlay) return;
            if (elements.loadingOverlayText) elements.loadingOverlayText.textContent = details;
            if (elements.loadingOverlayMeta) elements.loadingOverlayMeta.textContent = '0%';
            if (elements.loadingOverlayProgress) elements.loadingOverlayProgress.style.width = '0%';
            elements.loadingOverlay.classList.add('show');
            let value = 0;
            if (loadingInterval) clearInterval(loadingInterval);
            loadingInterval = setInterval(() => {
                value = Math.min(92, value + Math.floor(Math.random() * 7) + 2);
                if (elements.loadingOverlayProgress) elements.loadingOverlayProgress.style.width = `${value}%`;
                if (elements.loadingOverlayMeta) elements.loadingOverlayMeta.textContent = `${value}%`;
            }, 120);
        }

        function hideLoadingOverlay() {
            if (!elements.loadingOverlay) return;
            if (loadingInterval) {
                clearInterval(loadingInterval);
                loadingInterval = null;
            }
            if (elements.loadingOverlayProgress) elements.loadingOverlayProgress.style.width = '100%';
            if (elements.loadingOverlayMeta) elements.loadingOverlayMeta.textContent = '100%';
            setTimeout(() => {
                elements.loadingOverlay.classList.remove('show');
            }, 100);
        }

        function withSoftTransition(callback) {
            const app = elements.mainApp;
            if (!app) {
                callback();
                return;
            }
            app.style.transition = 'opacity .12s ease, transform .12s ease';
            app.style.opacity = '0.88';
            app.style.transform = 'translateY(2px)';
            setTimeout(() => {
                callback();
                app.style.opacity = '1';
                app.style.transform = 'translateY(0)';
                setTimeout(() => {
                    app.style.transition = '';
                }, 140);
            }, 100);
        }

        function refreshOriginSuggestions() {
            const datalist = $('#originSuggestions');
            if (!datalist) return;
            const seen = new Set();
            const origins = [];
            AppState.contacts.forEach(contact => {
                const origin = (contact.origin || '').trim();
                if (!origin) return;
                const key = origin.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                origins.push(origin);
            });
            origins.sort((a, b) => a.localeCompare(b, 'es'));
            datalist.innerHTML = origins.slice(0, 250).map(origin => `<option value="${origin}"></option>`).join('');
        }
        function announceGeneral(message, type = 'info', timeoutMs = 3200) {
            if (!elements.globalAnnouncement) return;
            elements.globalAnnouncement.classList.remove('info', 'success', 'warn', 'show');
            elements.globalAnnouncement.classList.add(type);
            const textEl = elements.globalAnnouncement.querySelector('.announce-text');
            if (textEl) textEl.textContent = message;
            elements.globalAnnouncement.classList.add('show');
            if (announceTimer) clearTimeout(announceTimer);
            announceTimer = setTimeout(() => {
                elements.globalAnnouncement && elements.globalAnnouncement.classList.remove('show');
            }, timeoutMs);
        }

        function normalizeSearchText(value) {
            return (value || '')
                .toString()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
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

        function getIsoDay(value) {
            if (!value) return '';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '';
            return date.toISOString().slice(0, 10);
        }

        function getEditDayStats() {
            const dayCounts = new Map();
            AppState.contacts.forEach(contact => {
                const day = getIsoDay(contact.lastEditedAt);
                if (!day) return;
                dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
            });
            const today = getIsoDay(new Date());
            return {
                dayCounts,
                todayCount: dayCounts.get(today) || 0,
                hotDays: new Set([...dayCounts.entries()].filter(([, count]) => count > 10).map(([day]) => day))
            };
        }

        function touchContactEdit(contact, reason = '') {
            if (!contact) return;
            const nowIso = new Date().toISOString();
            contact.lastEditedAt = nowIso;
            contact.lastEditReason = reason || contact.lastEditReason || 'actualización';
            contact.lastUpdated = nowIso;
        }

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

        function applyRecontactAutopolicy(contact, requestedStatus) {
            const finalStatus = requestedStatus;
            if (requestedStatus === 'contactado') {
                contact.recontactAttempts = (contact.recontactAttempts || 0) + 1;
                contact.lastRecontactAt = new Date().toISOString();
                if ((contact.recontactAttempts || 0) >= 3 && contact.status !== 'jugando') {
                    contact.autoArchivedByPolicy = true;
                    return 'sin wsp';
                }
            }
            if (requestedStatus === 'jugando') {
                contact.recontactAttempts = 0;
                contact.autoArchivedByPolicy = false;
            }
            return finalStatus;
        }

        function normalizeProfileName(name) {
            return (name || '').toString().trim();
        }

        function ensureActiveProfile() {
            if (!Array.isArray(AppState.profiles) || !AppState.profiles.length) {
                AppState.profiles = [{ id: 'default', name: 'Base principal' }];
            }
            if (!AppState.profiles.some(p => p.id === AppState.activeProfileId)) {
                AppState.activeProfileId = AppState.profiles[0].id;
            }
        }

        async function syncProfilesFromMain() {
            if (!window.electronAPI?.listProfiles) return;
            try {
                const result = await window.electronAPI.listProfiles();
                const profiles = Array.isArray(result?.profiles) ? result.profiles : [];
                if (profiles.length) {
                    AppState.profiles = profiles;
                    ensureActiveProfile();
                }
            } catch (_) {}
        }

        async function ensureProfileByName(name) {
            const normalizedProfileName = normalizeProfileName(name).slice(0, 60);
            if (!normalizedProfileName) return AppState.activeProfileId;
            const existing = AppState.profiles.find(p => normalizeSearchText(p.name) === normalizeSearchText(normalizedProfileName));
            if (existing) return existing.id;
            if (AppState.profiles.length >= 8) return AppState.activeProfileId;
            if (window.electronAPI?.createProfile) {
                try {
                    const created = await window.electronAPI.createProfile({ name: normalizedProfileName });
                    if (created?.ok && created?.profile?.id) {
                        AppState.profiles = Array.isArray(created.profiles) ? created.profiles : AppState.profiles.concat([created.profile]);
                        savePreferences();
                        return created.profile.id;
                    }
                } catch (_) {}
            }
            const id = `pf_${Date.now()}_${Math.floor(Math.random()*9999)}`;
            AppState.profiles.push({ id, name: normalizedProfileName });
            savePreferences();
            return id;
        }

        function getContactBatchId(contact) {
            return String(contact?.lastImportBatchId || contact?.importBatchId || '').trim();
        }

        function mapPush(map, key, id) {
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(id);
        }

        function rebuildSearchIndex() {
            const idx = { allIds: [], byId: new Map(), byStatus: new Map(), byShift: new Map(), byProfile: new Map(), byPhoneType: new Map(), byOrigin: new Map(), bySearchToken: new Map() };
            for (const contact of (AppState.contacts || [])) {
                buildContactDerivedFields(contact);
                const id = contact.id;
                idx.allIds.push(id);
                idx.byId.set(id, contact);
                mapPush(idx.byStatus, normalizeSearchText(contact.status), id);
                mapPush(idx.byShift, normalizeSearchText(contact.assignedShift), id);
                mapPush(idx.byProfile, String(contact.profileId || 'default'), id);
                const phoneType = hasMissingUsername(contact) ? 'missing-user' : (contact.phoneAlert ? 'suspicious' : ((contact.phone || '').trim() ? 'with' : 'without'));
                mapPush(idx.byPhoneType, phoneType, id);
                mapPush(idx.byOrigin, normalizeSearchText(contact.origin), id);
                const searchTokens = String(contact._searchKey || '').split(/\s+/).filter(Boolean);
                for (const token of searchTokens) mapPush(idx.bySearchToken, token, id);
            }
            AppState.searchIndex = idx;
            AppState.searchIndexDirty = false;
        }

        // Agrega un único contacto al índice sin reconstruir todo
        function addContactToIndex(contact) {
            if (!contact || !AppState.searchIndex) return;
            const idx = AppState.searchIndex;
            buildContactDerivedFields(contact);
            const id = contact.id;
            // Evitar duplicados si ya estaba
            if (!idx.byId.has(id)) idx.allIds.push(id);
            idx.byId.set(id, contact);
            mapPush(idx.byStatus, normalizeSearchText(contact.status), id);
            mapPush(idx.byShift, normalizeSearchText(contact.assignedShift), id);
            mapPush(idx.byProfile, String(contact.profileId || 'default'), id);
            const phoneType = hasMissingUsername(contact) ? 'missing-user' : (contact.phoneAlert ? 'suspicious' : ((contact.phone || '').trim() ? 'with' : 'without'));
            mapPush(idx.byPhoneType, phoneType, id);
            mapPush(idx.byOrigin, normalizeSearchText(contact.origin), id);
            const searchTokens = String(contact._searchKey || '').split(/\s+/).filter(Boolean);
            for (const token of searchTokens) mapPush(idx.bySearchToken, token, id);
        }

        function intersectIds(baseIds, allowedSet) {
            if (!allowedSet) return baseIds;
            return baseIds.filter((id) => allowedSet.has(id));
        }

        function applyFiltersIndexed() {
            const t0 = performance.now();
            AppState.currentPerfStage = 'filter';
            const parsedQuery = parseSearchQuery(AppState.searchTerm);
            const selectedStatus = AppState.statusFilter || parsedQuery.status;
            const selectedOrigin = AppState.originFilter || parsedQuery.origin;
            const selectedShift = AppState.shiftFilter || parsedQuery.shift;
            const activeProfile = AppState.activeProfileId || 'default';
            const editStats = getEditDayStats();
            let ids = (AppState.searchIndex.byProfile.get(activeProfile) || []).slice();

            if (selectedStatus) ids = intersectIds(ids, new Set(AppState.searchIndex.byStatus.get(selectedStatus) || []));
            if (selectedShift) ids = intersectIds(ids, new Set(AppState.searchIndex.byShift.get(selectedShift) || []));
            if (AppState.phoneFilter && AppState.phoneFilter !== 'all') {
                const bucket = AppState.phoneFilter === 'with' ? 'with' : AppState.phoneFilter === 'without' ? 'without' : AppState.phoneFilter;
                ids = intersectIds(ids, new Set(AppState.searchIndex.byPhoneType.get(bucket) || []));
            }
            if (selectedOrigin === '__last_upload__') {
                const lastBatch = AppState.lastImportBatchId;
                ids = ids.filter((id) => {
                    const c = AppState.searchIndex.byId.get(id);
                    return lastBatch && getContactBatchId(c) === lastBatch;
                });
            } else if (selectedOrigin) {
                const norm = normalizeSearchText(selectedOrigin);
                ids = norm === 'operaciones panel' ? ids.filter((id) => !!AppState.searchIndex.byId.get(id)?.ops) : intersectIds(ids, new Set(AppState.searchIndex.byOrigin.get(norm) || []));
            }
            if (AppState.opsFilter === 'matched') ids = ids.filter((id) => !!AppState.searchIndex.byId.get(id)?.ops);
            else if (AppState.opsFilter === 'nomatch') ids = ids.filter((id) => !AppState.searchIndex.byId.get(id)?.ops);
            if (parsedQuery.terms.length) {
                for (const term of parsedQuery.terms) {
                    ids = intersectIds(ids, new Set(AppState.searchIndex.bySearchToken.get(term) || []));
                    if (!ids.length) break;
                }
            }
            if (AppState.editActivityFilter !== 'all') {
                ids = ids.filter((id) => {
                    const c = AppState.searchIndex.byId.get(id);
                    const editedDay = getIsoDay(c?.lastEditedAt);
                    if (AppState.editActivityFilter === 'today10plus') {
                        const today = getIsoDay(new Date());
                        return editStats.todayCount > 10 && editedDay === today;
                    }
                    if (AppState.editActivityFilter === 'any10plus') return !!editedDay && editStats.hotDays.has(editedDay);
                    return true;
                });
            }
            let contacts = ids.map((id) => AppState.searchIndex.byId.get(id)).filter(Boolean);
            if (AppState.opsFilter === 'top50' || AppState.opsFilter === 'top100') {
                const limit = AppState.opsFilter === 'top50' ? 50 : 100;
                contacts = contacts.filter(c => c.ops).sort((a,b)=>(b.ops?.score||0)-(a.ops?.score||0)).slice(0, limit);
            }
            AppState.filteredContacts = contacts;
            AppState.perfStats.filterMs = Math.round(performance.now() - t0);
            recordStageCost('filter', AppState.perfStats.filterMs);
            AppState.currentPerfStage = 'idle';
        }


        function recordStageCost(name, ms) {
            const key = String(name || 'unknown');
            const entry = AppState.perfStageCosts[key] || { last: 0, max: 0, count: 0, total: 0 };
            entry.last = ms;
            entry.max = Math.max(entry.max || 0, ms || 0);
            entry.count += 1;
            entry.total += ms;
            AppState.perfStageCosts[key] = entry;
        }

        function withPerfStage(name, fn) {
            const prev = AppState.currentPerfStage || 'idle';
            AppState.currentPerfStage = name;
            const t0 = performance.now();
            const res = fn();
            if (res && typeof res.then === 'function') {
                return res.finally(() => {
                    const ms = Math.round(performance.now() - t0);
                    recordStageCost(name, ms);
                    AppState.currentPerfStage = prev;
                });
            }
            const ms = Math.round(performance.now() - t0);
            recordStageCost(name, ms);
            AppState.currentPerfStage = prev;
            return res;
        }

        function timeit(label, fn) {
            return withPerfStage(label, fn);
        }

        function updatePerfPanel() {
            if (elements.perfDomItems) elements.perfDomItems.textContent = String(AppState.perfStats.domItems || 0);
            if (elements.perfFilterMs) {
                const extra = AppState.perfStageCosts?.filter?.last ? ` (${AppState.perfStageCosts.filter.last}ms)` : '';
                elements.perfFilterMs.textContent = `${AppState.perfStats.filterMs || 0}ms${extra}`;
            }
            if (elements.perfRenderMs) {
                const extra = AppState.perfStageCosts?.renderContacts?.last ? ` (${AppState.perfStageCosts.renderContacts.last}ms)` : '';
                elements.perfRenderMs.textContent = `${AppState.perfStats.renderMs || 0}ms${extra}`;
            }
            if (elements.perfLongTasks) elements.perfLongTasks.textContent = String(AppState.perfStats.longTasks || 0);
            if (elements.perfLongTasksTop) {
                const topLong = (AppState.perfStats.longTaskTop || []).slice(0, 3).map((x) => `${x.name} ${Math.round(x.duration)}ms`).join(' · ');
                const topStages = Object.entries(AppState.perfStageCosts || {}).sort((a,b)=>((b[1]?.last||0)-(a[1]?.last||0))).slice(0,3).map(([k,v])=>`${k}:${v.last}ms`).join(' · ');
                elements.perfLongTasksTop.textContent = [topLong, topStages].filter(Boolean).join(' || ') || '-';
            }
        }

        function applyFilters() {
            if (AppState.contacts.length > 10000) {
                setSaveState('info', `Filtrando ${AppState.contacts.length.toLocaleString()} contactos…`);
            }
            applyFiltersIndexed();
        }


        function adjustStatsCountersForStatus(profileId, fromStatus, toStatus) {
            if (!profileId) profileId = 'default';
            const key = `stats_${profileId}`;
            const current = AppState.statsCacheByProfile?.[key];
            if (!current) return;
            const norm = (x) => String((x ?? 'Sin Estado')).toLowerCase();
            const from = norm(fromStatus);
            const to = norm(toStatus);
            if (from === to) return;
            const dec = (field) => { current[field] = Math.max(0, (current[field] || 0) - 1); };
            const inc = (field) => { current[field] = (current[field] || 0) + 1; };
            const mapField = (st) => st === 'sin revisar' ? 'unreviewed' : st === 'contactado' ? 'contactado' : st === 'revisado' ? 'revisado' : st === 'jugando' ? 'jugando' : st === 'sin wsp' ? 'sinWsp' : st === 'no interesado' ? 'noInteresado' : '';
            const ff = mapField(from); const tf = mapField(to);
            if (ff) dec(ff);
            if (tf) inc(tf);
            if (from === 'sin revisar' && to !== 'sin revisar') inc('reviewed');
            if (from !== 'sin revisar' && to === 'sin revisar') dec('reviewed');
        }

        function calculateCurrentShiftSpeed() {
            const now = new Date();
            const hour = now.getHours();
            
            // Determine current shift
            let currentShift;
            if (hour >= 6 && hour < 14) currentShift = 'tm';
            else if (hour >= 14 && hour < 22) currentShift = 'tt';
            else currentShift = 'tn';
            
            // Get shift start time
            let shiftStart;
            if (currentShift === 'tm') shiftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);
            else if (currentShift === 'tt') shiftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0);
            else {
                // TN shift can start previous day at 22:00 or today at 22:00
                if (hour >= 22) shiftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22, 0, 0);
                else shiftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 22, 0, 0);
            }
            
            const hoursWorked = Math.max(0.1, (now - shiftStart) / (1000 * 60 * 60)); // Minimum 0.1h to avoid division by zero
            
            // Count status changes in current shift from metricEvents
            const shiftEvents = (AppState.metricEvents || []).filter(event => {
                const eventTime = new Date(event.timestamp);
                return eventTime >= shiftStart && 
                       event.type === 'status_change' && 
                       event.payload?.newStatus !== 'sin revisar';
            });
            
            const usersProcessed = shiftEvents.length;
            const usersPerHour = Math.round(usersProcessed / hoursWorked);
            
            return usersPerHour;
        }

        function updateStats() {
            const activeProfile = AppState.activeProfileId || 'default';
            const profileContacts = AppState.contacts.filter(c => (c.profileId || 'default') === activeProfile);
            const totals = {
                total: profileContacts.length,
                unreviewed: 0,
                contactado: 0,
                revisado: 0,
                jugando: 0,
                sinWsp: 0,
                noInteresado: 0,
                reviewed: 0
            };
            const originSet = new Set();

            profileContacts.forEach(c => {
                if (c.origin) originSet.add(c.origin);
                if (c.status !== 'sin revisar') totals.reviewed++;
                if (c.status === 'sin revisar') totals.unreviewed++;
                else if (c.status === 'contactado') totals.contactado++;
                else if (c.status === 'revisado') totals.revisado++;
                else if (c.status === 'jugando') totals.jugando++;
                else if (c.status === 'sin wsp') totals.sinWsp++;
                else if (c.status === 'no interesado') totals.noInteresado++;
            });

            $('#totalCount').textContent = totals.total;
            $('#unreviewedCount').textContent = totals.unreviewed;
            $('#contactadoCount').textContent = totals.contactado;
            const revisadoCountEl = $('#revisadoCount');
            if (revisadoCountEl) revisadoCountEl.textContent = totals.revisado;
            $('#jugandoCount').textContent = totals.jugando;
            $('#sinWspCount').textContent = totals.sinWsp;
            $('#noInteresadoCount').textContent = totals.noInteresado;

            const totalDuplicateEntries = (AppState.duplicates || []).reduce((sum, group) => sum + group.contacts.filter(c => (c.profileId || 'default') === activeProfile).length, 0);
            $('#duplicatesCount').textContent = totalDuplicateEntries;

            // Speed counter: users/hour calculation
            const speedCount = calculateCurrentShiftSpeed();
            const speedEl = $('#speedCount');
            if (speedEl) speedEl.textContent = speedCount;

            updateExportUrgencyBadge();
            const progressPercentage = totals.total > 0 ? Math.round((totals.reviewed / totals.total) * 100) : 0;

            $('#reviewedCount').textContent = totals.reviewed;
            $('#totalContactsCount').textContent = totals.total;
            $('#progressPercentage').textContent = `${progressPercentage}%`;
            $('#progressFill').style.width = `${progressPercentage}%`;

            // Check for shift completion and show summary
            checkShiftCompletion(progressPercentage, totals);

            const uniqueOrigins = [...originSet].sort();
            const lastUploadLabel = AppState.lastImportFileName ? `Última subida (${AppState.lastImportFileName})` : 'Última subida';
            elements.originFilter.innerHTML = '<option value="">Todos los orígenes</option>' +
                `<option value="__last_upload__">${lastUploadLabel}</option>` +
                uniqueOrigins.map(o => `<option value="${o}">${o}</option>`).join('');
            elements.originFilter.value = AppState.originFilter;
        }

        function checkShiftCompletion(progressPercentage, totals) {
            // Only check for completion if we have a reasonable amount of contacts
            if (totals.total < 10) return;
            
            // Check if we just reached high completion (95%+) and haven't shown summary recently
            const completionThreshold = 95;
            const lastSummaryKey = `lastShiftSummary:${AppState.activeProfileId || 'default'}`;
            const lastSummaryTime = localStorage.getItem(lastSummaryKey);
            const now = Date.now();
            
            // Don't show summary more than once per hour
            if (lastSummaryTime && (now - parseInt(lastSummaryTime)) < 60 * 60 * 1000) return;
            
            if (progressPercentage >= completionThreshold) {
                // Determine current shift
                const hour = new Date().getHours();
                let currentShift;
                if (hour >= 6 && hour < 14) currentShift = 'TM';
                else if (hour >= 14 && hour < 22) currentShift = 'TT';
                else currentShift = 'TN';
                
                // Show completion summary
                showShiftCompletionSummary(currentShift, totals);
                localStorage.setItem(lastSummaryKey, String(now));
            }
        }
        
        function showShiftCompletionSummary(shift, totals) {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.7);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: fadeIn 0.3s ease;
            `;
            
            const completionPct = totals.total > 0 ? Math.round((totals.reviewed / totals.total) * 100) : 0;
            
            overlay.innerHTML = `
                <div style="
                    background: var(--bg-card);
                    border: 2px solid var(--accent);
                    border-radius: 16px;
                    padding: 24px 28px;
                    max-width: 420px;
                    text-align: center;
                    animation: slideUp 0.4s ease;
                ">
                    <div style="font-size: 2rem; margin-bottom: 8px;">🎉</div>
                    <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 8px; color: var(--accent);">
                        ¡Turno ${shift} completado!
                    </div>
                    <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">
                        Resumen de tu trabajo:
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                        <div style="background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); border-radius: 8px; padding: 8px;">
                            <div style="font-weight: 700; color: #10b981; font-size: 1.2rem;">${totals.reviewed}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">Revisados</div>
                        </div>
                        <div style="background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); border-radius: 8px; padding: 8px;">
                            <div style="font-weight: 700; color: #3b82f6; font-size: 1.2rem;">${totals.contactado}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">Contactados</div>
                        </div>
                        <div style="background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; padding: 8px;">
                            <div style="font-weight: 700; color: #f59e0b; font-size: 1.2rem;">${totals.sinWsp}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">Sin WhatsApp</div>
                        </div>
                        <div style="background: rgba(139,92,246,0.15); border: 1px solid rgba(139,92,246,0.3); border-radius: 8px; padding: 8px;">
                            <div style="font-weight: 700; color: #8b5cf6; font-size: 1.2rem;">${totals.jugando}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">Jugando</div>
                        </div>
                    </div>
                    <div style="background: rgba(var(--accent-rgb,99,102,241),0.1); border-radius: 8px; padding: 8px; margin-bottom: 12px;">
                        <div style="font-weight: 700; color: var(--accent); font-size: 1.1rem;">${completionPct}% completado</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">¡Excelente trabajo!</div>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">
                        El siguiente operador verá este estado al entrar
                    </div>
                </div>
            `;
            
            // Add CSS animations
            const style = document.createElement('style');
            style.textContent = `
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            `;
            document.head.appendChild(style);
            
            document.body.appendChild(overlay);
            
            // Auto-remove after 3 seconds
            setTimeout(() => {
                overlay.style.animation = 'fadeIn 0.3s ease reverse';
                setTimeout(() => {
                    if (overlay.parentNode) {
                        document.body.removeChild(overlay);
                        document.head.removeChild(style);
                    }
                }, 300);
            }, 3000);
            
            // Click to dismiss
            overlay.onclick = () => {
                if (overlay.parentNode) {
                    document.body.removeChild(overlay);
                    document.head.removeChild(style);
                }
            };
        }

        function calculateStats() {
            updateStats();
        }

        function remountDashboardState(reason = 'generic') {
            AppState.searchIndexDirty = true;
            AppState.statsDirty = true;
            applyFilters();
            calculateStats();
            const paintRender = () => render(true);
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(paintRender);
            else setTimeout(paintRender, 0);
        }

        function getStatusOption(status) {
            return STATUS_OPTIONS.find(s => s.id === status) || STATUS_OPTIONS[0];
        }

        function setReviewMetadata(contact, status) {
            if (!contact) return;
            try {
                const nowIso = new Date().toISOString();
                const safeStatus = (typeof status === 'string' && status.trim()) ? status : (contact.status || 'sin revisar');
                if (safeStatus === 'revisado') {
                    contact.reviewedAt = nowIso;
                }
                if (safeStatus === 'sin revisar') {
                    contact.nextReviewAfter = new Date(Date.now() + (6 * 60 * 60 * 1000)).toISOString();
                } else if (safeStatus === 'contactado') {
                    contact.nextReviewAfter = new Date(Date.now() + (18 * 60 * 60 * 1000)).toISOString();
                } else {
                    contact.nextReviewAfter = null;
                }
            } catch (e) {
                console.error('setReviewMetadata fallback:', e);
            }
        }
        function inferShiftForContact(contact, rrState) {
            const o = normalizeUsername(contact.origin || '');
            if (o.includes('mañana') || o.includes('manana')) return 'tm';
            if (o.includes('tarde')) return 'tt';
            if (o.includes('noche')) return 'tn';
            const seq = ['tm', 'tt', 'tn'];
            const shift = seq[rrState.i % seq.length];
            rrState.i += 1;
            return shift;
        }

        function getLocalCompetitionShift(date = new Date()) {
            const hour = date.getHours();
            if (hour >= 6 && hour < 14) return 'tm';
            if (hour >= 14 && hour < 22) return 'tt';
            return 'tn';
        }

        // Returns { from: Date, to: Date } for the requested shift on a reference date.
        // TN (22:00-06:00) spans midnight: it starts the previous evening.
        function getShiftDateRange(shiftKey, referenceDate = new Date()) {
            const d = new Date(referenceDate);
            const y = d.getFullYear(), mo = d.getMonth(), day = d.getDate();
            if (shiftKey === 'tm') return { from: new Date(y, mo, day, 6, 0, 0), to: new Date(y, mo, day, 13, 59, 59, 999) };
            if (shiftKey === 'tt') return { from: new Date(y, mo, day, 14, 0, 0), to: new Date(y, mo, day, 21, 59, 59, 999) };
            // TN: 22:00 of previous calendar day → 05:59:59 of referenceDate
            const prevDay = new Date(y, mo, day - 1);
            return {
                from: new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 22, 0, 0),
                to: new Date(y, mo, day, 5, 59, 59, 999)
            };
        }

        // Daily log: archive buttonPressEvents + metricEvents into a per-shift log key at rotation time
        function archiveShiftDailyLog(shiftKey) {
            try {
                const pid = AppState.activeProfileId || 'default';
                const logKey = `shiftDailyLog:${pid}`;
                let logs = [];
                try { logs = JSON.parse(localStorage.getItem(logKey) || '[]'); } catch (_) {}
                const range = getShiftDateRange(shiftKey, new Date());
                const events = (AppState.metricEvents || []).filter(e => {
                    const t = new Date(e.at || 0).getTime();
                    return t >= range.from.getTime() && t <= range.to.getTime() && String(e.shift || '').toLowerCase() === shiftKey;
                });
                const transitions = (AppState.statusTransitions || []).filter(t => {
                    const ts = new Date(t.at || 0).getTime();
                    return ts >= range.from.getTime() && ts <= range.to.getTime() && String(t.shift || '').toLowerCase() === shiftKey;
                });
                const entry = {
                    shift: shiftKey,
                    archivedAt: new Date().toISOString(),
                    rangeFrom: range.from.toISOString(),
                    rangeTo: range.to.toISOString(),
                    totalActions: events.length,
                    totalTransitions: transitions.length,
                    statusSummary: transitions.reduce((acc, t) => { acc[t.to] = (acc[t.to] || 0) + 1; return acc; }, {}),
                    events: events.slice(0, 3000)
                };
                logs.unshift(entry);
                if (logs.length > 90) logs = logs.slice(0, 90); // keep ~30 days × 3 shifts
                localStorage.setItem(logKey, JSON.stringify(logs));
            } catch (e) { console.warn('archiveShiftDailyLog error', e); }
        }

        function inferShiftFromIso(isoString) {
            if (!isoString) return '';
            const dt = new Date(isoString);
            if (Number.isNaN(dt.getTime())) return '';
            return getLocalCompetitionShift(dt);
        }

        function updateCompetitionCredit(contact, newStatus, source = 'common', { forceTransfer = false, shiftOverride = '', atOverride = '' } = {}) {
            if (!contact) return false;

            if (newStatus === 'sin revisar') {
                const changed = !!(contact.shiftReviewed || contact.shiftReviewedByShift || contact.shiftReviewedAt);
                contact.shiftReviewed = false;
                contact.shiftReviewedByShift = null;
                contact.shiftReviewedAt = null;
                return changed;
            }

            const localShift = shiftOverride || getLocalCompetitionShift(new Date());
            const changed = forceTransfer || !contact.shiftReviewed || contact.shiftReviewedByShift !== localShift;
            contact.shiftReviewed = true;
            contact.shiftReviewedByShift = localShift;
            if (changed) contact.shiftReviewedAt = atOverride || new Date().toISOString();
            return changed;
        }

        function assignShifts() {
            const rr = { i: 0 };
            const activeProfile = AppState.activeProfileId || 'default';
            AppState.contacts.filter(c => (c.profileId || 'default') === activeProfile).forEach(c => {
                if (!c.assignedShift) c.assignedShift = inferShiftForContact(c, rr);
            });
        }

        function getShiftStats(shift) {
            const activeProfile = AppState.activeProfileId || 'default';
            const scoped = AppState.contacts.filter(c => (c.profileId || 'default') === activeProfile);
            const pendientes = scoped.filter(c => c.assignedShift === shift && c.status === 'sin revisar').length;
            const revisados = scoped.filter(c => c.shiftReviewed && c.shiftReviewedByShift === shift && c.status !== 'sin revisar').length;
            const total = revisados + pendientes;
            const pct = total ? Math.min(100, Math.round((revisados / total) * 100)) : 0;
            return { total, revisados, pendientes, pct };
        }

        function renderShiftsView() {
            assignShifts();
            const shifts = ['tm', 'tt', 'tn'];
            const shiftStats = shifts.map(shift => ({ shift, st: getShiftStats(shift), data: AppState.shiftMode[shift] }));
            const totals = shiftStats.reduce((acc, row) => {
                acc.total += row.st.total;
                acc.revisados += row.st.revisados;
                acc.pendientes += row.st.pendientes;
                return acc;
            }, { total: 0, revisados: 0, pendientes: 0 });
            const pct = totals.total ? Math.round((totals.revisados / totals.total) * 100) : 0;

            const overviewCard = `
                <div class="shifts-overview-card">
                    <div>
                        <div style="font-weight:800; font-size:1rem;">Vista de competencia por turnos</div>
                        <div style="color:var(--text-secondary); font-size:.86rem; margin-top:2px;">En este modo ocultamos búsqueda/filtros generales para enfocarte en productividad por turno.</div>
                        <div class="shifts-overview-stats" style="margin-top:8px;">
                            <span>Total asignados: <strong>${totals.total}</strong></span>
                            <span>Revisados: <strong>${totals.revisados}</strong></span>
                            <span>Pendientes: <strong>${totals.pendientes}</strong></span>
                            <span>Avance global: <strong>${pct}%</strong></span>
                        </div>
                    </div>
                    <div class="shifts-overview-actions">
                        <button class="btn" onclick="rebalanceShift('all')"><i class="fas fa-random"></i> Rebalancear todo</button>
                        <button class="btn" onclick="closeQuickReview()"><i class="fas fa-times-circle"></i> Cerrar revisión rápida</button>
                    </div>
                </div>`;

            const cards = shiftStats.map(({ shift, st, data }) => {
                return `
                <div class="shift-card">
                    <h3>
                        <span>${shift.toUpperCase()}</span>
                        <input class="filter-select" style="max-width:130px;" value="${data.name}" onchange="renameShift('${shift}', this.value)">
                    </h3>
                    <div class="shift-card-sub">Operador y cola de revisión para este turno.</div>
                    <div class="shift-stats">
                        <span>Asignados: <strong>${st.total}</strong></span>
                        <span>Revisados: <strong>${st.revisados}</strong></span>
                        <span>Pendientes: <strong>${st.pendientes}</strong></span>
                    </div>
                    <div class="shift-progress"><span style="width:${st.pct}%"></span></div>
                    <div class="shift-controls">
                        <button class="btn" onclick="startShiftReview('${shift}')"><i class="fas fa-play"></i> Empezar revisión</button>
                        <button class="btn" onclick="rebalanceShift('${shift}')"><i class="fas fa-random"></i> Rebalancear</button>
                    </div>
                </div>`;
            }).join('');

            elements.shiftsView.innerHTML = overviewCard + cards;
            elements.shiftsView.style.display = 'grid';
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

        function getExportUrgency() {
            const now = new Date();
            const slots = [5, 13, 21];
            let lastScheduled = null;
            for (let i = slots.length - 1; i >= 0; i--) {
                const d = new Date(now);
                d.setHours(slots[i], 0, 0, 0);
                if (d <= now) { lastScheduled = d; break; }
            }
            if (!lastScheduled) {
                lastScheduled = new Date(now);
                lastScheduled.setDate(now.getDate() - 1);
                lastScheduled.setHours(21, 0, 0, 0);
            }
            const lastExport = localStorage.getItem('lastExportAt');
            if (lastExport && new Date(lastExport) >= lastScheduled) return null;
            const overdueH = (now - lastScheduled) / 36e5;
            if (overdueH < 0.01) return null;
            if (overdueH < 8) return { level: 1, text: 'Pendiente', next: lastScheduled };
            if (overdueH < 16) return { level: 2, text: 'Atrasado', next: lastScheduled };
            return { level: 3, text: 'Urgente', next: lastScheduled };
        }

        function updateExportUrgencyBadge() {
            const btn = elements.exportBtn;
            if (!btn) return;
            btn.classList.remove('export-urgency-1', 'export-urgency-2', 'export-urgency-3');
            const urgency = getExportUrgency();
            const icon = '<i class="fas fa-download"></i>';
            if (!urgency) {
                btn.innerHTML = `${icon} Exportar`;
                btn.title = 'Exportar';
                return;
            }
            btn.classList.add(`export-urgency-${urgency.level}`);
            btn.innerHTML = `${icon} Exportar <span class="urgency-badge urgency-l${urgency.level}">${urgency.text}</span>`;
            btn.title = `Recordatorio de exportación (${urgency.next.toLocaleString('es-ES')})`;
        }


        function getMessageSentBadge(contact) {
            if (!contact?.lastMessageSentAt) return '';
            const sentAt = new Date(contact.lastMessageSentAt);
            const title = `Mensaje enviado: ${sentAt.toLocaleString('es-ES')}`;
            return `<span class="message-sent-tick" title="${title}"><i class="fas fa-check-double"></i></span>`;
        }

        function createCard(contact) {
            const statusOption = getStatusOption(contact.status);
            const escapedName = (contact.name || '').replace(/'/g, "\\'");
            const escapedPhone = (contact.phone || '').replace(/'/g, "\\'");
            const urgency = getContactUrgency(contact);
            const sentBadge = getMessageSentBadge(contact);
            const opsMini = getOpsMiniHtml(contact);
            const editedAtLabel = contact.lastEditedAt ? new Date(contact.lastEditedAt).toLocaleString('es-ES') : '-';
            
            return `
                <div class="contact-card ${AppState.selectedContacts.has(contact.id) ? 'selected' : ''} ${contact.isDuplicate ? 'duplicate' : ''}" style="--status-rgb: ${statusOption.rgb};" data-id="${contact.id}">
                    ${contact.isDuplicate ? '<span class="duplicate-badge"><i class="fas fa-exclamation-triangle"></i> DUP</span>' : ''}${contact.phoneAlert ? '<span class="duplicate-badge" style="right:8px;left:auto;background:rgba(245,158,11,.22);border-color:rgba(245,158,11,.45);" title="Teléfono sospechoso"><i class="fas fa-exclamation-circle"></i> ALERTA</span>' : ''}
                    <input type="checkbox" class="card-checkbox" ${AppState.selectedContacts.has(contact.id) ? 'checked' : ''}>
                    <div class="card-header">
                        <div class="card-icon" style="color: ${statusOption.color};">
                            <i class="fas ${statusOption.icon}"></i>
                        </div>
                        <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
                            <span class="card-name" onclick="copyToClipboard('${escapedName}', event)" style="cursor: pointer; flex: 1;" title="Click para copiar">${contact.pinned ? '📌 ' : ''}${contact.phoneAlert ? '⚠️ ' : ''}${contact.name}</span>${AppState.currentView === 'shifts' && contact.assignedShift ? `<span class=\"shift-tag\">${contact.assignedShift.toUpperCase()}</span>` : ''}${urgency ? `<span class=\"urgency-badge urgency-l${urgency.level}\" title=\"${urgency.title}\"><i class=\"fas fa-clock\"></i>${urgency.label}</span>` : ''}
                            <button class="btn" style="padding: 4px 8px; font-size: 0.75rem;" onclick="editContactField(${contact.id}, 'name', event)" title="Editar nombre">
                                <i class="fas fa-pencil-alt"></i>
                            </button>
                            <button class="btn" style="padding: 4px 8px; font-size: 0.75rem;" onclick="openContactHistory(${contact.id}, event)" title="Historial del usuario">
                                <i class="fas fa-id-card"></i>
                            </button>
                        </div>
                    </div>
                    <div class="card-details">
                        ${contact.phone ? `
                            <div class="detail-item">
                                <i class="fas fa-phone"></i>
                                <span onclick="copyToClipboard('${escapedPhone}', event)" style="cursor: pointer; flex: 1;" title="Click para copiar">${contact.phone}</span>
                                <button class="btn" style="padding: 4px 8px; font-size: 0.7rem;" onclick="editContactField(${contact.id}, 'phone', event)" title="Editar">
                                    <i class="fas fa-pencil-alt"></i>
                                </button>
                                <button class="btn btn-success" style="padding: 4px 8px; font-size: 0.7rem;" onclick="openWhatsApp('${escapedPhone}', event)" title="WhatsApp">
                                    <i class="fab fa-whatsapp"></i>
                                </button>
                                ${sentBadge}
                            </div>
                        ` : `<div class="detail-item"><i class="fas fa-phone"></i><span style="color: var(--text-secondary); flex:1;">Sin teléfono</span><button class="btn" style="padding: 4px 8px; font-size: 0.7rem;" onclick="editContactField(${contact.id}, 'phone', event)" title="Agregar teléfono"><i class="fas fa-pencil-alt"></i></button></div>`}
                        <div class="detail-item"><i class="fas fa-tag"></i><span>${contact.origin}</span></div>
                        <div class="detail-item">
                            <i class="fas fa-circle-notch"></i>
                            <span class="card-status-inline" id="cardStatusInline-${contact.id}"><span class="card-status-trigger" onclick="openCardStatusMenu(${contact.id}, event)"><span class="status-badge status-${contact.status.replace(/ /g, '-')}">${statusOption.label}</span><i class="fas fa-chevron-down"></i></span></span>
                        </div>
                    </div>
                    ${opsMini}
                    <div class="card-footer">
                        <span><i class="fas fa-calendar"></i> ${new Date(contact.lastUpdated).toLocaleDateString('es-ES')}</span><span title="Última edición"><i class="fas fa-pen"></i> ${editedAtLabel}</span>
                        <button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.75rem;" onclick="deleteContact(${contact.id}, event)"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }

        function createListItem(contact) {
            const statusOption = getStatusOption(contact.status);
            const escapedName = (contact.name || '').replace(/'/g, "\\'");
            const escapedPhone = (contact.phone || '').replace(/'/g, "\\'");
            const sentBadge = getMessageSentBadge(contact);
            const opsMini = getOpsMiniHtml(contact);
            const editedAtLabel = contact.lastEditedAt ? new Date(contact.lastEditedAt).toLocaleString('es-ES') : '-';
            
            return `
                <div class="list-item ${AppState.selectedContacts.has(contact.id) ? 'selected' : ''} ${contact.isDuplicate ? 'duplicate' : ''}" style="--status-rgb: ${statusOption.rgb};" data-id="${contact.id}">
                    <div><input type="checkbox" ${AppState.selectedContacts.has(contact.id) ? 'checked' : ''}></div>
                    <div class="list-item-name list-item-main" style="--status-color: ${statusOption.color}; --status-rgb: ${statusOption.rgb};">
                        <i class="fas ${statusOption.icon} list-status-bg-icon"></i>
                        <div class="list-name-row">
                            <span onclick="copyToClipboard('${escapedName}', event)" style="flex: 1; cursor: pointer;" title="Click para copiar">
                                ${contact.isDuplicate ? '<i class=\"fas fa-exclamation-triangle\" style=\"color: var(--accent-warning);\"></i> ' : ''}${contact.phoneAlert ? '<i class=\"fas fa-exclamation-circle\" style=\"color: var(--accent-warning);\" title=\"Teléfono sospechoso\"></i> ' : ''}${contact.name}${AppState.currentView === 'shifts' && contact.assignedShift ? ` <span class=\"shift-tag\">${contact.assignedShift.toUpperCase()}</span>` : ''}
                            </span>
                            <button class="btn" style="padding: 4px 8px; font-size: 0.75rem;" onclick="editContactField(${contact.id}, 'name', event)" title="Editar">
                                <i class="fas fa-pencil-alt"></i>
                            </button>
                        </div>
                        <span class="list-status-chip"><i class="fas ${statusOption.icon}"></i>${statusOption.label}</span>${opsMini}
                    </div>
                    <div class="list-item-phone">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span onclick="copyToClipboard('${escapedPhone}', event)" style="flex: 1; font-family: monospace; cursor: pointer;" title="Click para copiar">${contact.phone || 'Sin teléfono'}</span>
                            <button class="btn" style="padding: 4px 8px; font-size: 0.75rem;" onclick="editContactField(${contact.id}, 'phone', event)" title="${contact.phone ? 'Editar' : 'Agregar teléfono'}">
                                <i class="fas fa-pencil-alt"></i>
                            </button>
                        </div>
                    </div>
                    <div class="list-item-origin">${contact.origin}</div>
                    <div class="list-item-date" title="Última edición: ${editedAtLabel}">${new Date(contact.lastUpdated).toLocaleDateString('es-ES')}<br><small style="color:var(--text-secondary);">✎ ${editedAtLabel.split(',')[0] || editedAtLabel}</small></div>
                    <div class="whatsapp-cell">
                        ${contact.phone ? `
                            <button class="btn whatsapp-btn" onclick="openWhatsApp('${escapedPhone}', event)" title="Abrir WhatsApp">
                                <i class="fab fa-whatsapp"></i>
                            </button>
                            ${sentBadge}
                        ` : '<span style="color: var(--text-secondary); font-size: 0.8rem;">-</span>'}
                    </div>
                    <div class="status-buttons">
                        <button class="status-btn sin-revisar ${contact.status === 'sin revisar' ? 'active' : ''}" 
                                onclick="changeContactStatus(${contact.id}, 'sin revisar', event)" 
                                title="Sin Revisar">
                            <i class="fas fa-circle"></i>
                        </button>
                        <button class="status-btn contactado ${contact.status === 'contactado' ? 'active' : ''}" 
                                onclick="changeContactStatus(${contact.id}, 'contactado', event)" 
                                title="Contactado">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="status-btn revisado ${contact.status === 'revisado' ? 'active' : ''}" 
                                onclick="changeContactStatus(${contact.id}, 'revisado', event)" 
                                title="Revisado">
                            <i class="fas fa-user-check"></i>
                        </button>
                        <button class="status-btn jugando ${contact.status === 'jugando' ? 'active' : ''}" 
                                onclick="changeContactStatus(${contact.id}, 'jugando', event)" 
                                title="Jugando">
                            <i class="fas fa-gamepad"></i>
                        </button>
                        <button class="status-btn sin-wsp ${contact.status === 'sin wsp' ? 'active' : ''}" 
                                onclick="changeContactStatus(${contact.id}, 'sin wsp', event)" 
                                title="Sin WhatsApp">
                            <i class="fas fa-ban"></i>
                        </button>
                        <button class="status-btn no-interesado ${contact.status === 'no interesado' ? 'active' : ''}" 
                                onclick="changeContactStatus(${contact.id}, 'no interesado', event)" 
                                title="No Interesado">
                            <i class="fas fa-times"></i>
                        </button>
                        <button class="btn" style="padding: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;" onclick="openContactHistory(${contact.id}, event)" title="Historial por usuario"><i class="fas fa-id-card"></i></button>
                        <button class="btn btn-danger" style="padding: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;" onclick="deleteContact(${contact.id}, event)" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        function renderPaginatedView(renderFunc) {
            const start = (AppState.currentPage - 1) * AppState.itemsPerPage;
            const end = start + AppState.itemsPerPage;
            const pageContacts = AppState.filteredContacts.slice(start, end);
            if (pageContacts.length === 0 && AppState.filteredContacts.length > 0 && AppState.currentPage > 1) {
                const totalPages = Math.max(1, Math.ceil(AppState.filteredContacts.length / AppState.itemsPerPage));
                AppState.currentPage = Math.min(AppState.currentPage, totalPages);
                renderPaginatedView(renderFunc);
                return;
            }

            const renderContactsStartedAt = performance.now();
            const MAX_DOM_NODES = 120;
            if (AppState.currentView === 'cards') {
                elements.cardsView.classList.add('virtual-scroll');
                const scroller = elements.cardsView;
                const cardWidth = 320;
                const cols = Math.max(1, Math.floor((scroller.clientWidth || window.innerWidth || 1200) / cardWidth));
                const rowHeight = AppState.virtualization.cards.itemHeight;
                const bufferRows = AppState.virtualization.cards.bufferRows;
                const totalRows = Math.ceil(pageContacts.length / cols);
                const viewRows = Math.max(1, Math.ceil((scroller.clientHeight || 680) / rowHeight));
                const firstRow = Math.max(0, Math.floor((AppState.virtualization.cards.scrollTop || 0) / rowHeight) - bufferRows);
                const rowWindow = Math.max(1, Math.min(totalRows, viewRows + bufferRows * 2));
                const startIndex = firstRow * cols;
                const endIndex = Math.min(pageContacts.length, Math.min(startIndex + (rowWindow * cols), startIndex + MAX_DOM_NODES));
                const renderContacts = pageContacts.slice(startIndex, endIndex);
                const topPad = firstRow * rowHeight;
                const bottomPad = Math.max(0, (totalRows - Math.ceil(endIndex / cols)) * rowHeight);
                AppState.perfStats.domItems = renderContacts.length;
                scroller.innerHTML = renderContacts.length > 0
                    ? `<div class="virtual-spacer" style="height:${topPad}px"></div>${renderContacts.map(renderFunc).join('')}<div class="virtual-spacer" style="height:${bottomPad}px"></div>`
                    : '<div style="text-align: center; padding: 50px; color: var(--text-secondary); grid-column: 1 / -1;">No se encontraron contactos</div>';

                if (!scroller.dataset.virtualBound) {
                    scroller.dataset.virtualBound = '1';
                    let ticking = false;
                    scroller.addEventListener('scroll', () => {
                        AppState.virtualization.cards.scrollTop = scroller.scrollTop || 0;
                        if (ticking) return;
                        ticking = true;
                        requestAnimationFrame(() => {
                            ticking = false;
                            if (AppState.currentView === 'cards') renderPaginatedView(createCard);
                        });
                    }, { passive: true });
                }
            } else {
                elements.listView.classList.add('virtual-scroll');
                const scroller = elements.listView;
                const rowHeight = AppState.virtualization.list.itemHeight;
                const bufferRows = AppState.virtualization.list.bufferRows;
                const viewRows = Math.max(1, Math.ceil((scroller.clientHeight || 680) / rowHeight));
                const firstRow = Math.max(0, Math.floor((AppState.virtualization.list.scrollTop || 0) / rowHeight) - bufferRows);
                const visibleRows = Math.max(1, Math.min(pageContacts.length, viewRows + bufferRows * 2));
                const startIndex = firstRow;
                const endIndex = Math.min(pageContacts.length, Math.min(startIndex + visibleRows, startIndex + MAX_DOM_NODES));
                const renderContacts = pageContacts.slice(startIndex, endIndex);
                const topPad = startIndex * rowHeight;
                const bottomPad = Math.max(0, (pageContacts.length - endIndex) * rowHeight);
                AppState.perfStats.domItems = renderContacts.length;
                const listItems = renderContacts.map(renderFunc).join('');
                scroller.innerHTML = `
                    <div class="list-header">
                        <div><input type="checkbox" id="selectAllCheckbox"></div>
                        <div>Nombre</div>
                        <div>Teléfono</div>
                        <div>Origen</div>
                        <div>Fecha</div>
                        <div>WhatsApp</div>
                        <div>Acciones</div>
                    </div>
                    <div class="virtual-spacer" style="height:${topPad}px"></div>
                    ${listItems || '<div style="text-align: center; padding: 50px; color: var(--text-secondary); grid-column: 1 / -1;">No se encontraron contactos</div>'}
                    <div class="virtual-spacer" style="height:${bottomPad}px"></div>
                `;
                const selectAllCheckbox = $('#selectAllCheckbox');
                if (selectAllCheckbox) {
                    const areAllOnPageSelected = renderContacts.length > 0 && renderContacts.every(c => AppState.selectedContacts.has(c.id));
                    selectAllCheckbox.checked = areAllOnPageSelected;
                    selectAllCheckbox.onchange = (e) => {
                        renderContacts.forEach(c => {
                            if (e.target.checked) AppState.selectedContacts.add(c.id);
                            else AppState.selectedContacts.delete(c.id);
                        });
                        renderPaginatedView(createListItem);
                        updateBulkActionsBar();
                    };
                }
                if (!scroller.dataset.virtualBound) {
                    scroller.dataset.virtualBound = '1';
                    let ticking = false;
                    scroller.addEventListener('scroll', () => {
                        AppState.virtualization.list.scrollTop = scroller.scrollTop || 0;
                        if (ticking) return;
                        ticking = true;
                        requestAnimationFrame(() => {
                            ticking = false;
                            if (AppState.currentView === 'list') renderPaginatedView(createListItem);
                        });
                    }, { passive: true });
                }
            }
            AppState.perfStats.renderContactsMs = Math.round(performance.now() - renderContactsStartedAt);
            recordStageCost('renderContacts', AppState.perfStats.renderContactsMs);
            renderPagination();
        }

        function renderPagination() {
            const totalPages = Math.ceil(AppState.filteredContacts.length / AppState.itemsPerPage);
            if (totalPages <= 1) {
                elements.pagination.innerHTML = '';
                return;
            }
            let html = '';
            
            html += `<button ${AppState.currentPage === 1 ? 'disabled' : ''} onclick="changePage(${AppState.currentPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
            
            const pagesToShow = [];
            pagesToShow.push(1);
            if (AppState.currentPage > 4) pagesToShow.push('...');
            for (let i = Math.max(2, AppState.currentPage - 2); i <= Math.min(totalPages - 1, AppState.currentPage + 2); i++) {
                pagesToShow.push(i);
            }
            if (AppState.currentPage < totalPages - 3) pagesToShow.push('...');
            if(totalPages > 1) pagesToShow.push(totalPages);

            const uniquePages = [...new Set(pagesToShow)];

            uniquePages.forEach(p => {
                if (p === '...') {
                    html += '<span class="page-info">...</span>';
                } else {
                    html += `<button class="${p === AppState.currentPage ? 'active' : ''}" onclick="changePage(${p})">${p}</button>`;
                }
            });

            html += `<button ${AppState.currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${AppState.currentPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
            html += `<span class="page-info">Página ${AppState.currentPage} de ${totalPages} (${AppState.filteredContacts.length} contactos)</span>`;
            html += `<input id="pageJumpInput" class="origin-input" style="margin-top:0;width:90px;" type="number" min="1" max="${totalPages}" value="${AppState.currentPage}" />`;
            html += `<button onclick="jumpToPage()" title="Ir a página">Ir</button>`;
            
            elements.pagination.innerHTML = html;
        }

        window.jumpToPage = () => {
            const input = document.getElementById('pageJumpInput');
            if (!input) return;
            const page = parseInt(input.value || '1', 10);
            if (Number.isNaN(page)) return;
            changePage(page);
        };

        window.changePage = (page) => {
            if (page < 1 || page > Math.ceil(AppState.filteredContacts.length / AppState.itemsPerPage)) return;
            AppState.currentPage = page;
            const pid = AppState.activeProfileId || 'default';
            AppState.profilePageMap[pid] = page;
            savePreferences();
            if (AppState.currentView === 'shifts') {
                elements.cardsView.style.display = 'none';
                elements.listView.style.display = 'none';
                elements.pagination.style.display = 'none';
                renderShiftsView();
            } else {
                elements.shiftsView.style.display = 'none';
                renderPaginatedView(AppState.currentView === 'cards' ? createCard : createListItem);
            }
        };

        window.deleteContact = (id, event) => {
            if (event) event.stopPropagation();
            const contact = AppState.searchIndex?.byId?.get(id) || AppState.contacts.find(c => c.id === id);
            if (contact && confirm(`¿Eliminar "${contact.name}"?`)) {
                const oldStatus = contact.status || 'Sin Estado';
                adjustStatsCountersForStatus(contact.profileId || 'default', oldStatus, 'Sin Estado');
                AppState.contacts = AppState.contacts.filter(c => c.id !== id);
                AppState.selectedContacts.delete(id);
                addToHistory('Contacto eliminado', contact.name);
                if (window.nexoStore?.queueDelta) {
                    window.nexoStore.queueDelta({ type: 'contact-delete', id: contact.id, at: new Date().toISOString() }).catch(() => {});
                    scheduleStatusDeltaFlush('contact-delete');
                }
                saveData(false, { deltaOnly: true });
                render();
                showNotification('Contacto eliminado', 'success');
            }
        };

        function scheduleFastBackgroundSave(source = 'common') {
            setTimeout(() => {
                try { saveData(); } catch (_) {}
            }, 1200);
            if (source !== 'shift') {
                setTimeout(() => {
                    try { render(); } catch (_) {}
                }, 500);
            }
        }

        window.copyToClipboard = (text, event) => {
            if (event) event.stopPropagation();
            
            // Zero-lag: ejecución síncrona inmediata
            try {
                // Método moderno y rápido
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(() => {
                        showNotification('Copiado: ' + text, 'success');
                    }).catch(() => {
                        // Fallback síncrono
                        fallbackCopy(text);
                    });
                } else {
                    // Fallback directo para navegadores viejos
                    fallbackCopy(text);
                }
            } catch (error) {
                fallbackCopy(text);
            }
        };
        

        function fallbackCopy(text) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showNotification('Copiado: ' + text, 'success');
            } catch (error) {
                showNotification('Error al copiar', 'error');
            }
        }

        let _statusDeltaFlushTimer = null;
        function scheduleStatusDeltaFlush(reason = 'manual') {
            if (_statusDeltaFlushTimer) clearTimeout(_statusDeltaFlushTimer);
            const delay = reason === 'idle-5s' ? 5000 : 1500;
            _statusDeltaFlushTimer = setTimeout(() => {
                _statusDeltaFlushTimer = null;
                try {
                    if (AppState.pendingStatusDeltas?.length > 0) {
                        saveData();
                    }
                } catch (_) {}
            }, delay);
        }

        function enqueueStatusDelta(contact, fromStatus, toStatus, at) {
            if (!contact?.id) return;
            AppState.pendingStatusDeltas.push({
                type: 'contact-status',
                id: contact.id,
                fromStatus,
                status: toStatus,
                lastUpdated: at || new Date().toISOString(),
                lastEditedAt: at || new Date().toISOString(),
                profileId: contact.profileId || 'default'
            });
            scheduleStatusDeltaFlush('idle-5s');
        }

        window.changeContactStatus = (id, newStatus, event, source = 'common', meta = {}) => {
            try {
            if (event) event.stopPropagation();
            const contact = AppState.searchIndex?.byId?.get(id) || AppState.contacts.find(c => c.id === id);
            if (!contact) return;

            const oldStatus = contact.status;
            let requestedStatus = applyRecontactAutopolicy(contact, newStatus);
            if (contact.ops?.suggestedStatus) {
                requestedStatus = getHigherPriorityStatus(requestedStatus, contact.ops.suggestedStatus);
            }
            const eventAt = meta?.at || new Date().toISOString();
            const shiftByEvent = meta?.shift || inferShiftFromIso(eventAt) || '';
            if (oldStatus === requestedStatus) {
                const moved = updateCompetitionCredit(contact, requestedStatus, source, { forceTransfer: true, shiftOverride: shiftByEvent, atOverride: eventAt });
                if (!moved) return;
                touchContactEdit(contact, source === 'shift' ? 'turno_transfer' : 'status_transfer');
                addToHistory('Crédito de competencia transferido', `${contact.name}: ahora cuenta para ${String(contact.shiftReviewedByShift || '-').toUpperCase()}`, contact.id);
                setSaveState('pending', 'Guardado diferido...');
                enqueueStatusDelta(contact, oldStatus, requestedStatus, eventAt);
                scheduleFastBackgroundSave(source);
                return;
            }

            contact.status = requestedStatus;
            adjustStatsCountersForStatus(contact.profileId || 'default', oldStatus, requestedStatus);
            updateCompetitionCredit(contact, requestedStatus, source, { shiftOverride: shiftByEvent, atOverride: eventAt });
            try { setReviewMetadata(contact, requestedStatus); } catch (e) { console.error('Error metadata estado:', e); }
            touchContactEdit(contact, source === 'shift' ? 'turno_status' : 'status_change');
            AppState.lastEditedContact = id;
            const policyNote = (requestedStatus !== newStatus && requestedStatus === 'sin wsp') ? ' (autopolítica 3 recontactos)' : '';
            addToHistory('Estado cambiado', `${contact.name}: ${oldStatus} → ${requestedStatus}${policyNote}`, contact.id);
            AppState.statusTransitions.unshift({ at: eventAt, from: oldStatus, to: requestedStatus, contactId: contact.id, profileId: contact.profileId || 'default', actor: AppState.operatorName || 'PC local', shift: shiftByEvent || contact.shiftReviewedByShift || contact.assignedShift || '' });
            recordMetricEvent('status_changed', {
                profileId: contact.profileId || 'default',
                contactId: contact.id,
                from: oldStatus,
                to: requestedStatus,
                status: requestedStatus,
                at: eventAt,
                shift: shiftByEvent || contact.shiftReviewedByShift || contact.assignedShift || '',
                selectionType: source
            });
            if (AppState.statusTransitions.length > 5000) AppState.statusTransitions = AppState.statusTransitions.slice(0, 5000);
            AppState.buttonPressEvents.unshift({ at: eventAt, action: 'status-change', from: oldStatus, to: requestedStatus, shift: shiftByEvent || contact.shiftReviewedByShift || contact.assignedShift || '', profileId: contact.profileId || 'default', actor: AppState.operatorName || 'PC local' });
            if (AppState.buttonPressEvents.length > 20000) AppState.buttonPressEvents = AppState.buttonPressEvents.slice(0, 20000);
            if (oldStatus === 'sin revisar' && requestedStatus !== 'sin revisar') {
                try {
                    ensureReviewMilestonesState();
                    ensureMotivationWindow();
                    AppState.reviewPositiveCounter += 1;
                    const milestones = [50, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000];
                    const nearest = milestones.find(v => v === AppState.reviewPositiveCounter);
                    if (nearest && !AppState.reviewMilestonesShown[nearest]) {
                        AppState.reviewMilestonesShown[nearest] = true;
                        sendNativeMotivation(nearest).catch(() => {});
                    }
                } catch (moralErr) {
                    console.warn('No se pudo procesar notificación motivacional:', moralErr);
                }
            }
            if (policyNote) announceGeneral('Autopolítica aplicada: 3 recontactos sin respuesta → sin WhatsApp.', 'warn', 3000);
            setSaveState('pending', 'Guardado en segundo plano...');
            enqueueStatusDelta(contact, oldStatus, requestedStatus, eventAt);
            scheduleFastBackgroundSave(source);
            } catch (statusErr) {
                console.error('Error al cambiar estado:', statusErr);
                showNotification(`No se pudo cambiar estado: ${statusErr?.message || statusErr}`, 'error');
            }
        };

        window.applyOpsSuggestion = (id, event) => {
            if (event) event.stopPropagation();
            const contact = AppState.searchIndex?.byId?.get(id) || AppState.contacts.find(c => c.id === id);
            if (!contact || !contact.ops?.suggestedStatus) return;
            changeContactStatus(id, contact.ops.suggestedStatus, null, 'ops', { at: contact.ops?.lastCargaAt || new Date().toISOString(), shift: inferShiftFromIso(contact.ops?.lastCargaAt) });
            showNotification(`Sugerencia aplicada a ${contact.name}`, 'success');
        };

        window.pinContact = (id, event) => {
            if (event) event.stopPropagation();
            const contact = AppState.searchIndex?.byId?.get(id) || AppState.contacts.find(c => c.id === id);
            if (!contact) return;
            contact.pinned = !contact.pinned;
            touchContactEdit(contact, 'pin_toggle');
            saveData();
            render();
        };

        window.editContactField = (id, field, event) => {
            if (event) event.stopPropagation();
            const contact = AppState.searchIndex?.byId?.get(id) || AppState.contacts.find(c => c.id === id);
            if (!contact) return;
            openAddSingleModalForEdit(contact, field);
        };

        function undoToLastContact() {
            if (AppState.lastEditedContact) {
                const contact = AppState.contacts.find(c => c.id === AppState.lastEditedContact);
                if (contact) {
                    elements.searchInput.value = contact.name;
                    AppState.searchTerm = contact.name;
                    render();
                    showNotification(`📍 Mostrando: ${contact.name}`, 'info');
                } else {
                    showNotification('El último contacto editado ya no existe', 'error');
                }
            } else {
                showNotification('No hay contactos editados recientemente', 'info');
            }
        }

        function loadPreferences() {
            try {
                const tpl = localStorage.getItem('whatsappTemplate');
                if (tpl) AppState.whatsappTemplate = tpl;
                const mode = localStorage.getItem('duplicateMergeMode');
                if (mode) AppState.duplicateMergeMode = mode;
                const lastAutoDl = parseInt(localStorage.getItem('lastAutoBackupDownloadAt') || '0', 10);
                if (!Number.isNaN(lastAutoDl) && lastAutoDl > 0) AppState.lastAutoDownloadAt = lastAutoDl;
                const sig = localStorage.getItem('lastAutoBackupSignature') || '';
                if (sig) AppState.lastAutoBackupSignature = sig;
                AppState.lastImportBatchId = localStorage.getItem('lastImportBatchId') || '';
                AppState.previousImportBatchId = localStorage.getItem('previousImportBatchId') || '';
                AppState.lastImportFileName = localStorage.getItem('lastImportFileName') || '';
                const profilesRaw = localStorage.getItem('nexoProfiles');
                if (profilesRaw) { try { AppState.profiles = JSON.parse(profilesRaw); } catch (_) {} }
                AppState.activeProfileId = localStorage.getItem('activeProfileId') || AppState.activeProfileId || 'default';
                AppState.splitImportByFile = localStorage.getItem('splitImportByFile') === '1';
                const operatorName = localStorage.getItem('operatorName');
                if (operatorName) AppState.operatorName = operatorName;
                const statusTransitionsRaw = localStorage.getItem(`statusTransitions:${AppState.activeProfileId||'default'}`);
                if (statusTransitionsRaw) { try { AppState.statusTransitions = JSON.parse(statusTransitionsRaw); } catch (_) { AppState.statusTransitions = []; } }
                const buttonPressEventsRaw = localStorage.getItem(`buttonPressEvents:${AppState.activeProfileId||'default'}`);
                if (buttonPressEventsRaw) { try { AppState.buttonPressEvents = JSON.parse(buttonPressEventsRaw); } catch (_) { AppState.buttonPressEvents = []; } }
                const shiftSnapshotsRaw = localStorage.getItem(`shiftSnapshots:${AppState.activeProfileId||'default'}`);
                if (shiftSnapshotsRaw) { try { AppState.shiftSnapshots = JSON.parse(shiftSnapshotsRaw); } catch (_) { AppState.shiftSnapshots = []; } }
                AppState.lastMidnightExportDate = localStorage.getItem('lastMidnightExportDate') || '';
                AppState.midnightExportPending = localStorage.getItem('midnightExportPending') === '1';
                AppState.controlImportUnlocked = localStorage.getItem('controlImportUnlocked') === '1';
                AppState.controlPasswordHash = localStorage.getItem('controlPasswordHash') || '';
                AppState.controlLastImportedAt = localStorage.getItem('controlLastImportedAt') || '';
                const controlReportsRaw = localStorage.getItem('controlReports');
                if (controlReportsRaw) { try { AppState.controlReports = JSON.parse(controlReportsRaw); } catch (_) { AppState.controlReports = []; } }
                const metricEventsRaw = localStorage.getItem(`metricEvents:${AppState.activeProfileId||'default'}`);
                if (metricEventsRaw) { try { AppState.metricEvents = JSON.parse(metricEventsRaw); } catch (_) { AppState.metricEvents = []; } }
                const baselineRaw = localStorage.getItem('monthlyBaselineByProfile');
                if (baselineRaw) { try { AppState.monthlyBaselineByProfile = JSON.parse(baselineRaw); } catch (_) { AppState.monthlyBaselineByProfile = {}; } }
                AppState.uploadUnlockedUntil = Number(localStorage.getItem('uploadUnlockedUntil') || '0') || 0;
                const uploadAuditRaw = localStorage.getItem('uploadAuditLog');
                if (uploadAuditRaw) { try { AppState.uploadAuditLog = JSON.parse(uploadAuditRaw); } catch (_) { AppState.uploadAuditLog = []; } }
                const queuedUploadsRaw = localStorage.getItem('queuedUploads');
                if (queuedUploadsRaw) { try { AppState.queuedUploads = JSON.parse(queuedUploadsRaw); } catch (_) { AppState.queuedUploads = []; } }
                const themeCatalogRaw = localStorage.getItem('themeCatalog');
                if (themeCatalogRaw) { try { AppState.themeCatalog = JSON.parse(themeCatalogRaw); } catch (_) { AppState.themeCatalog = {}; } }
                AppState.activeThemeId = localStorage.getItem('activeThemeId') || AppState.activeThemeId || 'whaticket-blue';
                AppState.lightMode = localStorage.getItem('lightMode') === '1';
                const profilePageMapRaw = localStorage.getItem('profilePageMap');
                if (profilePageMapRaw) { try { AppState.profilePageMap = JSON.parse(profilePageMapRaw); } catch (_) { AppState.profilePageMap = {}; } }
                const backupMode = localStorage.getItem('autoBackupStorageMode');
                if (backupMode === 'download' || backupMode === 'file' || backupMode === 'ask') {
                    AppState.autoBackupStorageMode = backupMode === 'ask' ? 'download' : backupMode;
                } else {
                    AppState.autoBackupStorageMode = 'download';
                }
            } catch (e) {
                console.error('Error al cargar preferencias:', e);
            }
            if (elements.whatsappTemplateInput) {
                elements.whatsappTemplateInput.value = AppState.whatsappTemplate;
            }
        }

        let preferencesSaveTimer = null;
        function persistPreferencesNow() {
            try {
                localStorage.setItem('whatsappTemplate', AppState.whatsappTemplate);
                localStorage.setItem('duplicateMergeMode', AppState.duplicateMergeMode);
                localStorage.setItem('nexoProfiles', JSON.stringify(AppState.profiles || []));
                localStorage.setItem('activeProfileId', AppState.activeProfileId || 'default');
                localStorage.setItem('splitImportByFile', AppState.splitImportByFile ? '1' : '0');
                localStorage.setItem('operatorName', AppState.operatorName || 'PC local');
                localStorage.setItem('controlImportUnlocked', AppState.controlImportUnlocked ? '1' : '0');
                if (AppState.controlPasswordHash) localStorage.setItem('controlPasswordHash', AppState.controlPasswordHash);
                if (AppState.controlLastImportedAt) localStorage.setItem('controlLastImportedAt', AppState.controlLastImportedAt);
                localStorage.setItem('controlReports', JSON.stringify((AppState.controlReports || []).slice(0, 180)));
                localStorage.setItem(`metricEvents:${AppState.activeProfileId||'default'}`, JSON.stringify((AppState.metricEvents || []).slice(0, 3000)));
                localStorage.setItem('monthlyBaselineByProfile', JSON.stringify(AppState.monthlyBaselineByProfile || {}));
                localStorage.setItem('uploadUnlockedUntil', String(AppState.uploadUnlockedUntil || 0));
                localStorage.setItem('uploadAuditLog', JSON.stringify((AppState.uploadAuditLog || []).slice(0, 5000)));
                localStorage.setItem('queuedUploads', JSON.stringify((AppState.queuedUploads || []).slice(0, 300)));
                localStorage.setItem('themeCatalog', JSON.stringify(AppState.themeCatalog || {}));
                localStorage.setItem('activeThemeId', AppState.activeThemeId || 'whaticket-blue');
                localStorage.setItem('lightMode', AppState.lightMode ? '1' : '0');
                localStorage.setItem('profilePageMap', JSON.stringify(AppState.profilePageMap || {}));
                
                // SEPARACIÓN ESTRICTA: Guardar contactos del perfil activo automáticamente
                saveCurrentProfileContacts();
            } catch (e) {
                console.error('Error al guardar preferencias:', e);
                // Graceful degradation: try saving only essential preferences
                try {
                    localStorage.setItem('activeProfileId', AppState.activeProfileId || 'default');
                    localStorage.setItem('operatorName', AppState.operatorName || 'PC local');
                    localStorage.setItem('activeThemeId', AppState.activeThemeId || 'whaticket-blue');
                    localStorage.setItem('lightMode', AppState.lightMode ? '1' : '0');
                } catch (e2) {
                    console.warn('No se pudieron guardar preferencias básicas:', e2);
                }
            }
        }

        function saveCurrentProfileContacts() {
            if (!AppState.activeProfileId) return;
            
            try {
                const profileContacts = AppState.contacts.filter(c => 
                    (c.profileId || 'default') === AppState.activeProfileId
                );
                
                if (window.electronAPI?.saveProfile) {
                    // Async save via IPC (no await to avoid blocking UI)
                    window.electronAPI.saveProfile({ 
                        profileId: AppState.activeProfileId, 
                        contacts: profileContacts 
                    }).catch(e => console.warn('[saveCurrentProfileContacts] IPC save failed:', e));
                } else {
                    // Fallback localStorage con manejo de errores mejorado
                    try {
                        localStorage.setItem(`contactsData:${AppState.activeProfileId}`, JSON.stringify(profileContacts));
                    } catch (storageError) {
                        console.warn('[saveCurrentProfileContacts] localStorage lleno, omitiendo guardado automático');
                        // No intentar limpiar aquí para evitar interferir con el flujo normal
                    }
                }
                
                console.log(`[saveCurrentProfileContacts] Guardados ${profileContacts.length} contactos del perfil ${AppState.activeProfileId}`);
            } catch (error) {
                console.warn('[saveCurrentProfileContacts] Error:', error);
            }
        }

        function savePreferences(force = false) {
            if (force) {
                if (preferencesSaveTimer) {
                    clearTimeout(preferencesSaveTimer);
                    preferencesSaveTimer = null;
                }
                persistPreferencesNow();
                return;
            }
            if (preferencesSaveTimer) clearTimeout(preferencesSaveTimer);
            preferencesSaveTimer = setTimeout(() => {
                preferencesSaveTimer = null;
                persistPreferencesNow();
            }, 700);
        }

        function hashControlPassword(raw) {
            const value = String(raw || '');
            const seed = String.fromCharCode(110, 101, 120, 111, 45, 99, 111, 110, 116, 114, 111, 108, 45, 115, 97, 108, 116);
            let hash = 0;
            const merged = `${seed}:${value}`;
            for (let i = 0; i < merged.length; i++) {
                hash = ((hash << 5) - hash) + merged.charCodeAt(i);
                hash |= 0;
            }
            return `nexo-${Math.abs(hash).toString(36)}`;
        }

        function getDefaultControlPasswordHash() {
            return '';
        }

        function verifyControlPassword(rawPassword) {
            const currentHash = AppState.controlPasswordHash || getDefaultControlPasswordHash();
            if (!currentHash) return false;
            return hashControlPassword(rawPassword) === currentHash;
        }

        function buildWhatsAppMessage(contactName) {
            const base = (AppState.whatsappTemplate || '').trim();
            return base.replaceAll('{usuario}', contactName || '');
        }

        function isSystemThemeId(themeId) {
            return Object.prototype.hasOwnProperty.call(getDefaultThemes(), String(themeId || ''));
        }

        function getDefaultThemes() {
            return {
                'whaticket-blue': { id: 'whaticket-blue', name: 'Azul Whaticket', desc: 'Apariencia profesional y limpia', primary: '#6ea8ff', accent: '#f49ab0', bg: '#1f2d46', surface: '#2b3a54', text: '#ecf2ff' },
                'forest-green': { id: 'forest-green', name: 'Verde Bosque', desc: 'Naturaleza relajante', primary: '#61c554', accent: '#eab308', bg: '#1b351f', surface: '#25492a', text: '#eef8ee' },
                'ocean-green': { id: 'ocean-green', name: 'Verde Océano', desc: 'Verde azulado fresco', primary: '#2dd4bf', accent: '#f38ba8', bg: '#153443', surface: '#1d4556', text: '#e8fbff' },
                'sunset-orange': { id: 'sunset-orange', name: 'Naranja Atardecer', desc: 'Naranja cálido y dorado', primary: '#f59e0b', accent: '#f472b6', bg: '#3a230f', surface: '#4b2d12', text: '#fff4e8' },
                'night-purple': { id: 'night-purple', name: 'Púrpura Nocturno', desc: 'Violeta elegante con cian', primary: '#a855f7', accent: '#22d3ee', bg: '#28173f', surface: '#352050', text: '#f4ecff' },
                'rose-pink': { id: 'rose-pink', name: 'Rosa Rosado', desc: 'Sutil y marketinero', primary: '#f72585', accent: '#fb923c', bg: '#3b1830', surface: '#4a1f3b', text: '#ffeaf5' },
                'cosmic': { id: 'cosmic', name: 'Cósmico', desc: 'Espacio profundo con neón', primary: '#7c83ff', accent: '#ff7aa2', bg: '#0a1024', surface: '#141e3d', text: '#e8edff' }
            };
        }

        function hexToRgb(hex) {
            const raw = String(hex || '').replace('#', '');
            if (!raw || (raw.length !== 3 && raw.length !== 6)) return { r: 59, g: 130, b: 246 };
            const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
            const num = parseInt(full, 16);
            return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
        }

        function applyTheme(themeId) {
            const theme = (AppState.themeCatalog || {})[themeId];
            if (!theme) return;
            const root = document.documentElement;
            const pr = hexToRgb(theme.primary);
            root.style.setProperty('--accent-primary', theme.primary);
            root.style.setProperty('--accent-secondary', theme.accent);
            root.style.setProperty('--accent-success', theme.accent);
            root.style.setProperty('--bg-primary', AppState.lightMode ? '#eef2f8' : theme.bg);
            root.style.setProperty('--bg-secondary', AppState.lightMode ? '#f7f9fc' : theme.surface);
            root.style.setProperty('--bg-card', AppState.lightMode ? '#dfe8f3' : theme.surface);
            root.style.setProperty('--text-primary', AppState.lightMode ? '#1e293b' : theme.text);
            root.style.setProperty('--text-secondary', AppState.lightMode ? '#475569' : '#cbd5e1');
            root.style.setProperty('--border-color', AppState.lightMode ? '#b8c6db' : 'rgba(148,163,184,.35)');
            root.style.setProperty('--hover-color', AppState.lightMode ? '#cfdcee' : '#475569');
            root.style.setProperty('--selection-bg', `rgba(${pr.r}, ${pr.g}, ${pr.b}, ${AppState.lightMode ? '0.18' : '0.2'})`);
            document.body.classList.toggle('light-mode', !!AppState.lightMode);
            AppState.activeThemeId = themeId;
            savePreferences();
        }

        function renderThemeCards() {
            if (!elements.themeCards) return;
            const cards = Object.values(AppState.themeCatalog || {}).map((t) => {
                const active = t.id === AppState.activeThemeId;
                const custom = !isSystemThemeId(t.id);
                return `<button class="metrics-card" style="text-align:left;cursor:pointer;${active ? 'outline:2px solid var(--accent-primary);' : ''}" data-theme-id="${t.id}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;"><div><div class="k" style="font-weight:700;color:var(--text-primary)">${t.name}</div><div class="k" style="margin-top:4px;min-height:32px;">${t.desc || ''}</div></div>${custom ? `<div style="display:flex;gap:6px;flex-wrap:wrap;"><span class="btn" data-theme-rename="${t.id}" style="padding:4px 8px;font-size:.72rem;">Renombrar</span><span class="btn btn-danger" data-theme-delete="${t.id}" style="padding:4px 8px;font-size:.72rem;">Borrar</span></div>` : ''}</div><div style="display:flex;gap:6px;margin-top:8px;"><span style="width:18px;height:18px;border-radius:4px;background:${t.primary}"></span><span style="width:18px;height:18px;border-radius:4px;background:${t.accent}"></span><span style="width:18px;height:18px;border-radius:4px;background:${t.bg}"></span><span style="width:18px;height:18px;border-radius:4px;background:${t.surface}"></span></div></button>`;
            }).join('');
            elements.themeCards.innerHTML = cards || '<div style="color:var(--text-secondary)">Sin temas</div>';
            elements.themeCards.querySelectorAll('[data-theme-id]').forEach((btn) => {
                btn.onclick = () => {
                    applyTheme(btn.getAttribute('data-theme-id'));
                    renderThemeCards();
                };
            });
            elements.themeCards.querySelectorAll('[data-theme-rename]').forEach((btn) => {
                btn.onclick = (ev) => {
                    ev.stopPropagation();
                    const id = btn.getAttribute('data-theme-rename');
                    const theme = (AppState.themeCatalog || {})[id];
                    if (!theme || isSystemThemeId(id)) return;
                    const nextName = String(window.prompt('Nuevo nombre del tema personalizado', theme.name || '') || '').trim();
                    if (!nextName) return;
                    theme.name = nextName.slice(0, 60);
                    savePreferences();
                    renderThemeCards();
                    showNotification('Tema renombrado', 'success');
                };
            });
            elements.themeCards.querySelectorAll('[data-theme-delete]').forEach((btn) => {
                btn.onclick = (ev) => {
                    ev.stopPropagation();
                    const id = btn.getAttribute('data-theme-delete');
                    if (!id || isSystemThemeId(id)) return;
                    if (!confirm('¿Eliminar tema personalizado?')) return;
                    delete AppState.themeCatalog[id];
                    if (AppState.activeThemeId === id) {
                        AppState.activeThemeId = 'whaticket-blue';
                        applyTheme(AppState.activeThemeId);
                    }
                    savePreferences();
                    renderThemeCards();
                    showNotification('Tema eliminado', 'info');
                };
            });
        }

        function inferShiftFromDateParts(dateObj) {
            const h = dateObj.getHours();
            if (h >= 6 && h < 14) return 'tm';
            if (h >= 14 && h < 22) return 'tt';
            return 'tn';
        }

        function normalizeSelectionType(raw) {
            const val = String(raw || '').toLowerCase();
            if (val.includes('ops')) return 'ops';
            if (val.includes('bulk') || val.includes('masiv')) return 'bulk';
            if (val.includes('import')) return 'import';
            return 'manual';
        }

        function recordMetricEvent(type, payload = {}) {
            const at = payload.at || new Date().toISOString();
            const dateObj = new Date(at);
            const event = {
                id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
                type,
                at,
                profileId: payload.profileId || AppState.activeProfileId || 'default',
                shift: payload.shift || inferShiftFromDateParts(dateObj),
                status: payload.status || '',
                from: payload.from || '',
                to: payload.to || '',
                selectionType: normalizeSelectionType(payload.selectionType || payload.source || type),
                contactId: payload.contactId || null
            };
            AppState.metricEvents.unshift(event);
            if (AppState.metricEvents.length > 30000) AppState.metricEvents = AppState.metricEvents.slice(0, 30000);
            savePreferences();
        }

        function drawDonut(canvas, entries, colors) {
            if (!canvas || !canvas.getContext) return;
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.parentElement?.getBoundingClientRect() || { width: 280, height: 200 };
            const cssW = Math.max(240, Math.floor(rect.width));
            const cssH = Math.max(180, 200);
            canvas.width = cssW * dpr;
            canvas.height = cssH * dpr;
            canvas.style.width = cssW + 'px';
            canvas.style.height = cssH + 'px';
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, cssW, cssH);
            const total = entries.reduce((a, b) => a + b.value, 0);
            if (!total) { ctx.fillStyle = '#94a3b8'; ctx.font = '13px sans-serif'; ctx.fillText('Sin datos', 12, 24); return; }
            let start = -Math.PI / 2;
            const cx = 80, cy = cssH / 2, r = Math.min(70, cssH / 2 - 10);
            const innerR = r * 0.52;
            entries.forEach((entry, idx) => {
                const angle = (entry.value / total) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(start) * innerR, cy + Math.sin(start) * innerR);
                ctx.arc(cx, cy, r, start, start + angle);
                ctx.arc(cx, cy, innerR, start + angle, start, true);
                ctx.closePath();
                ctx.fillStyle = colors[idx % colors.length];
                ctx.fill();
                start += angle;
            });
            // Center total
            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(String(total), cx, cy + 2);
            ctx.font = '10px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('total', cx, cy + 15);
            ctx.textAlign = 'left';
            // Legend on the right
            const legendX = cx + r + 20;
            const availableWidth = cssW - legendX - 10;
            const legendStartY = Math.max(14, cy - entries.slice(0, 6).length * 11);
            ctx.font = '11px sans-serif';
            entries.slice(0, 6).forEach((entry, idx) => {
                const y = legendStartY + idx * 20;
                ctx.fillStyle = colors[idx % colors.length];
                ctx.beginPath();
                ctx.arc(legendX, y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#e2e8f0';
                const pct = Math.round((entry.value / total) * 100);
                // Smart text wrapping for long labels
                let label = entry.label;
                const maxChars = Math.floor(availableWidth / 6.5); // Approximate chars that fit
                if (label.length > maxChars) {
                    label = label.slice(0, maxChars - 1) + '…';
                }
                ctx.fillText(`${label} ${pct}%`, legendX + 10, y + 3);
                // Value on next line if label is long
                if (entry.label.length > 12) {
                    ctx.fillStyle = '#94a3b8';
                    ctx.font = '10px sans-serif';
                    ctx.fillText(`(${entry.value})`, legendX + 10, y + 14);
                    ctx.font = '11px sans-serif';
                } else {
                    ctx.fillText(` (${entry.value})`, legendX + 10 + ctx.measureText(`${label} ${pct}%`).width, y + 3);
                }
            });
        }

        function drawBars(canvas, entries, color = '#3b82f6') {
            if (!canvas || !canvas.getContext) return;
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.parentElement?.getBoundingClientRect() || { width: 500, height: 200 };
            const visibleEntries = entries.slice(0, 10);
            const barH = 22;
            const gap = 6;
            const cssW = Math.max(300, Math.floor(rect.width));
            const cssH = Math.max(120, visibleEntries.length * (barH + gap) + 20);
            canvas.width = cssW * dpr;
            canvas.height = cssH * dpr;
            canvas.style.width = cssW + 'px';
            canvas.style.height = cssH + 'px';
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, cssW, cssH);
            if (!visibleEntries.length) { ctx.fillStyle = '#94a3b8'; ctx.font = '13px sans-serif'; ctx.fillText('Sin datos', 12, 24); return; }
            const max = Math.max(1, ...visibleEntries.map(e => e.value));
            const labelW = 120;
            const barAreaW = cssW - labelW - 60;
            const gradColors = ['#3b82f6', '#10b981'];
            visibleEntries.forEach((entry, idx) => {
                const y = 8 + idx * (barH + gap);
                const bw = Math.max(4, Math.round((entry.value / max) * barAreaW));
                // Label
                ctx.fillStyle = '#e2e8f0';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'right';
                const label = entry.label.length > 16 ? entry.label.slice(0, 15) + '…' : entry.label;
                ctx.fillText(label, labelW - 8, y + barH / 2 + 4);
                // Bar
                const grad = ctx.createLinearGradient(labelW, y, labelW + bw, y);
                grad.addColorStop(0, gradColors[0]);
                grad.addColorStop(1, gradColors[1]);
                ctx.fillStyle = grad;
                const radius = 4;
                ctx.beginPath();
                ctx.moveTo(labelW + radius, y);
                ctx.lineTo(labelW + bw - radius, y);
                ctx.quadraticCurveTo(labelW + bw, y, labelW + bw, y + radius);
                ctx.lineTo(labelW + bw, y + barH - radius);
                ctx.quadraticCurveTo(labelW + bw, y + barH, labelW + bw - radius, y + barH);
                ctx.lineTo(labelW + radius, y + barH);
                ctx.quadraticCurveTo(labelW, y + barH, labelW, y + barH - radius);
                ctx.lineTo(labelW, y + radius);
                ctx.quadraticCurveTo(labelW, y, labelW + radius, y);
                ctx.closePath();
                ctx.fill();
                // Value
                ctx.fillStyle = '#94a3b8';
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(String(entry.value), labelW + bw + 6, y + barH / 2 + 4);
            });
            ctx.textAlign = 'left';
        }

        function getDuplicateReason(group) {
            if (group.type === 'teléfono') return 'Mismo teléfono';
            if (group.type === 'nombre') return 'Nombre coincidente';
            return 'Coincidencia múltiple';
        }

        function renderDuplicatePreview(group) {
            let result = { ...group.contacts[0] };
            for (let i = 1; i < group.contacts.length; i++) {
                result = mergeContact(result, group.contacts[i]);
            }
            return `${result.name || '-'} | ${result.phone || 'Sin teléfono'} | ${result.status || 'sin revisar'} | ${result.origin || '-'}`;
        }

        window.openWhatsApp = async (phone, event) => {
            if (event) event.stopPropagation();
            if (!phone) {
                showNotification('Este contacto no tiene teléfono', 'error');
                return;
            }
            const normalized = normalizePhoneToE164(phone);
            if (!normalized) {
                showNotification('Teléfono inválido', 'error');
                return;
            }
            const contact = AppState.contacts.find(c => normalizePhoneToE164(c.phone) === normalized);
            const message = buildWhatsAppMessage(contact?.name || '');
            const waMe = `https://wa.me/${normalized}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
            const fallback = `https://api.whatsapp.com/send?phone=${normalized}${message ? `&text=${encodeURIComponent(message)}` : ''}`;
            try {
                if (window.electronAPI && window.electronAPI.openExternal) {
                    await window.electronAPI.openExternal(waMe);
                } else {
                    window.open(waMe, '_blank');
                }
            } catch (_) {
                await window.electronAPI.openExternal(fallback);
            }
            if (contact) {
                const eventAt = contact.lastMessageSentAt || new Date().toISOString();
                const currentStatus = contact.status || 'Sin Estado';
                contact.lastMessageSentAt = eventAt;
                touchContactEdit(contact, 'whatsapp_open');
                if (window.nexoStore?.queueDelta) {
                    window.nexoStore.queueDelta({
                        type: 'contact-touch',
                        id: contact.id,
                        status: currentStatus,
                        lastMessageSentAt: eventAt,
                        lastEditReason: 'whatsapp_open',
                        lastEditedAt: contact.lastEditedAt || eventAt,
                        lastUpdated: contact.lastUpdated || eventAt
                    }).catch(() => {});
                    scheduleStatusDeltaFlush('whatsapp-open');
                }
                saveData(false, { deltaOnly: true });
                render();
            }
            addToHistory('WhatsApp abierto', `${contact?.name || normalized}`);
            saveHistory();
        };

        window.openCardStatusMenu = (id, event) => {
            if (event) event.stopPropagation();
            const contact = AppState.searchIndex?.byId?.get(id) || AppState.contacts.find(c => c.id === id);
            const container = document.getElementById(`cardStatusInline-${id}`);
            if (!contact || !container) return;

            const existingMenu = container.querySelector('.card-status-menu');
            if (existingMenu) {
                existingMenu.remove();
                return;
            }

            $$('.card-status-menu').forEach(menu => menu.remove());

            const menu = document.createElement('div');
            menu.className = 'card-status-menu';
            menu.onclick = (e) => e.stopPropagation();
            menu.innerHTML = STATUS_OPTIONS.map(opt => `
                <button class="card-status-option ${opt.id === contact.status ? 'active' : ''}" data-status="${opt.id}">
                    <i class="fas ${opt.icon}" style="color:${opt.color}"></i>
                    <span>${opt.label}</span>
                </button>
            `).join('');

            menu.querySelectorAll('.card-status-option').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const next = btn.dataset.status;
                    if (next !== contact.status) {
                        const old = contact.status;
                        contact.status = next;
                        updateCompetitionCredit(contact, next, 'common');
                        setReviewMetadata(contact, next);
                        touchContactEdit(contact, 'inline_status');
                        AppState.lastEditedContact = id;
                        addToHistory('Estado cambiado', `${contact.name}: ${old} → ${next}`);
                        saveData();
                    }
                    menu.remove();
                    render();
                };
            });

            container.appendChild(menu);

            setTimeout(() => {
                const closeMenu = (evt) => {
                    if (!container.contains(evt.target)) menu.remove();
                    document.removeEventListener('click', closeMenu, true);
                };
                document.addEventListener('click', closeMenu, true);
            }, 0);
        };

        function updateBulkActionsBar() {
            if (AppState.selectedContacts.size > 0) {
                elements.bulkActionsBar.classList.add('active');
                elements.selectedCount.textContent = AppState.selectedContacts.size;
            } else {
                elements.bulkActionsBar.classList.remove('active');
            }
        }

        function renderNow() {
            const renderStartAt = performance.now();
            const isShiftsView = AppState.currentView === 'shifts';
            elements.mainApp.classList.toggle('shifts-mode', isShiftsView);

            if (isShiftsView) {
                updateStats();
                elements.pagination.style.display = 'none';
                elements.cardsView.style.display = 'none';
                elements.listView.style.display = 'none';
                renderShiftsView();
                updateBulkActionsBar();
                updateOpsUploadReminder();
                return;
            }

            elements.quickReview.style.display = 'none';
            AppState.activeShift = null;
            if (AppState.searchIndexDirty || !AppState.searchIndex?.byId || AppState.searchIndex.byId.size !== AppState.contacts.length) rebuildSearchIndex();
            applyFilters();
            AppState.filteredContacts.sort((a, b) => {
                if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
                if (!!a.phoneAlert !== !!b.phoneAlert) return a.phoneAlert ? 1 : -1;
                if (AppState.opsFilter === 'top50' || AppState.opsFilter === 'top100') return (b.ops?.score || 0) - (a.ops?.score || 0);
                buildContactDerivedFields(a);
                buildContactDerivedFields(b);
                return (a._nameKey || '').localeCompare(b._nameKey || '');
            });
            const shouldRefreshStats = AppState.statsDirty || (Date.now() - (AppState.lastStatsAt || 0) > 1200);
            if (shouldRefreshStats) {
                withPerfStage('stats', () => updateStats());
                AppState.lastStatsAt = Date.now();
                AppState.statsDirty = false;
            }
            document.body.classList.toggle('perf-large', (AppState.filteredContacts?.length || 0) > 5000 || (AppState.contacts?.length || 0) > 5000);
            elements.pagination.style.display = 'flex';
            elements.shiftsView.style.display = 'none';
            renderPaginatedView(AppState.currentView === 'cards' ? createCard : createListItem);
            updateBulkActionsBar();
            updateOpsUploadReminder();
            AppState.perfStats.renderMs = Math.round(performance.now() - renderStartAt);
            if (AppState.perfDebug) console.log('[perf] filterMs=', AppState.perfStats.filterMs, 'renderMs=', AppState.perfStats.renderMs, 'renderContactsMs=', AppState.perfStats.renderContactsMs, 'saveMs=', AppState.perfStats.saveMs, 'dom=', AppState.perfStats.domItems);
            updatePerfPanel();
        }

        function render(force = false) {
            if (force) {
                AppState.renderQueued = false;
                renderNow();
                return;
            }
            if (AppState.renderQueued) return;
            AppState.renderQueued = true;
            const runRender = () => {
                AppState.renderQueued = false;
                renderNow();
            };
            if ((AppState.contacts?.length || 0) > 12000 && typeof requestIdleCallback === 'function') {
                requestIdleCallback(() => runRender(), { timeout: 120 });
                return;
            }
            requestAnimationFrame(() => runRender());
        }

        function showDuplicatesModal() {
            const duplicates = detectDuplicates();
            
            if (duplicates.length === 0) {
                $('#duplicatesContent').innerHTML = '<p style="color: var(--accent-success); text-align: center; padding: 30px;">✅ No se encontraron duplicados</p>';
                $('#mergeAllDuplicates').style.display = 'none';
            } else {
                let html = `<div class="duplicates-list">`;
                duplicates.forEach((group, groupIndex) => {
                    html += `<div class="duplicate-group">`;
                    html += `<div class="duplicate-group-header">
                        <span>📋 ${group.name} (${group.contacts.length} entradas - ${group.type})</span><span style="font-size:0.78rem;color:var(--text-secondary);">${getDuplicateReason(group)}</span>
                    </div>`;
                    
                    group.contacts.forEach((contact, contactIndex) => {
                        const isRecommended = contactIndex === 0; // El primero es el recomendado por defecto
                        html += `<div class="duplicate-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; ${isRecommended ? 'border: 2px solid var(--accent-primary);' : ''}">
                            <div style="flex: 1;">
                                <strong>${contact.name}</strong>
                                <div class="duplicate-item-detail">
                                    📞 ${contact.phone || 'Sin teléfono'} | 
                                    📍 ${contact.origin} | 
                                    🔵 <span class="status-badge status-${contact.status.replace(/ /g, '-')}">${contact.status}</span>
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                ${isRecommended ? '<span style="color: var(--accent-primary); font-size: 0.8rem; font-weight: 600;">RECOMENDADO</span>' : ''}
                                <button class="btn" style="padding: 6px 12px; font-size: 0.8rem;" onclick="selectDuplicateToKeep(${groupIndex}, ${contactIndex})" title="Mantener este">
                                    <i class="fas fa-check"></i> Elegir
                                </button>
                            </div>
                        </div>`;
                    });
                    html += `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                        <button class="btn btn-success" style="padding:6px 10px;font-size:0.8rem;" onclick="combineDuplicateGroup(${groupIndex})"><i class="fas fa-object-group"></i> Combinar</button>
                        <span style="font-size:0.78rem;color:var(--text-secondary);"><strong>Preview:</strong> ${renderDuplicatePreview(group)}</span>
                    </div></div>`;
                });
                html += `</div>`;
                const totalEntries = duplicates.reduce((acc, g) => acc + g.contacts.length, 0);
                html += `<p style="color: var(--accent-warning); margin-top: 15px; text-align: center;">
                    Se encontraron ${duplicates.length} grupos duplicados con ${totalEntries} entradas totales
                </p>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 10px; text-align: center;">
                    <strong>Criterio de fusión automática:</strong> jugando > contactado > sin wsp > sin revisar > no interesado
                </p>
                <div class="duplicates-config">
                    <label><input type="radio" name="dupMergeMode" value="phone-auto" ${AppState.duplicateMergeMode === 'phone-auto' ? 'checked' : ''}> Si coincide teléfono: merge seguro. Si coincide nombre: pedir confirmación.</label>
                    <label><input type="radio" name="dupMergeMode" value="always-ask" ${AppState.duplicateMergeMode === 'always-ask' ? 'checked' : ''}> Pedir confirmación para todos los grupos.</label>
                </div>`;
                
                $('#duplicatesContent').innerHTML = html;
                $('#mergeAllDuplicates').style.display = 'block';
            }
            
            $('#duplicatesModal').classList.add('active');
        }
        
        window.selectDuplicateToKeep = (groupIndex, contactIndex) => {
            const group = AppState.duplicates[groupIndex];
            if (!group) return;
            
            const selectedContact = group.contacts[contactIndex];
            const contactsToRemove = group.contacts.filter((c, i) => i !== contactIndex);
            
            const idsToRemove = contactsToRemove.map(c => c.id);
            AppState.contacts = AppState.contacts.filter(c => !idsToRemove.includes(c.id));
            
            addToHistory('Duplicado resuelto manualmente', `${selectedContact.name} - mantenido, ${contactsToRemove.length} eliminados`);
            saveData();
            render();
            showDuplicatesModal();
            showNotification(`✅ Duplicados resueltos para ${selectedContact.name}`, 'success');
        };

        window.combineDuplicateGroup = (groupIndex) => {
            const group = AppState.duplicates[groupIndex];
            if (!group || group.contacts.length < 2) return;
            const preview = renderDuplicatePreview(group);
            const needsConfirm = AppState.duplicateMergeMode === 'always-ask' || group.type === 'nombre';
            if (needsConfirm && !confirm(`Combinar este grupo?\nResultado estimado:\n${preview}`)) return;

            let masterContact = { ...group.contacts[0] };
            for (let i = 1; i < group.contacts.length; i++) {
                masterContact = mergeContact(masterContact, group.contacts[i]);
            }
            const idsToRemove = group.contacts.map(c => c.id);
            AppState.contacts = AppState.contacts.filter(c => !idsToRemove.includes(c.id));
            AppState.contacts.push(masterContact);
            addToHistory('Duplicado combinado', `${group.name} -> ${masterContact.name}`);
            saveData();
            render();
            showDuplicatesModal();
            showNotification('Grupo combinado correctamente', 'success');
        };

        function mergeAllDuplicates() {
            const duplicates = AppState.duplicates;
            let mergedCount = 0;
            
            duplicates.forEach(group => {
                if (group.contacts.length > 1) {
                    const needsConfirm = AppState.duplicateMergeMode === 'always-ask' || (AppState.duplicateMergeMode === 'phone-auto' && group.type === 'nombre');
                    if (needsConfirm && !confirm(`Confirmar fusión para grupo: ${group.name}`)) return;
                    let masterContact = { ...group.contacts[0] };
                    
                    for (let i = 1; i < group.contacts.length; i++) {
                        masterContact = mergeContact(masterContact, group.contacts[i]);
                    }
                    
                    const idsToRemove = group.contacts.map(c => c.id);
                    AppState.contacts = AppState.contacts.filter(c => !idsToRemove.includes(c.id));
                    AppState.contacts.push(masterContact);
                    
                    mergedCount += group.contacts.length - 1;
                }
            });
            
            addToHistory('Duplicados fusionados', `${mergedCount} duplicados fusionados`);
            saveData();
            render();
            $('#duplicatesModal').classList.remove('active');
            showNotification(`✅ ${mergedCount} duplicados fusionados`, 'success');
        }

        function extractHistoryName(details = '') {
            const [raw] = details.split(':');
            return (raw || '').trim();
        }

        function getHistoryContact(name = '') {
            if (!name) return null;
            return AppState.contacts.find(c => normalizeUsername(c.name) === normalizeUsername(name));
        }

        function goToHistoryContact(name, event) {
            if (event) event.stopPropagation();
            const contact = getHistoryContact(name);
            if (!contact) {
                showNotification('Contacto no disponible en la base actual', 'info');
                return;
            }
            elements.searchInput.value = contact.name;
            AppState.searchTerm = contact.name;
            AppState.lastEditedContact = contact.id;
            closeAllOverlays();
            render();
            showNotification(`🔎 Mostrando: ${contact.name}`, 'success');
        }

        window.searchFromHistory = (name, event) => {
            goToHistoryContact(name, event);
        };

        window.editFromHistory = (name, event) => {
            if (event) event.stopPropagation();
            const contact = getHistoryContact(name);
            if (!contact) {
                showNotification('No se pudo abrir el editor: contacto no encontrado', 'error');
                return;
            }
            editContactField(contact.id, 'name');
        };

        window.openContactHistoryByName = (name, event) => {
            if (event) event.stopPropagation();
            const contact = getHistoryContact(name);
            if (!contact) {
                showNotification('No se encontró historial del usuario', 'warning');
                return;
            }
            openContactHistory(contact.id);
        };

        window.openContactHistory = (contactId, event) => {
            if (event) event.stopPropagation();
            const contact = AppState.contacts.find(c => c.id === contactId);
            if (!contact) {
                showNotification('Contacto no encontrado', 'warning');
                return;
            }
            const timeline = Array.isArray(contact.timeline) ? contact.timeline : [];
            const html = timeline.length ? timeline.map(item => `
                <div class="history-item">
                    <div class="history-time">${new Date(item.timestamp).toLocaleString('es-ES')}</div>
                    <div class="history-action"><strong>${item.action}:</strong> ${item.details}</div>
                </div>
            `).join('') : '<p style="text-align:center;color:var(--text-secondary);padding:24px;">Sin historial específico para este usuario.</p>';
            if (elements.contactHistoryMeta) {
                elements.contactHistoryMeta.textContent = `${contact.name} · ${timeline.length} evento(s)`;
            }
            if (elements.contactHistoryList) elements.contactHistoryList.innerHTML = html;
            if (elements.contactHistoryModal) elements.contactHistoryModal.classList.add('active');
        };

        function renderHistoryList(filterTerm = '') {
            const term = normalizeUsername(filterTerm);
            const filtered = AppState.history.filter(entry => {
                if (!term) return true;
                return normalizeUsername(`${entry.action} ${entry.details}`).includes(term);
            });

            const historyHTML = filtered.length > 0
                ? filtered.map(entry => {
                    const userName = extractHistoryName(entry.details);
                    const contact = getHistoryContact(userName);

                    return `
                    <div class="history-item ${contact ? '' : 'history-item-muted'}">
                        <div class="history-time">${new Date(entry.timestamp).toLocaleString('es-ES')}</div>
                        <div class="history-action"><strong>${entry.action}:</strong> ${entry.details}</div><div class="history-item-muted">por: ${entry.actor || 'PC local'}</div>
                        <div class="history-item-actions">
                            <button class="btn" onclick="searchFromHistory('${userName.replace(/'/g, "\\'")}', event)"><i class="fas fa-search"></i> Ver</button>
                            <button class="btn" onclick="editFromHistory('${userName.replace(/'/g, "\\'")}', event)" ${contact ? '' : 'disabled'}><i class="fas fa-pen"></i> Editar</button>
                            <button class="btn" onclick="openContactHistoryByName('${userName.replace(/'/g, "\\'")}', event)" ${contact ? '' : 'disabled'}><i class="fas fa-id-card"></i> Historial</button>
                        </div>
                    </div>
                `;
                }).join('')
                : '<p style="text-align: center; color: var(--text-secondary); padding: 30px;">No hay historial para ese filtro.</p>';

            $('#historyList').innerHTML = historyHTML;
            const label = $('#historyCountLabel');
            if (label) label.textContent = `${filtered.length} evento(s)`;
        }

        function showHistoryModal() {
            renderHistoryList('');
            const historySearchInput = $('#historySearchInput');
            if (historySearchInput) {
                historySearchInput.value = '';
                historySearchInput.oninput = (e) => renderHistoryList(e.target.value);
            }
            $('#historyModal').classList.add('active');
        }

        function closeAllOverlays() {
            const addSingleWasOpen = $('#addSingleModal')?.classList.contains('active');
            $$('.modal.active').forEach(modal => modal.classList.remove('active'));
            $$('.card-status-menu').forEach(menu => menu.remove());
            if (addSingleWasOpen) resetAddSingleModalState();
        }

        function openAddSingleModalForCreate() {
            AppState.editingContactId = null;
            refreshOriginSuggestions();
            $('#singleName').value = '';
            $('#singlePhone').value = '';
            $('#singleOrigin').value = '';
            $('#singleStatus').value = 'sin revisar';
            $('#addSingleModal .modal-header').innerHTML = '<i class="fas fa-user-plus"></i> Agregar Contacto';
            $('#confirmAddSingle').innerHTML = '<i class="fas fa-check"></i> Agregar';
            $('#addSingleModal').classList.add('active');
        }

        function openAddSingleModalForEdit(contact, focusField = 'name') {
            if (!contact) return;
            refreshOriginSuggestions();
            AppState.editingContactId = contact.id;
            $('#singleName').value = contact.name || '';
            $('#singlePhone').value = contact.phone || '';
            $('#singleOrigin').value = contact.origin || '';
            $('#singleStatus').value = contact.status || 'sin revisar';
            $('#addSingleModal .modal-header').innerHTML = '<i class="fas fa-user-edit"></i> Editar Contacto';
            $('#confirmAddSingle').innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
            $('#addSingleModal').classList.add('active');
            const focusEl = focusField === 'phone' ? $('#singlePhone') : $('#singleName');
            if (focusEl) {
                focusEl.focus();
                focusEl.select();
            }
        }

        function resetAddSingleModalState() {
            AppState.editingContactId = null;
            $('#addSingleModal .modal-header').innerHTML = '<i class="fas fa-user-plus"></i> Agregar Contacto';
            $('#confirmAddSingle').innerHTML = '<i class="fas fa-check"></i> Agregar';
        }


        function setLoadingState(active, message = 'Cargando…', progress = null, cancelable = false) {
            if (!elements.appLoadingOverlay) return;
            elements.appLoadingOverlay.classList.toggle('active', !!active);
            if (elements.appLoadingText) elements.appLoadingText.textContent = message;
            if (elements.appLoadingProgress) elements.appLoadingProgress.style.width = `${Math.max(0, Math.min(100, progress ?? 0))}%`;
            if (elements.cancelImportBtn) elements.cancelImportBtn.style.display = cancelable ? 'inline-flex' : 'none';
            if (active) {
                const now = Date.now();
                if (now - lastLoadingPreviewAt > (AppState.perfDebug ? 900 : 350)) {
                    lastLoadingPreviewAt = now;
                    renderLoadingPreview();
                }
            }
        }

        function renderLoadingPreview() {
            if (!elements.loadingPreviewTrack) return;
            const previewLimit = AppState.perfDebug ? 20 : 60;
            const rows = (AppState.contacts || []).slice(0, previewLimit).map((c) => (
                `<div class="loading-preview-row"><div>${(c.name || 'Sin nombre').toString().replace(/</g, '&lt;')}</div><div>${(c.phone || '-').toString().replace(/</g, '&lt;')}</div><div>${(c.status || 'sin revisar').toString().replace(/</g, '&lt;')}</div></div>`
            )).join('');
            elements.loadingPreviewTrack.innerHTML = rows || '<div class="loading-preview-row"><div>Sin datos</div><div>-</div><div>sin revisar</div></div>';
        }

        function perfMark(label, fn) {
            if (!AppState.perfDebug) return fn();
            const tag = `[perf] ${label}`;
            console.time(tag);
            const result = fn();
            if (result && typeof result.then === 'function') {
                return result.finally(() => console.timeEnd(tag));
            }
            console.timeEnd(tag);
            return result;
        }

        function normalizePhoneToE164(raw) {
            const digits = String(raw || '').replace(/\D/g, '');
            if (!digits) return null;
            if (digits.startsWith('549') && digits.length >= 12) return digits;
            if (digits.startsWith('54') && digits.length >= 10) {
                if (digits[2] !== '9') return `549${digits.slice(2)}`;
                return digits;
            }
            if (digits.startsWith('0') && digits.length >= 10) {
                const noZero = digits.replace(/^0+/, '');
                return noZero.startsWith('9') ? `54${noZero}` : `549${noZero}`;
            }
            if (digits.length >= 10 && digits.length <= 11) return digits.startsWith('9') ? `54${digits}` : `549${digits}`;
            if (digits.length >= 8) return digits;
            return null;
        }

        function parseContactsInWorker(fileName, text, onProgress) {
            return new Promise((resolve, reject) => {
                const started = Date.now();
                let worker;
                try {
                    const workerUrl = new URL('./csv-worker.js', window.location.href);
                    worker = new Worker(workerUrl, { type: 'classic' });
                } catch (createErr) {
                    console.warn('[import] Worker URL fallback:', createErr);
                    try {
                        worker = new Worker('csv-worker.js');
                    } catch (fallbackErr) {
                        return reject(new Error(`No se pudo crear el worker de importación: ${fallbackErr?.message || fallbackErr}`));
                    }
                }

                worker.onmessage = (event) => {
                    const msg = event.data || {};
                    if (msg.type === 'progress') onProgress && onProgress(msg.payload || msg);
                    if (msg.type === 'done') {
                        worker.terminate();
                        console.info('[import] parse done', { ms: Date.now() - started, rows: (msg.contacts || []).length });
                        resolve(msg.contacts || []);
                    }
                    if (msg.type === 'error') {
                        worker.terminate();
                        reject(new Error(msg.message || 'No se pudo parsear archivo'));
                    }
                };
                worker.onerror = (error) => {
                    worker.terminate();
                    reject(new Error(`Worker error: ${error?.message || error}`));
                };
                console.info('[import] parse start', { fileName, bytes: String(text || '').length });
                worker.postMessage({ fileName, text });
            });
        }

        function setupEventListeners() {
            elements.uploadArea.onclick = () => {
                elements.fileInput.click();
            };
            elements.uploadArea.ondragover = (e) => { e.preventDefault(); elements.uploadArea.style.borderColor = 'var(--accent-primary)'; };
            elements.uploadArea.ondragleave = () => elements.uploadArea.style.borderColor = 'var(--border-color)';
            elements.uploadArea.ondrop = (e) => {
                e.preventDefault();
                elements.uploadArea.style.borderColor = 'var(--border-color)';
                const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.csv') || f.name.toLowerCase().endsWith('.vcf') || f.name.toLowerCase().endsWith('.json'));
                if (files.length > 0) {
                    selectedFiles.push(...files);
                    updateFileList();
                }
            };

            elements.fileInput.onchange = (e) => {
                selectedFiles = Array.from(e.target.files);
                updateFileList();
            };

            elements.startBtn.onclick = loadFiles;
            if (elements.storageMeter) {
                elements.storageMeter.onclick = async () => {
                    await refreshStorageDiagnostics();
                    const info = window.getStorageStatus();
                    showNotification(`📦 ${info}`, 'info');
                };
            }

            elements.addMoreBtn.onclick = () => {
                elements.uploadScreen.classList.remove('hidden');
                elements.fileInput.value = '';
                selectedFiles = [];
                elements.fileList.innerHTML = '';
                elements.startBtn.disabled = true;
            };
            elements.addSingleBtn.onclick = () => {
                openAddSingleModalForCreate();
            };
            elements.settingsBtn.onclick = () => {
                elements.userOptionsModal.classList.add('active');
            };
            if (elements.manageProfilesBtn) {
                elements.manageProfilesBtn.onclick = async () => {
                    await syncProfilesFromMain();
                    refreshProfilesUI();
                    elements.profilesModal && elements.profilesModal.classList.add('active');
                };
            }
            if (elements.profileSelect) {
                elements.profileSelect.onchange = (e) => {
                    AppState.activeProfileId = e.target.value || 'default';
                    localStorage.setItem('activeProfileId', AppState.activeProfileId);
                    render();
                };
            }
            if (elements.addProfileBtn) {
                elements.addProfileBtn.onclick = () => {
                    const name = (elements.newProfileName?.value || '').trim();
                    if (!name) {
                        showNotification('Escribí un nombre para el perfil', 'warning');
                        return;
                    }
                    const createdId = ensureProfileByName(name);
                    AppState.activeProfileId = createdId || AppState.activeProfileId;
                    localStorage.setItem('activeProfileId', AppState.activeProfileId);
                    if (elements.newProfileName) elements.newProfileName.value = '';
                    refreshProfilesUI();
                    render();
                    showNotification('Perfil creado y activado', 'success');
                };
            }
            if (elements.closeProfilesModal) elements.closeProfilesModal.onclick = () => elements.profilesModal && elements.profilesModal.classList.remove('active');
            // splitImportByFile toggle removed — import always goes to activeProfileId
            const hashPreviewShort = (value) => {
                if (!value) return '';
                const raw = String(value).trim();
                if (raw.length <= 16) return raw;
                return `${raw.slice(0, 10)}…${raw.slice(-6)}`;
            };

            const triggerUpdateCheck = async (from = 'principal') => {
                if (elements.updateStatusText) elements.updateStatusText.textContent = 'Estado: buscando…';
                if (elements.updateProgressFill) elements.updateProgressFill.style.width = '0%';
                showNotification(`Buscando actualizaciones (${from})…`, 'info');
                try {
                    await window.electronAPI.checkForUpdates();
                } catch (error) {
                    showNotification(`No se pudo comprobar actualizaciones: ${error?.message || error}`, 'error');
                }
            };
            if (elements.checkUpdatesBtn && window.electronAPI?.checkForUpdates) {
                elements.checkUpdatesBtn.onclick = async () => {
                    await triggerUpdateCheck('panel principal');
                };
            }
            if (elements.preStartCheckUpdatesBtn && window.electronAPI?.checkForUpdates) {
                elements.preStartCheckUpdatesBtn.onclick = async () => {
                    await triggerUpdateCheck('pantalla inicial');
                };
            }
            if (elements.perfDebugToggle) {
                elements.perfDebugToggle.checked = localStorage.getItem('perfDebugMode') === '1';
                AppState.perfDebug = elements.perfDebugToggle.checked;
                document.body.classList.toggle('perf-mode', AppState.perfDebug);
                elements.perfDebugToggle.onchange = (e) => {
                    AppState.perfDebug = !!e.target.checked;
                    document.body.classList.toggle('perf-mode', AppState.perfDebug);
                    localStorage.setItem('perfDebugMode', AppState.perfDebug ? '1' : '0');
                    showNotification(AppState.perfDebug ? 'Modo rendimiento activado: animaciones y efectos mínimos' : 'Modo rendimiento desactivado', 'info');
                    updatePerfPanel();
                };
                updatePerfPanel();
            }
            if (window.PerformanceObserver) {
                try {
                    const po = new PerformanceObserver((list) => {
                        const entries = list.getEntries() || [];
                        if (!entries.length) return;
                        AppState.perfStats.longTasks += entries.length;
                        const top = Array.isArray(AppState.perfStats.longTaskTop) ? AppState.perfStats.longTaskTop : [];
                        const stage = AppState.currentPerfStage || 'idle';
                        entries.forEach((e) => top.push({ name: `${stage}:${e.name || 'task'}`, duration: e.duration || 0 }));
                        top.sort((a, b) => (b.duration || 0) - (a.duration || 0));
                        AppState.perfStats.longTaskTop = top.slice(0, 8);
                        updatePerfPanel();
                    });
                    po.observe({ entryTypes: ['longtask'] });
                } catch (_) {}
            }
            if (elements.checkUpdatesOption && window.electronAPI?.checkForUpdates) {
                elements.checkUpdatesOption.onclick = async () => {
                    elements.updateStatusText.textContent = 'Estado: buscando…';
                    if (elements.updateProgressFill) elements.updateProgressFill.style.width = '0%';
                    showNotification('Buscando actualizaciones…', 'info');
                    await window.electronAPI.checkForUpdates();
                };
            }
            if (elements.restartUpdateOption && window.electronAPI?.installUpdate) {
                elements.restartUpdateOption.onclick = async () => {
                    showNotification('Preparando instalación de actualización…', 'info');
                    const firstTry = await window.electronAPI.installUpdate({ force: false });
                    if (firstTry?.ok) {
                        setTimeout(() => window.close(), 120);
                        return;
                    }
                    if (firstTry?.requiresForce) {
                        const agree = confirm(`⚠️ Update sospechosa. ${firstTry.message || ''}

¿Querés forzar igual la instalación?`);
                        if (!agree) return;
                        const forced = await window.electronAPI.installUpdate({ force: true });
                        if (forced?.ok) {
                            showNotification('Forzando instalación de actualización…', 'warning');
                            setTimeout(() => window.close(), 120);
                            return;
                        }
                        showNotification(forced?.message || 'No se pudo instalar actualización', 'error');
                        return;
                    }
                    showNotification(firstTry?.message || 'No se pudo instalar actualización', 'error');
                };
            }
            if (window.electronAPI?.onUpdaterStatus) {
                window.electronAPI.onUpdaterStatus((payload) => {
                    const status = payload?.status;
                    if (!status) return;
                    if (status === 'checking') {
                        elements.updateStatusText.textContent = 'Estado: comprobando…';
                        if (elements.updateProgressFill) elements.updateProgressFill.style.width = '0%';
                    }
                    if (status === 'available') {
                        elements.updateStatusText.textContent = payload.message || 'Descargando actualización…';
                        if (elements.updateProgressFill) elements.updateProgressFill.style.width = '5%';
                        showNotification(payload.message || 'Descargando actualización…', 'info');
                    }
                    if (status === 'download-progress') {
                        elements.updateStatusText.textContent = `Estado: descargando ${payload.percent || 0}%`;
                        if (elements.updateProgressFill) elements.updateProgressFill.style.width = `${payload.percent || 0}%`;
                    }
                    if (status === 'not-available') {
                        elements.updateStatusText.textContent = payload.message || 'Estás en la última versión';
                        if (elements.updateProgressFill) elements.updateProgressFill.style.width = '100%';
                        showNotification(payload.message || 'Estás en la última versión', 'success');
                    }
                    if (status === 'suspicious-update') {
                        const issueHash = hashPreviewShort(payload.downloadedSha512 || payload.expectedSha512);
                        elements.updateStatusText.textContent = `${payload.message || 'Update sospechosa detectada'}${issueHash ? ` (hash ${issueHash})` : ''}`;
                        if (elements.updateProgressFill) elements.updateProgressFill.style.width = '100%';
                        elements.restartUpdateOption.style.display = 'flex';
                        const titleEl = elements.restartUpdateOption.querySelector('.export-option-title');
                        const descEl = elements.restartUpdateOption.querySelector('.export-option-desc');
                        if (titleEl) titleEl.textContent = 'Forzar actualización';
                        if (descEl) descEl.textContent = 'Instalar bajo tu responsabilidad';
                        showNotification(payload.message || 'Update sospechosa detectada', 'warning');
                    }
                    if (status === 'downloaded') {
                        const updateHash = hashPreviewShort(payload.downloadedSha512 || payload.expectedSha512);
                        const hashSummary = updateHash ? ` · hash ${updateHash}` : '';
                        elements.updateStatusText.textContent = `${payload.message || 'Actualización lista. Reiniciar ahora'}${hashSummary}`;
                        if (elements.updateProgressFill) elements.updateProgressFill.style.width = '100%';
                        elements.restartUpdateOption.style.display = 'flex';
                        const titleEl = elements.restartUpdateOption.querySelector('.export-option-title');
                        const descEl = elements.restartUpdateOption.querySelector('.export-option-desc');
                        if (titleEl) titleEl.textContent = 'Reiniciar y actualizar';
                        if (descEl) descEl.textContent = 'Cerrar e instalar actualización';
                        showNotification(payload.message || 'Actualización lista. Reiniciar ahora', 'success');
                    }
                    if (status === 'error') {
                        const raw = String(payload.message || '');
                        const hasNoUpdateMessage = /no tiene una versión mayor|ya estás en la última versión|no hay una actualización nueva/i.test(raw);
                        const friendly = hasNoUpdateMessage
                            ? 'No hay una actualización nueva disponible en este momento.'
                            : (payload.message || 'Error de actualización');
                        elements.updateStatusText.textContent = friendly;
                        if (elements.updateProgressFill) elements.updateProgressFill.style.width = '0%';
                        showNotification(friendly, /No hay una actualización nueva/.test(friendly) ? 'info' : 'error');
                    }
                });
            }
            if (elements.cancelImportBtn) {
                elements.cancelImportBtn.onclick = () => {
                    AppState.importCancelRequested = true;
                    showNotification('Cancelando importación…', 'warning');
                };
            }
            if (elements.importOpsBtn) {
                elements.importOpsBtn.onclick = () => elements.opsFileInput && elements.opsFileInput.click();
            }
            if (elements.opsFileInput) {
                elements.opsFileInput.onchange = (e) => {
                    const file = e.target.files && e.target.files[0];
                    importOperationsFile(file);
                    elements.opsFileInput.value = '';
                };
            }
            $('#openShortcutsOption').onclick = () => {
                elements.userOptionsModal.classList.remove('active');
                elements.shortcutsModal.classList.add('active');
            };
            $('#openWhatsappMessageOption').onclick = () => {
                elements.userOptionsModal.classList.remove('active');
                elements.whatsappMessageModal.classList.add('active');
                elements.whatsappTemplateInput.value = AppState.whatsappTemplate;
            };
            if (elements.openGithubReleasesOption) {
                elements.openGithubReleasesOption.onclick = async () => {
                    const url = 'https://github.com/zhinouno-ui/nexo-desktop/releases/latest';
                    try {
                        if (window.electronAPI?.openExternal) await window.electronAPI.openExternal(url);
                        else window.open(url, '_blank');
                    } catch (e) {
                        showNotification('No se pudo abrir GitHub Releases', 'error');
                    }
                };
            }

            if (elements.openStable110Option) {
                elements.openStable110Option.onclick = async () => {
                    const url = 'https://github.com/zhinouno-ui/nexo-desktop/releases/tag/v1.1.10';
                    try {
                        if (window.electronAPI?.openExternal) await window.electronAPI.openExternal(url);
                        else window.open(url, '_blank');
                    } catch (e) {
                        reportError('openStable110Option', e, { url });
                        showNotification('No se pudo abrir la release estable 1.1.10', 'error');
                    }
                };
            }
            if (elements.openErrorLogOption) {
                elements.openErrorLogOption.onclick = async () => {
                    try {
                        if (window.electronAPI?.openErrorLog) {
                            const p = await window.electronAPI.openErrorLog();
                            showNotification(`Log abierto: ${p}`, 'info');
                        } else {
                            showNotification('Log de errores no disponible en este entorno', 'warning');
                        }
                    } catch (e) {
                        reportError('openErrorLogOption', e);
                        showNotification('No se pudo abrir el log de errores', 'error');
                    }
                };
            }
            if (elements.rollbackPreviousOption) {
                elements.rollbackPreviousOption.onclick = async () => {
                    const ok = confirm('¿Querés volver a la versión anterior guardada en cache local?');
                    if (!ok) return;
                    try {
                        const res = await window.electronAPI?.rollbackPreviousVersion?.();
                        if (res?.ok) {
                            showNotification(`Iniciando rollback a ${res.version}…`, 'warning');
                            return;
                        }
                        showNotification(res?.message || 'No hay versión anterior disponible para rollback', 'warning');
                    } catch (e) {
                        reportError('rollbackPreviousOption', e);
                        showNotification(`No se pudo iniciar rollback: ${e?.message || e}`, 'error');
                    }
                };
            }


            const buildTransitionSummary = (dayFilter) => {
                const summary = new Map();
                (AppState.statusTransitions || []).forEach((t) => {
                    if (!t?.from || !t?.to) return;
                    if (dayFilter) {
                        const d = new Date(t.at || 0).toISOString().slice(0, 10);
                        if (d !== dayFilter) return;
                    }
                    const key = `${t.from}=>${t.to}`;
                    summary.set(key, (summary.get(key) || 0) + 1);
                });
                return Array.from(summary.entries()).sort((a,b) => b[1]-a[1]);
            };

            const renderTransitionTable = (rows) => {
                if (!elements.metricTransitionsBreakdown) return;
                if (!rows.length) {
                    elements.metricTransitionsBreakdown.innerHTML = '<div style="color:var(--text-secondary)">Sin transiciones registradas para el período.</div>';
                    return;
                }
                const body = rows.map(([k,v]) => { const parts=k.split('=>'); return `<tr><td>${parts[0]}</td><td>${parts[1]}</td><td>${v}</td></tr>`; }).join('');
                elements.metricTransitionsBreakdown.innerHTML = `<table><thead><tr><th>Desde</th><th>Hacia</th><th>Cantidad</th></tr></thead><tbody>${body}</tbody></table>`;
            };

            const exportFullSnapshot = () => {
                const perContactHistory = {};
                (AppState.history || []).forEach((item) => {
                    if (!item?.contactId) return;
                    const key = String(item.contactId);
                    if (!perContactHistory[key]) perContactHistory[key] = [];
                    if (perContactHistory[key].length < 15) perContactHistory[key].push(item);
                });
                const payload = {
                    exportedAt: new Date().toISOString(),
                    appVersion: '1.1.19',
                    exportType: 'nexo-snapshot-full-v1',
                    state: {
                        contacts: AppState.contacts || [],
                        history: AppState.history || [],
                        perContactHistory,
                        profiles: AppState.profiles || [],
                        activeProfileId: AppState.activeProfileId || 'default',
                        statusTransitions: AppState.statusTransitions || [],
                        preferences: {
                            whatsappTemplate: AppState.whatsappTemplate,
                            duplicateMergeMode: AppState.duplicateMergeMode,
                            splitImportByFile: !!AppState.splitImportByFile,
                            operatorName: AppState.operatorName || 'PC local'
                        }
                    }
                };
                if (window.electronAPI?.buildExport) {
                    window.electronAPI.buildExport({ type: 'full', state: payload.state }).then((result) => {
                        if (result?.ok && result?.jsonText) {
                            downloadFile(result.jsonText, `nexo_full_snapshot_${new Date().toISOString().slice(0,10)}.json`, 'application/json;charset=utf-8;');
                            showNotification('Snapshot completo exportado', 'success');
                        } else {
                            throw new Error(result?.message || 'No se pudo generar export completo');
                        }
                    }).catch((err) => showNotification(`Error exportando snapshot: ${err?.message || err}`, 'error'));
                } else {
                    downloadFile(JSON.stringify(payload, null, 2), `nexo_full_snapshot_${new Date().toISOString().slice(0,10)}.json`, 'application/json;charset=utf-8;');
                    showNotification('Snapshot completo exportado', 'success');
                }
            };

            const importFullSnapshot = async () => {
                try {
                    const files = await window.electronAPI?.openImportDialog?.();
                    const selected = Array.isArray(files) ? files.find((f) => /\.(json|nexo)$/i.test(f)) : null;
                    if (!selected) { showNotification('Seleccioná un archivo .nexo o .json exportado', 'warning'); return; }
                    const importResult = window.api?.importData ? await window.api.importData(selected) : null;
                    const parsed = importResult?.parsed || JSON.parse(await window.electronAPI.readTextFile(selected));
                    const snapshotState = parsed?.state || parsed;
                    const incomingContacts = Array.isArray(snapshotState.contacts) ? snapshotState.contacts : (Array.isArray(snapshotState.contactsData) ? snapshotState.contactsData : []);
                    if (!incomingContacts.length) throw new Error('El snapshot no incluye contactos válidos');
                    const sourceName = (parsed?.sourceDevice || parsed?.deviceName || 'Equipo importado').slice(0, 40);
                    const mode = importResult?.mode || (await (window.electronAPI?.resolveImportMode ? window.electronAPI.resolveImportMode() : Promise.resolve({ mode: 'new-profile' })))?.mode || 'new-profile';
                    if (mode === 'cancel') return;
                    if (mode === 'current-overwrite') {
                        AppState.contacts = AppState.contacts.filter((c) => (c.profileId || 'default') !== (AppState.activeProfileId || 'default'));
                    }
                    const profileBase = `import-${Date.now()}`;
                    const incomingProfiles = Array.isArray(snapshotState.profiles) && snapshotState.profiles.length ? snapshotState.profiles : [{ id: 'default', name: 'Base principal' }];
                    const profileMap = new Map();
                    incomingProfiles.forEach((p, idx) => {
                        let newId = `${profileBase}-${idx}`;
                        if (mode === 'merge-existing') {
                            newId = importResult?.targetProfileId || AppState.activeProfileId || newId;
                        } else if (mode === 'select-existing') {
                            const opts = (AppState.profiles || []).map((pr, i) => `${i+1}. ${pr.name}`).join('\n');
                            const selectedIdx = Number(prompt(`Seleccioná perfil destino (número):\n${opts}`, '1')) - 1;
                            const selected = (AppState.profiles || [])[Math.max(0, selectedIdx)] || (AppState.profiles || [])[0];
                            newId = selected?.id || newId;
                        } else if (mode !== 'current-overwrite') {
                            AppState.profiles.push({ id: newId, name: `${sourceName} · ${p.name || `Perfil ${idx+1}`}` });
                        } else {
                            newId = AppState.activeProfileId || 'default';
                        }
                        profileMap.set(p.id || 'default', newId);
                    });
                    const importedContacts = incomingContacts.map((c) => ({ ...c, id: Date.now() + Math.floor(Math.random()*1000000), profileId: profileMap.get(c.profileId || 'default') || profileBase }));
                    AppState.contacts = AppState.contacts.concat(importedContacts);
                    const importedHistory = (Array.isArray(snapshotState.history) ? snapshotState.history : []).map((h) => ({ ...h, details: `[${sourceName}] ${h.details || ''}` }));
                    AppState.history = importedHistory.concat(AppState.history);
                    const importedTransitions = (Array.isArray(snapshotState.statusTransitions) ? snapshotState.statusTransitions : []).map((t) => ({ ...t, profileId: profileMap.get(t.profileId || 'default') || profileBase }));
                    AppState.statusTransitions = importedTransitions.concat(AppState.statusTransitions);
                    if (snapshotState.preferences) {
                        AppState.whatsappTemplate = snapshotState.preferences.whatsappTemplate || AppState.whatsappTemplate;
                        AppState.duplicateMergeMode = snapshotState.preferences.duplicateMergeMode || AppState.duplicateMergeMode;
                        AppState.splitImportByFile = !!snapshotState.preferences.splitImportByFile;
                        AppState.operatorName = snapshotState.preferences.operatorName || AppState.operatorName;
                    }
                    AppState.buttonPressEvents = (Array.isArray(snapshotState.buttonPressEvents) ? snapshotState.buttonPressEvents : []).concat(AppState.buttonPressEvents);
                    AppState.shiftSnapshots = (Array.isArray(snapshotState.shiftSnapshots) ? snapshotState.shiftSnapshots : []).concat(AppState.shiftSnapshots);
                    saveStatusTransitions();
                    saveButtonPressEvents();
                    saveShiftSnapshots();
                    saveHistory();
                    saveData();
                    render();
                    showNotification(`Snapshot importado en perfiles separados (${sourceName})`, 'success');
                } catch (e) {
                    reportError('importFullSnapshot', e);
                    showNotification(`No se pudo importar snapshot: ${e?.message || e}`, 'error');
                }
            };

            const withinLastHours = (iso, hours = 24) => {
                if (!iso) return false;
                const t = new Date(iso).getTime();
                if (!Number.isFinite(t)) return false;
                return (Date.now() - t) <= (hours * 60 * 60 * 1000);
            };

            const createControlExportPayload = () => {
                const transitions24h = (AppState.statusTransitions || []).filter((t) => withinLastHours(t.at, 24));
                const transitions30d = (AppState.statusTransitions || []).filter((t) => withinLastHours(t.at, 24 * 30));
                const buttons24h = (AppState.buttonPressEvents || []).filter((t) => withinLastHours(t.at, 24));
                const buttons30d = (AppState.buttonPressEvents || []).filter((t) => withinLastHours(t.at, 24 * 30));
                const shiftTotals = {};
                transitions24h.forEach((t) => {
                    const key = String(t.shift || 'sin-turno').toLowerCase();
                    if (!shiftTotals[key]) shiftTotals[key] = { shift: key, reviewedOut: 0, sentOut: 0, total: 0 };
                    shiftTotals[key].total += 1;
                    if (t.from === 'sin revisar') shiftTotals[key].reviewedOut += 1;
                    if (['contactado', 'jugando'].includes(t.to)) shiftTotals[key].sentOut += 1;
                });
                const topShift = Object.values(shiftTotals).sort((a,b) => b.total - a.total)[0] || null;
                const buttonsPerHour = Math.round(((buttons24h.length / 24) + Number.EPSILON) * 100) / 100;
                const monthByShift = {};
                transitions30d.forEach((t) => {
                    const key = String(t.shift || 'sin-turno').toLowerCase();
                    monthByShift[key] = (monthByShift[key] || 0) + 1;
                });
                return {
                    exportedAt: new Date().toISOString(),
                    exportType: 'nexo-control-daily-v1',
                    sourceDevice: navigator.userAgent || 'Nexo',
                    activeProfileId: AppState.activeProfileId || 'default',
                    reportScope: {
                        profiles: (AppState.profiles || []).map((p) => ({ id: p.id, name: p.name })),
                        contactsTotal: (AppState.contacts || []).length,
                        historyTotal: (AppState.history || []).length
                    },
                    dailyTransitions: transitions24h,
                    dailyButtons: buttons24h,
                    summary24h: {
                        transitionsCount: transitions24h.length,
                        buttonsCount: buttons24h.length,
                        buttonsPerHour,
                        topShift,
                        shiftTotals: Object.values(shiftTotals)
                    },
                    summary30d: {
                        transitionsCount: transitions30d.length,
                        buttonsCount: buttons30d.length,
                        shifts: monthByShift
                    }
                };
            };

            const exportControlFile = (reason = 'manual') => {
                const payload = createControlExportPayload();
                const stamp = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
                downloadFile(JSON.stringify(payload, null, 2), `nexo_control_${stamp}.json`, 'application/json;charset=utf-8;');
                AppState.midnightExportPending = false;
                AppState.lastMidnightExportDate = new Date().toISOString().slice(0, 10);
                localStorage.setItem('midnightExportPending', '0');
                localStorage.setItem('lastMidnightExportDate', AppState.lastMidnightExportDate);
                if (elements.midnightExportBtn) elements.midnightExportBtn.classList.remove('btn-midnight-pulse');
                showNotification(reason === 'auto' ? 'Exporte de control 00:00 generado automáticamente' : 'Exporte de control generado', 'success');
            };

            const ensureControlPasswordAccess = () => {
                const typed = window.prompt('Clave de archivo de control');
                if (!typed) return false;
                if (!verifyControlPassword(typed)) {
                    showNotification('Clave incorrecta para importar archivo de control', 'error');
                    return false;
                }
                AppState.controlImportUnlocked = true;
                savePreferences();
                if (elements.controlPasswordPanel) elements.controlPasswordPanel.style.display = '';
                return true;
            };

            const importControlPayload = (payload) => {
                const report = payload || {};
                const kind = String(report.exportType || '').toLowerCase();
                if (kind.includes('snapshot') || Array.isArray(report?.state?.contacts) || Array.isArray(report?.contacts)) {
                    throw new Error('Este archivo es un snapshot completo. Usá "Importar TODO" para ese formato.');
                }
                if (!kind.includes('control') && !Array.isArray(report.dailyTransitions) && !report.summary24h) {
                    throw new Error('Archivo de control inválido o no compatible');
                }
                const sourceName = String(report?.sourceDevice || report?.deviceName || report?.machineName || 'Control importado').slice(0, 60);
                const importedAt = new Date().toISOString();
                const compact = {
                    id: `ctrl-${Date.now()}`,
                    importedAt,
                    sourceName,
                    exportedAt: report.exportedAt || '',
                    summary24h: report.summary24h || null,
                    summary30d: report.summary30d || null,
                    transitionsCount: Array.isArray(report.dailyTransitions) ? report.dailyTransitions.length : (report.summary24h?.transitionsCount || 0)
                };
                AppState.controlReports = [compact].concat(AppState.controlReports || []).slice(0, 180);
                AppState.controlLastImportedAt = importedAt;
                addToHistory('Control importado', `${sourceName}: ${compact.transitionsCount} transiciones diarias`);
                saveHistory();
                savePreferences();
                render();
                showNotification(`Control importado (${sourceName})`, 'success');
            };

            const buildCurrentBaseline = () => {
                const profileId = AppState.activeProfileId || 'default';
                const map = {};
                (AppState.contacts || []).filter((c) => (c.profileId || 'default') === profileId).forEach((c) => {
                    const key = normalizePhoneToE164(c.phone || '') || String(c.id);
                    if (!key) return;
                    map[key] = {
                        id: c.id,
                        phone: c.phone || '',
                        status: c.status || 'sin revisar',
                        name: c.name || '',
                        updatedAt: c.lastUpdated || c.lastEditedAt || c.lastImportedAt || ''
                    };
                });
                return map;
            };

            const exportMonthlyFull = () => {
                const profileId = AppState.activeProfileId || 'default';
                const baselineMap = buildCurrentBaseline();
                const profileContacts = (AppState.contacts || []).filter((c) => (c.profileId || 'default') === profileId);
                const transitions30d = (AppState.statusTransitions || []).filter((t) => (t.profileId || 'default') === profileId && withinLastHours(t.at, 24 * 30));
                const payload = {
                    schema_version: '1.0.0',
                    exportType: 'nexo-monthly-full-v1',
                    profile_id: profileId,
                    generated_at: new Date().toISOString(),
                    range_start: new Date(Date.now() - (24 * 30 * 60 * 60 * 1000)).toISOString(),
                    range_end: new Date().toISOString(),
                    users: profileContacts,
                    movements_30d: transitions30d,
                    baseline: baselineMap
                };
                const json = JSON.stringify(payload, null, 2);
                downloadFile(json, `nexo_monthly_full_${profileId}_${new Date().toISOString().slice(0,10)}.json`, 'application/json;charset=utf-8;');
                AppState.monthlyBaselineByProfile[profileId] = { generatedAt: payload.generated_at, map: baselineMap };
                savePreferences();
                addToHistory('Export mensual full', `Perfil ${profileId}: ${profileContacts.length} usuarios`);
                showNotification('Export mensual full generado y baseline actualizado', 'success');
            };

            const exportDailyDelta = () => {
                const profileId = AppState.activeProfileId || 'default';
                const baseline = AppState.monthlyBaselineByProfile?.[profileId]?.map || {};
                const current = buildCurrentBaseline();
                const newUsers = [];
                const statusChanges = [];
                Object.entries(current).forEach(([key, nowUser]) => {
                    const old = baseline[key];
                    if (!old) {
                        newUsers.push({ type: 'new_user', key, ...nowUser });
                        return;
                    }
                    if ((old.status || '') !== (nowUser.status || '')) {
                        statusChanges.push({ type: 'status_change', key, from: old.status, to: nowUser.status, name: nowUser.name, phone: nowUser.phone, at: nowUser.updatedAt || new Date().toISOString() });
                    }
                });
                const dailyTransitions = (AppState.statusTransitions || []).filter((t) => (t.profileId || 'default') === profileId && withinLastHours(t.at, 24));
                const payload = {
                    schema_version: '1.0.0',
                    exportType: 'nexo-daily-delta-v1',
                    profile_id: profileId,
                    generated_at: new Date().toISOString(),
                    baseline_generated_at: AppState.monthlyBaselineByProfile?.[profileId]?.generatedAt || '',
                    range_start: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
                    range_end: new Date().toISOString(),
                    new_users: newUsers,
                    status_changes: statusChanges,
                    daily_transitions: dailyTransitions
                };
                const csvLines = ['type,key,name,phone,from,to,at']
                    .concat(newUsers.map((r) => `new_user,${r.key},"${(r.name||'').replace(/"/g,'""')}","${r.phone||''}",,,${r.updatedAt || ''}`))
                    .concat(statusChanges.map((r) => `status_change,${r.key},"${(r.name||'').replace(/"/g,'""')}","${r.phone||''}","${r.from}","${r.to}",${r.at}`));
                downloadFile(JSON.stringify(payload, null, 2), `nexo_daily_delta_${profileId}_${new Date().toISOString().slice(0,10)}.json`, 'application/json;charset=utf-8;');
                downloadFile(csvLines.join('\n'), `nexo_daily_delta_${profileId}_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv;charset=utf-8;');
                addToHistory('Export diario delta', `Perfil ${profileId}: ${newUsers.length} nuevos / ${statusChanges.length} cambios`);
                showNotification(`Delta diario exportado (${newUsers.length} nuevos, ${statusChanges.length} cambios)`, 'success');
                return { payload, csv: csvLines.join('\n') };
            };

            const ensureUploadUnlocked = async () => {
                const profileId = AppState.activeProfileId || 'default';
                if (window.NexoAdminAuth?.ensureUploadUnlocked) {
                    return window.NexoAdminAuth.ensureUploadUnlocked({
                        profileId,
                        onAudit: (entry) => AppState.uploadAuditLog.unshift(entry),
                        onSave: () => savePreferences(),
                        notify: (message, tone) => showNotification(message, tone)
                    });
                }
                showNotification('Módulo de autenticación no disponible', 'error');
                return false;
            };

            const queueReportUpload = async (reportObj, label) => {
                const profileId = AppState.activeProfileId || 'default';
                const payload = JSON.stringify(reportObj, null, 2);
                const queued = { at: new Date().toISOString(), profileId, label, size: payload.length };
                AppState.queuedUploads.unshift(queued);
                if (window.electronAPI?.queueUpload) {
                    try {
                        const result = await window.electronAPI.queueUpload({ profileId, label, payload });
                        if (result?.denied) {
                            showNotification('Sesión admin expirada. Volvé a validar clave.', 'warning');
                            return;
                        }
                    } catch (_) {}
                }
                savePreferences();
                showNotification('Encolado para subir', 'success');
            };

            const updateMidnightButtonState = () => {
                if (!elements.midnightExportBtn) return;
                if (AppState.midnightExportPending) elements.midnightExportBtn.classList.add('btn-midnight-pulse');
                else elements.midnightExportBtn.classList.remove('btn-midnight-pulse');
            };

            const startMidnightControlScheduler = () => {
                updateMidnightButtonState();
                let lastCheckedShift = getLocalCompetitionShift(new Date());
                setInterval(() => {
                    const now = new Date();
                    const dateKey = now.toISOString().slice(0, 10);
                    const isMidnight = now.getHours() === 0 && now.getMinutes() === 0;
                    if (isMidnight && AppState.lastMidnightExportDate !== dateKey) {
                        AppState.midnightExportPending = true;
                        localStorage.setItem('midnightExportPending', '1');
                        updateMidnightButtonState();
                        exportControlFile('auto');
                    }
                    // Archive shift log when shift boundary is crossed
                    const currentShift = getLocalCompetitionShift(now);
                    if (currentShift !== lastCheckedShift) {
                        // Archive the shift that just ended
                        archiveShiftDailyLog(lastCheckedShift);
                        lastCheckedShift = currentShift;
                    }
                }, 30000);
            };

            const getFilteredMetricEvents = () => {
                const shift = elements.metricsShiftFilter?.value || 'all';
                const status = elements.metricsStatusFilter?.value || 'all';
                const selectionType = elements.metricsSelectionTypeFilter?.value || 'all';
                const onlyChanges = !!elements.metricsOnlyChanges?.checked;
                const pid = AppState.activeProfileId || 'default';

                // Compute time bounds. For TN shift we need cross-midnight range.
                let fromTs = 0;
                let toTs = Number.MAX_SAFE_INTEGER;

                const fromVal = elements.metricsFromDate?.value;
                const toVal = elements.metricsToDate?.value;

                if (shift !== 'all' && (fromVal || toVal)) {
                    // Use the shift's natural time range for the selected date
                    const refDate = toVal ? new Date(`${toVal}T12:00:00`) : new Date(`${fromVal}T12:00:00`);
                    const range = getShiftDateRange(shift, refDate);
                    fromTs = range.from.getTime();
                    toTs = range.to.getTime();
                } else {
                    if (fromVal) fromTs = new Date(`${fromVal}T00:00:00`).getTime();
                    if (toVal) toTs = new Date(`${toVal}T23:59:59`).getTime();
                }

                const hourRange = AppState.metricsHourRange;

                return (AppState.metricEvents || []).filter((ev) => {
                    if ((ev.profileId || 'default') !== pid) return false;
                    const at = new Date(ev.at || 0).getTime();
                    if (!Number.isFinite(at) || at < fromTs || at > toTs) return false;
                    if (hourRange && Number.isFinite(hourRange.from) && Number.isFinite(hourRange.to)) {
                        const dt = new Date(at);
                        const h = dt.getHours() + (dt.getMinutes() / 60);
                        if (hourRange.from <= hourRange.to) {
                            if (!(h >= hourRange.from && h < hourRange.to)) return false;
                        } else {
                            if (!(h >= hourRange.from || h < hourRange.to)) return false;
                        }
                    }
                    if (shift !== 'all' && String(ev.shift || '').toLowerCase() !== shift) return false;
                    if (status !== 'all' && String(ev.status || ev.to || '').toLowerCase() !== status) return false;
                    if (selectionType !== 'all' && normalizeSelectionType(ev.selectionType) !== selectionType) return false;
                    if (onlyChanges && ev.type !== 'status_changed') return false;
                    return true;
                });
            };

            const renderMetricChartsFromEvents = async () => {
                const events = getFilteredMetricEvents();
                const workerScript = `
                    self.onmessage = (ev) => {
                        const events = Array.isArray(ev.data?.events) ? ev.data.events : [];
                        const status = Object.create(null);
                        const selection = Object.create(null);
                        const transitions = Object.create(null);
                        for (const e of events) {
                            const st = String(e.status || e.to || '').toLowerCase();
                            if (st) status[st] = (status[st] || 0) + 1;
                            const sel = String(e.selectionType || e.type || 'unknown').toLowerCase();
                            selection[sel] = (selection[sel] || 0) + 1;
                            if (e.from && e.to) {
                                const k = String(e.from || '') + '→' + String(e.to || '');
                                transitions[k] = (transitions[k] || 0) + 1;
                            }
                        }
                        const toEntries = (obj) => Object.entries(obj).map(([label, value]) => ({ label, value })).sort((a,b)=>b.value-a.value);
                        self.postMessage({
                            statusEntries: toEntries(status),
                            selEntries: toEntries(selection),
                            transEntries: toEntries(transitions).slice(0, 12)
                        });
                    };
                `;
                try {
                    const started = performance.now();
                    const blob = new Blob([workerScript], { type: 'application/javascript' });
                    const workerUrl = URL.createObjectURL(blob);
                    const worker = new Worker(workerUrl);
                    const result = await new Promise((resolve, reject) => {
                        worker.onmessage = (ev) => resolve(ev.data || {});
                        worker.onerror = (err) => reject(err);
                        worker.postMessage({ events });
                    });
                    worker.terminate();
                    URL.revokeObjectURL(workerUrl);
                    const statusEntries = Array.isArray(result.statusEntries) ? result.statusEntries : [];
                    const selEntries = Array.isArray(result.selEntries) ? result.selEntries : [];
                    const transEntries = Array.isArray(result.transEntries) ? result.transEntries : [];
                    drawDonut(elements.statusDonutChart, statusEntries, ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#22d3ee']);
                    drawDonut(elements.selectionDonutChart, selEntries, ['#14b8a6','#3b82f6','#f97316','#8b5cf6','#ef4444']);
                    drawBars(elements.transitionBarChart, transEntries, '#22c55e');
                    console.log('[perf] metrics worker ms', Math.round(performance.now() - started), 'events', events.length);
                } catch (error) {
                    console.warn('metrics worker fallback', error);
                    const statusMap = new Map();
                    const selMap = new Map();
                    const transMap = new Map();
                    events.forEach((ev) => {
                        if (ev.status || ev.to) {
                            const st = String(ev.status || ev.to || '').toLowerCase();
                            statusMap.set(st, (statusMap.get(st) || 0) + 1);
                        }
                        const sel = normalizeSelectionType(ev.selectionType || ev.type);
                        selMap.set(sel, (selMap.get(sel) || 0) + 1);
                        if (ev.from && ev.to) {
                            const key = `${ev.from}→${ev.to}`;
                            transMap.set(key, (transMap.get(key) || 0) + 1);
                        }
                    });
                    drawDonut(elements.statusDonutChart, Array.from(statusMap.entries()).map(([label, value]) => ({ label, value })), ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#22d3ee']);
                    drawDonut(elements.selectionDonutChart, Array.from(selMap.entries()).map(([label, value]) => ({ label, value })), ['#14b8a6','#3b82f6','#f97316','#8b5cf6','#ef4444']);
                    drawBars(elements.transitionBarChart, Array.from(transMap.entries()).map(([label, value]) => ({ label, value })).slice(0,12), '#22c55e');
                }
            };

            const syncMetricsFilters = () => {
                const statusOptions = STATUS_OPTIONS.map((s) => `<option value="${s.id}">${s.label}</option>`).join('');
                if (elements.metricsStatusFilter && !elements.metricsStatusFilter.dataset.bound) {
                    elements.metricsStatusFilter.innerHTML = `<option value="all">Estado: todos</option>${statusOptions}`;
                    elements.metricsStatusFilter.dataset.bound = '1';
                }
            };


            const getOpsSummaryForMetrics = () => {
                const profileId = AppState.activeProfileId || 'default';
                const bucket = AppState.opsProfiles?.[profileId] || AppState.opsProfiles || {};
                const rows = Array.isArray(bucket?.rows) ? bucket.rows
                    : Array.isArray(bucket?.operations) ? bucket.operations
                    : Array.isArray(bucket) ? bucket
                    : [];
                const now = new Date();
                const today = now.toISOString().slice(0, 10);
                const shiftNow = getLocalCompetitionShift(now);
                let day = 0;
                let shift = 0;
                rows.forEach((r) => {
                    const ts = r?.at || r?.date || r?.createdAt || r?.timestamp;
                    const d = ts ? new Date(ts) : null;
                    if (!d || Number.isNaN(d.getTime())) return;
                    const iso = d.toISOString().slice(0, 10);
                    if (iso === today) {
                        day += 1;
                        if (getLocalCompetitionShift(d) === shiftNow) shift += 1;
                    }
                });
                return { day, shift, shiftNow };
            };

            if (elements.showQuickMetricsOption) {
                elements.showQuickMetricsOption.onclick = () => {
                    const now = new Date();
                    const currentShift = getLocalCompetitionShift(now);
                    const shiftRange = getShiftDateRange(currentShift, now);

                    // Set date pickers to match the real calendar dates covered by this shift
                    const fromDate = shiftRange.from.toISOString().slice(0, 10);
                    const toDate = shiftRange.to.toISOString().slice(0, 10);
                    if (elements.metricsFromDate) elements.metricsFromDate.value = fromDate;
                    if (elements.metricsToDate) elements.metricsToDate.value = toDate;
                    AppState.metricsHourRange = null;

                    // Auto-select current shift pill
                    window.setMetricsShift(currentShift);

                    const today = now.toISOString().slice(0, 10);
                    const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                    const yesterday = yesterdayDate.toISOString().slice(0, 10);
                    const dayFromIso = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

                    const byShift = { tm: 0, tt: 0, tn: 0 };
                    let editedToday = 0;
                    let editedYesterday = 0;

                    AppState.contacts.forEach((c) => {
                        const day = dayFromIso(c.lastUpdated || c.lastEditedAt || c.lastImportedAt);
                        if (day === today) editedToday++;
                        if (day === yesterday) editedYesterday++;
                        const shiftKey = String(c.shiftReviewedByShift || '').toLowerCase();
                        if (byShift[shiftKey] !== undefined && day === today) byShift[shiftKey]++;
                    });

                    // Compute shift-aware 24h window for transitions/buttons
                    const shiftFromTs = shiftRange.from.getTime();
                    const shiftToTs = shiftRange.to.getTime();
                    const pid = AppState.activeProfileId || 'default';

                    const transitionsShift = (AppState.statusTransitions || []).filter((t) => {
                        const ts = new Date(t.at || 0).getTime();
                        return ts >= shiftFromTs && ts <= shiftToTs && (t.profileId || 'default') === pid;
                    });
                    const buttonsShift = (AppState.buttonPressEvents || []).filter((t) => {
                        const ts = new Date(t.at || 0).getTime();
                        return ts >= shiftFromTs && ts <= shiftToTs && (t.profileId || 'default') === pid;
                    });
                    const transitions24h = (AppState.statusTransitions || []).filter((t) => withinLastHours(t.at, 24) && (t.profileId || 'default') === pid);
                    const buttons24h = (AppState.buttonPressEvents || []).filter((t) => withinLastHours(t.at, 24) && (t.profileId || 'default') === pid);

                    const shiftTotals = {};
                    transitions24h.forEach((t) => {
                        const key = String(t.shift || 'sin-turno').toLowerCase();
                        if (!shiftTotals[key]) shiftTotals[key] = { shift: key, reviewedOut: 0, sentOut: 0, total: 0 };
                        shiftTotals[key].total += 1;
                        if (t.from === 'sin revisar') shiftTotals[key].reviewedOut += 1;
                        if (['contactado', 'jugando'].includes(t.to)) shiftTotals[key].sentOut += 1;
                    });
                    const topShift = Object.values(shiftTotals).sort((a,b) => b.total-a.total)[0] || null;
                    const topShiftText = topShift ? `${String(topShift.shift).toUpperCase()} (${topShift.total})` : 'sin datos';

                    // Shift duration in hours for rate calc
                    const shiftDurationHours = (shiftToTs - shiftFromTs) / 3600000;
                    const shiftElapsedHours = Math.min(shiftDurationHours, (now.getTime() - shiftFromTs) / 3600000);
                    const buttonsPerHour = shiftElapsedHours > 0 ? Math.round(((buttonsShift.length / shiftElapsedHours) + Number.EPSILON) * 100) / 100 : 0;

                    const filteredEvents = getFilteredMetricEvents();
                    const opTotal = filteredEvents.filter((e) => ['operation_created', 'status_changed'].includes(e.type)).length;
                    const newUsers = filteredEvents.filter((e) => e.type === 'user_created').length;
                    const statusChanges = filteredEvents.filter((e) => e.type === 'status_changed').length;
                    const usersInRange = new Set(filteredEvents.map((e) => e.contactId).filter(Boolean)).size;

                    const shiftLabel = { tm: 'TM (06-14)', tt: 'TT (14-22)', tn: 'TN (22-06)' }[currentShift] || currentShift.toUpperCase();
                    if (elements.metricsDateLabel) elements.metricsDateLabel.textContent = `Turno actual: ${shiftLabel} · ${transitionsShift.length} movimientos`;
                    if (elements.metricsOpsSummary) {
                        const opsSummary = getOpsSummaryForMetrics();
                        elements.metricsOpsSummary.textContent = `Ops turno: ${opsSummary.shift} · ops hoy: ${opsSummary.day} · turno ${String(opsSummary.shiftNow || '-').toUpperCase()}`;
                    }
                    if (elements.metricEditedToday) elements.metricEditedToday.textContent = String(opTotal || transitionsShift.length || editedToday);
                    if (elements.metricEditedYesterday) elements.metricEditedYesterday.textContent = String(usersInRange || editedYesterday);
                    if (elements.metricTopShift) elements.metricTopShift.textContent = topShiftText;
                    if (elements.metricTransitions24h) elements.metricTransitions24h.textContent = String(statusChanges || transitionsShift.length);
                    if (elements.metricTopShift24h) elements.metricTopShift24h.textContent = topShiftText;
                    if (elements.metricButtonsPerHour) elements.metricButtonsPerHour.textContent = String(buttonsPerHour || newUsers);
                    const allTransitions = buildTransitionSummary();
                    renderTransitionTable(allTransitions);
                    const transitionRows = allTransitions.map(([key, count]) => {
                        const [from, to] = key.split('=>');
                        return { from, to, count };
                    });
                    const transitionMap = new Map(transitionRows.map((row) => [`${row.from}=>${row.to}`, row.count]));
                    const highlightedCombos = [
                        ['sin revisar', 'contactado'],
                        ['contactado', 'no interesado'],
                        ['contactado', 'jugando'],
                        ['sin revisar', 'jugando'],
                        ['sin revisar', 'revisado'],
                        ['sin revisar', 'no interesado']
                    ].map(([from, to]) => ({ from, to, count: transitionMap.get(`${from}=>${to}`) || 0 }));
                    const topTransitions = transitionRows.filter((row) => row.count > 0).slice(0, 6);
                    const mainTransitions = topTransitions.length ? topTransitions : highlightedCombos.filter((row) => row.count > 0);
                    const rareTransitions = transitionRows.filter((row) => row.count > 0 && !mainTransitions.find((it) => it.from === row.from && it.to === row.to));
                    if (elements.metricTransitionSummary) {
                        const lines = (mainTransitions.length ? mainTransitions : highlightedCombos).map(({ from, to, count }) => (
                            `<div><strong>${from}</strong> >>>> <strong>${to}</strong> x${count}</div>`
                        )).join('');
                        elements.metricTransitionSummary.innerHTML = lines || '<div style="color:var(--text-secondary)">Sin resumen de transiciones</div>';
                    }
                    if (elements.metricRareTransitions && elements.metricRareTransitionsBody) {
                        if (!rareTransitions.length) {
                            elements.metricRareTransitions.style.display = 'none';
                            elements.metricRareTransitions.open = false;
                            elements.metricRareTransitionsBody.innerHTML = '';
                        } else {
                            elements.metricRareTransitions.style.display = '';
                            elements.metricRareTransitionsBody.innerHTML = rareTransitions.map((row) => `<div>${row.from} >>>> ${row.to} x${row.count}</div>`).join('');
                        }
                    }
                    if (elements.metricShiftBreakdown) {
                        const shiftRich = {};
                        transitions24h.forEach((row) => {
                            const key = String(row.shift || 'sin-turno').toLowerCase();
                            if (!shiftRich[key]) shiftRich[key] = { shift: key, total: 0, byTo: {} };
                            shiftRich[key].total += 1;
                            shiftRich[key].byTo[row.to] = (shiftRich[key].byTo[row.to] || 0) + 1;
                        });
                        // Highlight current shift
                        const sorted = Object.values(shiftRich).sort((a, b) => {
                            if (a.shift === currentShift) return -1;
                            if (b.shift === currentShift) return 1;
                            return b.total - a.total;
                        });
                        const cards = sorted.map((row) => {
                            const topStates = Object.entries(row.byTo).sort((a, b) => b[1] - a[1]).slice(0, 3);
                            const lines = topStates.map(([status, amount]) => `${status}: ${amount}`).join(' · ');
                            const isCurrent = row.shift === currentShift;
                            return `<div class="metrics-card${isCurrent ? ' metrics-card-active' : ''}"><div class="k">${String(row.shift).toUpperCase()}${isCurrent ? ' ★' : ''} ${row.total} usuarios</div><div class="v">${row.total}</div><div class="k">${lines || 'Sin cambios'}</div></div>`;
                        });
                        elements.metricShiftBreakdown.innerHTML = cards.length ? cards.join('') : '<div style="color:var(--text-secondary)">Sin datos por turno en 24h.</div>';
                        if (elements.metricShiftRanking) {
                            if (!sorted.length) {
                                elements.metricShiftRanking.innerHTML = '<div style="color:var(--text-secondary)">Sin ranking de turnos en 24h.</div>';
                            } else {
                                const top = sorted[0];
                                const lines = sorted.map((row, idx) => {
                                    const topStates = Object.entries(row.byTo).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([st, qty]) => `${st} ${qty}`).join(', ');
                                    const isCurr = row.shift === currentShift ? ' ← actual' : '';
                                    return `${idx + 1}º ${String(row.shift).toUpperCase()} ${row.total} usuarios${topStates ? ` — ${topStates}` : ''}${isCurr}`;
                                });
                                elements.metricShiftRanking.innerHTML = `<div><strong>${String(top.shift).toUpperCase()} 1er puesto:</strong> ${top.total} usuarios</div><div style="margin-top:6px">${lines.join('<br>')}</div>`;
                            }
                        }
                    }

                    if (elements.controlReportsSummary) {
                        const reports = (AppState.controlReports || []).slice(0, 5);
                        if (!reports.length) {
                            elements.controlReportsSummary.innerHTML = '<div style="color:var(--text-secondary)">Sin controles importados todavía.</div>';
                        } else {
                            const rows = reports.map((r, idx) => {
                                const d24 = r?.summary24h?.transitionsCount ?? r.transitionsCount ?? 0;
                                const d30 = r?.summary30d?.transitionsCount ?? 0;
                                return `<div><strong>${idx + 1}.</strong> ${r.sourceName} · 24h: ${d24} · 30d: ${d30} · importado: ${new Date(r.importedAt).toLocaleString('es-ES')}</div>`;
                            }).join('');
                            elements.controlReportsSummary.innerHTML = `<div style="font-weight:700;margin-bottom:6px;">Controles importados recientes</div>${rows}`;
                        }
                    }

                    renderMetricChartsFromEvents();

                    updateMetricsProfileBadge();
                    if (elements.metricsModal) elements.metricsModal.classList.add('active');
                };
            }

            // ── Centro de Mando: tabs y comparación de perfiles ─────────────
            window.switchMetricsTab = (tab) => {
                ['operator','supervisor','compare','export'].forEach(t => {
                    const btn = document.getElementById(`metricsTab${t.charAt(0).toUpperCase()+t.slice(1)}`);
                    const content = document.getElementById(`metricsTabContent${t.charAt(0).toUpperCase()+t.slice(1)}`);
                    if (btn) btn.classList.toggle('active', t === tab);
                    if (content) content.classList.toggle('active', t === tab);
                });
                if (tab === 'compare') renderProfileCompare();
                if (tab === 'supervisor') window.renderShiftDailyLogs();
            };

            let currentMetricsFilter = 'today';
            
            window.setMetricsHistoryFilter = (filter) => {
                currentMetricsFilter = filter;
                // Update button states
                ['filterToday', 'filterYesterday', 'filterDayBefore', 'filterWeek', 'filterMonth'].forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn) btn.classList.toggle('active', id === 'filter' + filter.charAt(0).toUpperCase() + filter.slice(1));
                });
                window.renderMetricsHistory();
            };

            window.renderMetricsHistory = () => {
                const container = document.getElementById('metricsHistoryContainer');
                const summaryBar = document.getElementById('metricsHistorySummary');
                if (!container) return;
                
                const events = AppState.metricEvents || [];
                if (!events.length) {
                    container.innerHTML = '<div style="color:var(--text-secondary);font-size:.85rem;">No hay actividad registrada aún.</div>';
                    if (summaryBar) summaryBar.style.display = 'none';
                    return;
                }

                // Calculate date range based on filter
                const now = new Date();
                let fromDate, toDate;
                
                if (currentMetricsFilter === 'today') {
                    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                } else if (currentMetricsFilter === 'yesterday') {
                    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                    toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                } else if (currentMetricsFilter === 'dayBefore') {
                    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
                    toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                } else if (currentMetricsFilter === 'week') {
                    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
                    toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                } else if (currentMetricsFilter === 'month') {
                    fromDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                    toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                } else if (currentMetricsFilter === 'custom') {
                    const fromEl = document.getElementById('customFromDate');
                    const toEl = document.getElementById('customToDate');
                    if (fromEl?.value) fromDate = new Date(fromEl.value + 'T00:00:00');
                    if (toEl?.value) toDate = new Date(toEl.value + 'T23:59:59');
                }

                // Filter events by date range
                const filtered = events.filter(e => {
                    const eventDate = new Date(e.timestamp);
                    return (!fromDate || eventDate >= fromDate) && (!toDate || eventDate <= toDate);
                });

                // Group by day
                const byDay = {};
                filtered.forEach(e => {
                    const day = new Date(e.timestamp).toISOString().split('T')[0];
                    if (!byDay[day]) byDay[day] = [];
                    byDay[day].push(e);
                });

                // Summary
                if (summaryBar) {
                    if (filtered.length) {
                        const actionTypes = {};
                        filtered.forEach(e => {
                            actionTypes[e.type] = (actionTypes[e.type] || 0) + 1;
                        });
                        const topActions = Object.entries(actionTypes).sort((a, b) => b[1] - a[1]).slice(0, 4)
                            .map(([type, count]) => `<span style="font-weight:600;">${type}</span>: ${count}`).join(' · ');
                        summaryBar.innerHTML = `<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                            <span><i class="fas fa-calendar"></i> <strong>${Object.keys(byDay).length}</strong> días</span>
                            <span><i class="fas fa-bolt"></i> <strong>${filtered.length}</strong> acciones</span>
                        </div>${topActions ? `<div style="margin-top:6px;color:var(--text-secondary);font-size:.82rem;">${topActions}</div>` : ''}`;
                        summaryBar.style.display = 'block';
                    } else {
                        summaryBar.style.display = 'none';
                    }
                }

                if (!Object.keys(byDay).length) {
                    container.innerHTML = '<div style="color:var(--text-secondary);font-size:.85rem;">No hay actividad en el período seleccionado.</div>';
                    return;
                }

                // Render days
                const dayEntries = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30);
                const rows = dayEntries.map(([day, dayEvents]) => {
                    const date = new Date(day + 'T12:00:00');
                    const dayStr = date.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' });
                    
                    const actionsByType = {};
                    dayEvents.forEach(e => {
                        actionsByType[e.type] = (actionsByType[e.type] || 0) + 1;
                    });
                    
                    const topActions = Object.entries(actionsByType).sort((a, b) => b[1] - a[1]).slice(0, 5)
                        .map(([type, count]) => `${type}: ${count}`).join(' · ');
                    
                    return `<div style="background:rgba(30,41,59,.6);border:1px solid rgba(148,163,184,.15);border-radius:10px;padding:10px 12px;font-size:.83rem;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                            <span style="font-weight:700;">${dayStr}</span>
                            <span style="color:var(--text-secondary);font-size:.78rem;">${dayEvents.length} acciones</span>
                        </div>
                        <div style="color:var(--text-secondary);font-size:.8rem;">${topActions || 'sin actividad'}</div>
                    </div>`;
                }).join('');
                
                container.innerHTML = rows;
            };

            // Legacy function for compatibility
            window.renderShiftDailyLogs = window.renderMetricsHistory;

            window.setMetricsShift = (shift) => {
                // Update pills visual
                ['metricsShiftMorningBtn','metricsShiftAfternoonBtn','metricsShiftNightBtn','metricsShiftResetBtn'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.classList.remove('active');
                });
                const map = { tm: 'metricsShiftMorningBtn', tt: 'metricsShiftAfternoonBtn', tn: 'metricsShiftNightBtn', all: 'metricsShiftResetBtn' };
                if (map[shift]) document.getElementById(map[shift])?.classList.add('active');
                // Set the hidden select value and trigger update
                if (elements.metricsShiftFilter) {
                    elements.metricsShiftFilter.value = shift;
                    elements.metricsShiftFilter.dispatchEvent(new Event('change'));
                }
            };

            async function renderProfileCompare() {
                const container = document.getElementById('metricsProfileCompare');
                if (!container) return;
                const profiles = AppState.profiles || [{ id: 'default', name: 'Base principal' }];
                const activePid = AppState.activeProfileId || 'default';
                
                // Load data from ALL profiles for comparison
                const profileMetrics = await Promise.all(profiles.map(async profile => {
                    const pid = profile.id;
                    let contacts = [];
                    
                    if (pid === activePid) {
                        contacts = AppState.contacts;
                    } else {
                        try {
                            const result = await window.electronAPI?.loadProfile({ profileId: pid });
                            if (result?.ok && Array.isArray(result.contacts)) {
                                contacts = result.contacts;
                            }
                        } catch (e) {
                            contacts = [];
                        }
                    }
                    const total = contacts.length;
                    const reviewed = contacts.filter(c => c.status !== 'sin revisar').length;
                    const sinWsp = contacts.filter(c => c.status === 'sin wsp').length;
                    const contactado = contacts.filter(c => c.status === 'contactado').length;
                    const jugando = contacts.filter(c => c.status === 'jugando').length;
                    const noInteresado = contacts.filter(c => c.status === 'no interesado').length;
                    const revisado = contacts.filter(c => c.status === 'revisado').length;
                    
                    // Activity metrics from metricEvents
                    let todayEvents = 0;
                    let weekEvents = 0;
                    try {
                        const events = JSON.parse(localStorage.getItem(`metricEvents:${pid}`) || '[]');
                        const today = new Date();
                        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                        const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                        
                        todayEvents = events.filter(e => new Date(e.timestamp) >= todayStart).length;
                        weekEvents = events.filter(e => new Date(e.timestamp) >= weekStart).length;
                    } catch (_) {}
                    
                    const pct = total ? Math.round((reviewed / total) * 100) : 0;
                    const isActive = pid === activePid;
                    
                    return {
                        profile, pid, isActive, total, reviewed, pct,
                        sinWsp, contactado, jugando, noInteresado, revisado,
                        todayEvents, weekEvents
                    };
                }));
                
                // Sort by total contacts (largest first)
                profileMetrics.sort((a, b) => b.total - a.total);
                
                const cards = profileMetrics.map(metrics => {
                    const { profile, pid, isActive, total, reviewed, pct, sinWsp, contactado, jugando, noInteresado, revisado, todayEvents, weekEvents } = metrics;
                    
                    return `<div class="metrics-compare-card ${isActive ? 'active-profile' : ''}" onclick="window.switchToProfile('${pid}')">
                        <div class="metrics-compare-header">
                            <div class="metrics-compare-name">
                                ${isActive ? '<i class="fas fa-circle" style="color:var(--accent);font-size:.7rem;"></i>' : '<i class="fas fa-circle-o" style="color:rgba(148,163,184,.4);font-size:.7rem;"></i>'}
                                <span style="font-weight:700;">${profile.name}</span>
                                ${isActive ? '<span class="active-badge">ACTIVO</span>' : '<span class="switch-hint">clic para activar</span>'}
                            </div>
                            <div class="metrics-compare-progress">
                                <div style="background:rgba(148,163,184,.15);border-radius:999px;height:8px;overflow:hidden;">
                                    <div style="background:${pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'};height:100%;width:${pct}%;border-radius:999px;transition:width .5s;"></div>
                                </div>
                                <span style="font-weight:700;font-size:.85rem;">${pct}% completado</span>
                            </div>
                        </div>
                        
                        <div class="metrics-compare-grid">
                            <div class="metrics-compare-stat primary">
                                <span class="stat-label">Total</span>
                                <span class="stat-value">${total.toLocaleString()}</span>
                            </div>
                            <div class="metrics-compare-stat">
                                <span class="stat-label">Revisados</span>
                                <span class="stat-value" style="color:#10b981;">${reviewed}</span>
                            </div>
                            <div class="metrics-compare-stat">
                                <span class="stat-label">Contactado</span>
                                <span class="stat-value" style="color:#3b82f6;">${contactado}</span>
                            </div>
                            <div class="metrics-compare-stat">
                                <span class="stat-label">Jugando</span>
                                <span class="stat-value" style="color:#8b5cf6;">${jugando}</span>
                            </div>
                            <div class="metrics-compare-stat">
                                <span class="stat-label">Sin WSP</span>
                                <span class="stat-value" style="color:#f59e0b;">${sinWsp}</span>
                            </div>
                            <div class="metrics-compare-stat">
                                <span class="stat-label">No interesa</span>
                                <span class="stat-value" style="color:#ef4444;">${noInteresado}</span>
                            </div>
                        </div>
                        
                        <div class="metrics-compare-activity">
                            <div class="activity-stat">
                                <i class="fas fa-bolt"></i>
                                <span>Hoy: <strong>${todayEvents}</strong> acciones</span>
                            </div>
                            <div class="activity-stat">
                                <i class="fas fa-calendar-week"></i>
                                <span>Semana: <strong>${weekEvents}</strong> acciones</span>
                            </div>
                        </div>
                    </div>`;
                });
                
                container.innerHTML = cards.join('');
            }
            
            // Helper function to switch profiles from comparison
            window.switchToProfile = (profileId) => {
                if (AppState.activeProfileId === profileId) return;
                window.switchProfile(profileId);
            };

            // Update profile badge when modal opens
            function updateMetricsProfileBadge() {
                const badge = document.getElementById('metricsProfileBadge');
                if (!badge) return;
                const profile = (AppState.profiles || []).find(p => p.id === (AppState.activeProfileId || 'default'));
                badge.textContent = profile?.name || 'Base principal';
            }
            // ────────────────────────────────────────────────────────────────

            syncMetricsFilters();
            [elements.metricsShiftFilter, elements.metricsFromDate, elements.metricsToDate, elements.metricsStatusFilter, elements.metricsSelectionTypeFilter, elements.metricsOnlyChanges].forEach((el) => {
                if (!el) return;
                el.onchange = () => {
                    if (elements.metricsModal?.classList.contains('active')) renderMetricChartsFromEvents();
                };
            });

            if (elements.metricsFilterLastBatchBtn) {
                elements.metricsFilterLastBatchBtn.onclick = () => {
                    AppState.originFilter = '__last_upload__';
                    if (elements.originFilter) elements.originFilter.value = '__last_upload__';
                    AppState.currentPage = 1;
                    render();
                    showNotification('Filtro aplicado: última subida', 'info');
                };
            }

            if (elements.openThemesOption && elements.themesModal) {
                elements.openThemesOption.onclick = () => {
                    renderThemeCards();
                    if (elements.lightModeToggle) elements.lightModeToggle.checked = !!AppState.lightMode;
                    elements.themesModal.classList.add('active');
                    elements.userOptionsModal.classList.remove('active');
                };
            }
            if (elements.lightModeToggle) {
                elements.lightModeToggle.onchange = (e) => {
                    AppState.lightMode = !!e.target.checked;
                    applyTheme(AppState.activeThemeId || 'whaticket-blue');
                    renderThemeCards();
                    showNotification(AppState.lightMode ? 'Modo claro activado' : 'Modo oscuro activado', 'info');
                };
            }
            if (elements.closeThemesModal) elements.closeThemesModal.onclick = () => elements.themesModal.classList.remove('active');
            if (elements.saveCustomThemeBtn) {
                elements.saveCustomThemeBtn.onclick = () => {
                    const name = String(elements.themeNameInput?.value || '').trim() || `Tema ${new Date().toLocaleDateString('es-ES')}`;
                    let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `theme-${Date.now()}`;
                    while (AppState.themeCatalog[id]) id = `${id}-2`;
                    AppState.themeCatalog[id] = {
                        id,
                        name,
                        primary: elements.themePrimary?.value || '#3b82f6',
                        accent: elements.themeAccent?.value || '#10b981',
                        bg: elements.themeBg?.value || '#0f172a',
                        surface: elements.themeSurface?.value || '#1e293b',
                        text: elements.themeText?.value || '#e2e8f0'
                    };
                    applyTheme(id);
                    renderThemeCards();
                    showNotification('Tema personalizado guardado', 'success');
                };
            }
            if (elements.exportThemesBtn) {
                elements.exportThemesBtn.onclick = () => {
                    const customThemes = Object.fromEntries(Object.entries(AppState.themeCatalog || {}).filter(([id]) => !isSystemThemeId(id)));
                    downloadFile(JSON.stringify({ schema_version: '1.0.0', generated_at: new Date().toISOString(), themes: customThemes }, null, 2), 'themes.json', 'application/json;charset=utf-8;');
                };
            }
            if (elements.importThemesBtn) {
                elements.importThemesBtn.onclick = async () => {
                    try {
                        const files = await window.electronAPI?.openImportDialog?.();
                        const selected = Array.isArray(files) ? files.find((f) => /themes\.json$|\.json$/i.test(f)) : null;
                        if (!selected) return;
                        const text = await window.electronAPI.readTextFile(selected);
                        const parsed = JSON.parse(text);
                        const incoming = parsed?.themes || {};
                        Object.values(incoming).forEach((theme) => {
                            if (!theme?.name) return;
                            let id = theme.id || theme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                            while (AppState.themeCatalog[id]) id = `${id}-2`;
                            AppState.themeCatalog[id] = { ...theme, id };
                        });
                        savePreferences();
                        renderThemeCards();
                        showNotification('Temas importados y mergeados', 'success');
                    } catch (e) {
                        reportError('importThemes', e);
                        showNotification('No se pudo importar themes.json', 'error');
                    }
                };
            }

            if (elements.controlPasswordSaveBtn && elements.controlPasswordNew) {
                elements.controlPasswordSaveBtn.onclick = () => {
                    if (!AppState.controlImportUnlocked) {
                        showNotification('Primero ingresá la clave actual para habilitar el cambio', 'warning');
                        return;
                    }
                    const nextPassword = String(elements.controlPasswordNew.value || '').trim();
                    if (nextPassword.length < 6) {
                        showNotification('La nueva clave debe tener al menos 6 caracteres', 'warning');
                        return;
                    }
                    AppState.controlPasswordHash = hashControlPassword(nextPassword);
                    elements.controlPasswordNew.value = '';
                    savePreferences();
                    showNotification('Clave del archivo de control actualizada', 'success');
                };
            }

            if (elements.midnightExportBtn) {
                elements.midnightExportBtn.onclick = () => exportControlFile('manual');
                updateMidnightButtonState();
            }
            if (elements.controlPasswordPanel) {
                elements.controlPasswordPanel.style.display = AppState.controlImportUnlocked ? '' : 'none';
            }
            startMidnightControlScheduler();

            if (elements.metricsDeleteLastBatchBtn) {
                elements.metricsDeleteLastBatchBtn.onclick = () => {
                    if (!AppState.lastImportBatchId) {
                        showNotification('No hay última subida para borrar', 'warning');
                        return;
                    }
                    const count = AppState.contacts.filter(c => getContactBatchId(c) === AppState.lastImportBatchId).length;
                    if (!count) {
                        showNotification('No hay contactos de la última subida', 'warning');
                        return;
                    }
                    const ok = confirm(`¿Borrar completamente ${count} contactos de la última subida?`);
                    if (!ok) return;
                    AppState.contacts = AppState.contacts.filter(c => getContactBatchId(c) !== AppState.lastImportBatchId);
                    addToHistory('Borrado por métricas', `Se eliminaron ${count} contactos de la última subida`);
                    AppState.lastImportBatchId = AppState.previousImportBatchId || '';
                    localStorage.setItem('lastImportBatchId', AppState.lastImportBatchId);
                    detectDuplicates();
                    saveData();
                    render();
                    showNotification(`Eliminados ${count} contactos de la última subida`, 'success');
                };
            }

            if ($('#closeMetricsModal')) $('#closeMetricsModal').onclick = () => $('#metricsModal').classList.remove('active');
            $('#closeUserOptionsModal').onclick = () => elements.userOptionsModal.classList.remove('active');

            const clearSearchGhost = () => {
                AppState.searchGhostActive = false;
                elements.searchInput.classList.remove('ghost-value', 'ghost-value-active');
                elements.searchInput.placeholder = 'Buscar... (ej: pepe, 11, estado:jugando, turno:tm, origen:csv)';
            };
            elements.searchInput.onfocus = () => {
                if (AppState.searchGhostTerm) {
                    AppState.searchGhostActive = true;
                    elements.searchInput.value = '';
                    elements.searchInput.classList.add('ghost-value', 'ghost-value-active');
                    elements.searchInput.placeholder = AppState.searchGhostTerm;
                }
            };
            elements.searchInput.onblur = () => {
                if (AppState.searchTerm) {
                    AppState.searchGhostTerm = AppState.searchTerm;
                    AppState.searchGhostActive = true;
                    elements.searchInput.value = AppState.searchGhostTerm;
                    elements.searchInput.classList.add('ghost-value', 'ghost-value-active');
                }
            };
            elements.searchInput.oninput = (e) => {
                const value = e.target.value;
                if (AppState.searchGhostActive) {
                    clearSearchGhost();
                }
                AppState.searchTerm = value;
                AppState.currentPage = 1;
                render();
            };

            $('#undoBtn').onclick = undoToLastContact;
            
            elements.saveTemplateBtn.onclick = () => {
                AppState.whatsappTemplate = elements.whatsappTemplateInput.value;
                savePreferences();
                showNotification('Mensaje de WhatsApp guardado', 'success');
                elements.whatsappMessageModal.classList.remove('active');
            };
            elements.insertUserTokenBtn.onclick = () => {
                const el = elements.whatsappTemplateInput;
                const token = '{usuario}';
                const start = el.selectionStart || el.value.length;
                const end = el.selectionEnd || el.value.length;
                el.value = el.value.slice(0, start) + token + el.value.slice(end);
                el.focus();
                el.selectionStart = el.selectionEnd = start + token.length;
            };
            elements.resetTemplateBtn.onclick = () => {
                elements.whatsappTemplateInput.value = 'Hola {usuario}, ¿cómo estás? Te escribo por la propuesta que vimos.';
                AppState.whatsappTemplate = elements.whatsappTemplateInput.value;
                savePreferences();
            };
            $('#closeWhatsappMessageModal').onclick = () => elements.whatsappMessageModal.classList.remove('active');
            const closeShortcutsBtn = $('#closeShortcutsModal');
            if (closeShortcutsBtn) closeShortcutsBtn.onclick = () => elements.shortcutsModal.classList.remove('active');

            document.addEventListener('change', (e) => {
                if (e.target && e.target.name === 'dupMergeMode') {
                    AppState.duplicateMergeMode = e.target.value;
                    savePreferences();
                }
            });

            const markUserInteraction = () => { lastInteractionAt = Date.now(); };
            ['click','keydown','pointerdown','wheel','scroll'].forEach((evt) => window.addEventListener(evt, markUserInteraction, { passive: true }));

            window.addEventListener('beforeunload', () => {
                flushSaveQueue('beforeunload');
                if (window.nexoStore?.flushDeltas) window.nexoStore.flushDeltas('beforeunload').catch(() => {});
                flushAuxStorageSave();
                savePreferences(true);
            });

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    hiddenAt = Date.now();
                    setTimeout(() => {
                        if (document.visibilityState === 'hidden' && contactsDirty && Date.now() - hiddenAt >= 10000) {
                            flushSaveQueue('hidden-10s');
                            if (window.nexoStore?.flushDeltas) window.nexoStore.flushDeltas('hidden-10s').catch(() => {});
                        }
                    }, 10050);
                } else {
                    hiddenAt = 0;
                    markUserInteraction();
                }
            });

            setInterval(() => {
                if (!contactsDirty) return;
                if (document.visibilityState === 'hidden') return;
                if (Date.now() - lastInteractionAt >= 30000) {
                    flushSaveQueue('idle-30s');
                    if (window.nexoStore?.flushDeltas) window.nexoStore.flushDeltas('idle-30s').catch(() => {});
                }
            }, 5000);

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    closeAllOverlays();
                    return;
                }
                if (e.ctrlKey && e.key === 'z' && !e.target.matches('input, textarea')) {
                    e.preventDefault();
                    undoToLastContact();
                    return;
                }
                if ((e.ctrlKey || e.metaKey) && ['+', '=', '-','0'].includes(e.key) && !e.target.matches('input, textarea')) {
                    e.preventDefault();
                    if (e.key === '+' || e.key === '=') window.electronAPI?.zoomIn?.();
                    else if (e.key === '-') window.electronAPI?.zoomOut?.();
                    else if (e.key === '0') window.electronAPI?.zoomReset?.();
                    return;
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !e.target.matches('input, textarea, select')) {
                    e.preventDefault();
                    applyFilters();
                    AppState.filteredContacts.forEach(c => AppState.selectedContacts.add(c.id));
                    updateBulkActionsBar();
                    render();
                    return;
                }
                if (e.target.matches('input, textarea, select')) return;
                const code = e.code;
                const selectedId = Array.from(AppState.selectedContacts)[0] || AppState.lastEditedContact;
                if (code === 'Numpad1' && selectedId) changeContactStatus(selectedId, 'sin revisar');
                else if (code === 'Numpad2' && selectedId) changeContactStatus(selectedId, 'contactado');
                else if (code === 'Numpad3' && selectedId) changeContactStatus(selectedId, 'jugando');
                else if (code === 'Numpad4' && selectedId) changeContactStatus(selectedId, 'sin wsp');
                else if (code === 'Numpad5' && selectedId) changeContactStatus(selectedId, 'no interesado');
                else if (code === 'Numpad0') undoToLastContact();
                else if (code === 'NumpadAdd') elements.viewListBtn.click();
            });

            document.addEventListener('wheel', (e) => {
                if (!(e.ctrlKey || e.metaKey)) return;
                e.preventDefault();
                if (e.deltaY < 0) window.electronAPI?.zoomIn?.();
                else window.electronAPI?.zoomOut?.();
            }, { passive: false });

            elements.statusFilter.onchange = (e) => {
                AppState.statusFilter = e.target.value;
                AppState.currentPage = 1;
                render();
            };

            elements.originFilter.onchange = (e) => {
                AppState.originFilter = e.target.value;
                AppState.currentPage = 1;
                render();
            };

            if (elements.opsSegmentFilter) {
                elements.opsSegmentFilter.onchange = (e) => {
                    AppState.opsFilter = e.target.value;
                    AppState.currentPage = 1;
                    render();
                };
            }
            if (elements.shiftFilter) {
                elements.shiftFilter.onchange = (e) => {
                    AppState.shiftFilter = e.target.value;
                    AppState.currentPage = 1;
                    render();
                };
            }

            if (elements.phoneFilter) {
                elements.phoneFilter.onchange = (e) => {
                    AppState.phoneFilter = e.target.value;
                    AppState.currentPage = 1;
                    render();
                };
            }
            if (elements.editActivityFilter) {
                elements.editActivityFilter.onchange = (e) => {
                    AppState.editActivityFilter = e.target.value;
                    AppState.currentPage = 1;
                    render();
                };
            }

            if (elements.clearFiltersBtn) {
                elements.clearFiltersBtn.onclick = () => {
                    AppState.searchTerm = '';
                    AppState.statusFilter = '';
                    AppState.originFilter = '';
                    AppState.opsFilter = 'all';
                    AppState.shiftFilter = '';
                    AppState.phoneFilter = 'all';
                    AppState.editActivityFilter = 'all';
                    AppState.currentPage = 1;
                    elements.searchInput.value = '';
                    elements.statusFilter.value = '';
                    elements.originFilter.value = '';
                    if (elements.opsSegmentFilter) elements.opsSegmentFilter.value = 'all';
                    if (elements.shiftFilter) elements.shiftFilter.value = '';
                    if (elements.phoneFilter) elements.phoneFilter.value = 'all';
                    if (elements.editActivityFilter) elements.editActivityFilter.value = 'all';
                    render();
                };
            }

            if (elements.selectFilteredBtn) {
                elements.selectFilteredBtn.onclick = () => {
                    applyFilters();
                    const start = (AppState.currentPage - 1) * AppState.itemsPerPage;
                    const end = start + AppState.itemsPerPage;
                    const visibleContacts = AppState.filteredContacts.slice(start, end);
                    visibleContacts.forEach(c => AppState.selectedContacts.add(c.id));
                    showNotification(`Seleccionados ${visibleContacts.length} contactos visibles`, 'success');
                    updateBulkActionsBar();
                    render();
                };
            }

            if (elements.clearSelectionBtn) {
                elements.clearSelectionBtn.onclick = () => {
                    const removed = AppState.selectedContacts.size;
                    AppState.selectedContacts.clear();
                    AppState.lastSelectedContactId = null;
                    if (removed) showNotification('Selección limpiada', 'info');
                    updateBulkActionsBar();
                    render();
                };
            }

            elements.viewCardsBtn.onclick = () => {
                withSoftTransition(() => {
                    AppState.currentView = 'cards';
                    elements.viewCardsBtn.classList.add('active');
                    elements.viewListBtn.classList.remove('active');
                    if (elements.viewShiftsBtn) elements.viewShiftsBtn.classList.remove('active');
                    elements.cardsView.style.display = 'grid';
                    elements.listView.style.display = 'none';
                    elements.shiftsView.style.display = 'none';
                    render();
                });
            };

            elements.viewListBtn.onclick = () => {
                withSoftTransition(() => {
                    AppState.currentView = 'list';
                    elements.viewListBtn.classList.add('active');
                    elements.viewCardsBtn.classList.remove('active');
                    if (elements.viewShiftsBtn) elements.viewShiftsBtn.classList.remove('active');
                    elements.listView.style.display = 'block';
                    elements.cardsView.style.display = 'none';
                    elements.shiftsView.style.display = 'none';
                    render();
                });
            };

            if (elements.viewShiftsBtn) {
                elements.viewShiftsBtn.onclick = () => {
                    withSoftTransition(() => {
                        AppState.currentView = 'shifts';
                        AppState.selectedContacts.clear();
                        updateBulkActionsBar();
                        elements.viewShiftsBtn.classList.add('active');
                        elements.viewCardsBtn.classList.remove('active');
                        elements.viewListBtn.classList.remove('active');
                        render();
                    });
                };
            }

            $$('.stat-box').forEach(box => {
                box.onclick = () => {
                    const filter = box.dataset.filter;
                    if (box === elements.duplicatesStatBox) {
                        showDuplicatesModal();
                        return;
                    }
                    
                    $$('.stat-box').forEach(b => b.classList.remove('active'));
                    if (AppState.statusFilter === filter) {
                        AppState.statusFilter = '';
                    } else {
                        AppState.statusFilter = filter;
                        box.classList.add('active');
                    }
                    elements.statusFilter.value = AppState.statusFilter;
                    render();
                };
            });

            const unifiedEventHandler = (e) => {
                const card = e.target.closest('.contact-card, .list-item');
                if (!card) return;
                
                const id = parseFloat(card.dataset.id);
                if (isNaN(id)) return;

                const isCheckbox = e.target.matches('input[type="checkbox"]');
                const isButton = e.target.closest('button');
                const isInteractive = e.target.closest('button, select, option, input[type="text"], textarea, .card-status-inline, .status-badge, .card-status-menu, .card-status-option, .whatsapp-btn');
                
                if (isInteractive && !isCheckbox) return;
                
                if (isCheckbox) {
                     if (e.target.checked) AppState.selectedContacts.add(id);
                     else AppState.selectedContacts.delete(id);
                     AppState.lastSelectedContactId = id;
                     setSaveState('pending', 'Selección local');
                } else if (e.shiftKey && AppState.lastSelectedContactId !== null) {
                     const currentIndex = AppState.filteredContacts.findIndex(c => c.id === id);
                     const lastIndex = AppState.filteredContacts.findIndex(c => c.id === AppState.lastSelectedContactId);
                     if (currentIndex !== -1 && lastIndex !== -1) {
                        const [start, end] = currentIndex < lastIndex ? [currentIndex, lastIndex] : [lastIndex, currentIndex];
                        for (let i = start; i <= end; i++) {
                            AppState.selectedContacts.add(AppState.filteredContacts[i].id);
                        }
                     } else {
                        AppState.selectedContacts.add(id);
                     }
                } else if (e.ctrlKey || e.metaKey) {
                     if (AppState.selectedContacts.has(id)) AppState.selectedContacts.delete(id);
                     else AppState.selectedContacts.add(id);
                     AppState.lastSelectedContactId = id;
                } else {
                     AppState.selectedContacts.clear();
                     AppState.selectedContacts.add(id);
                     AppState.lastSelectedContactId = id;
                }
                
                updateBulkActionsBar();
                elements.pagination.style.display = 'flex';
                if (AppState.currentView === 'shifts') {
                elements.cardsView.style.display = 'none';
                elements.listView.style.display = 'none';
                elements.pagination.style.display = 'none';
                renderShiftsView();
            } else {
                elements.shiftsView.style.display = 'none';
                renderPaginatedView(AppState.currentView === 'cards' ? createCard : createListItem);
            }
            };

            const unifiedDblClickHandler = (e) => {
                const target = e.target.closest('[data-field]');
                if (!target) return;
                
                const card = e.target.closest('.contact-card, .list-item');
                const id = parseFloat(card.dataset.id);
                const field = target.dataset.field;
                const contact = AppState.searchIndex?.byId?.get(id) || AppState.contacts.find(c => c.id === id);
                
                if (!contact) return;
                
                const originalValue = target.textContent.trim();
                let hasSaved = false;

                if (field === 'status') {
                    const select = document.createElement('select');
                    select.className = 'filter-select';
                    select.style.width = '100%';
                    select.innerHTML = STATUS_OPTIONS.map(opt => 
                        `<option value="${opt.id}" ${opt.id === contact.status ? 'selected' : ''}>${opt.label}</option>`
                    ).join('');
                    target.textContent = '';
                    target.appendChild(select);
                    select.focus();
                    
                    const save = () => {
                        if (hasSaved) return;
                        hasSaved = true;
                        const oldStatus = contact.status;
                        contact.status = select.value;
                        updateCompetitionCredit(contact, select.value, 'common');
                        setReviewMetadata(contact, select.value);
                        touchContactEdit(contact, 'inline_status');
                        addToHistory('Estado cambiado', `${contact.name}: ${oldStatus} → ${select.value}`);
                        saveData();
                        render();
                    };
                    
                    select.onblur = save;
                    select.onchange = save;
                }
            };
            
            $$('#cardsView, #listView').forEach(el => {
                el.addEventListener('click', unifiedEventHandler);
                el.addEventListener('dblclick', unifiedDblClickHandler);
            });

            $('#bulkDeleteBtn').onclick = () => {
                if(AppState.selectedContacts.size > 0 && confirm(`¿Eliminar ${AppState.selectedContacts.size} contactos seleccionados?`)) {
                    const selectedCount = AppState.selectedContacts.size;
                    AppState.contacts = AppState.contacts.filter(c => !AppState.selectedContacts.has(c.id));
                    AppState.selectedContacts.clear();
                    addToHistory('Eliminación masiva', `${selectedCount} contactos eliminados`);
                    saveData();
                    render();
                    showNotification(`${selectedCount} contactos eliminados.`, 'success');
                }
            };

            $('#bulkStatusSelect').onchange = (e) => {
                const newStatus = e.target.value;
                if (AppState.selectedContacts.size > 0 && newStatus) {
                   const selectedCount = AppState.selectedContacts.size;
                   AppState.selectedContacts.forEach(id => {
                        const contact = AppState.searchIndex?.byId?.get(id) || AppState.contacts.find(c => c.id === id);
                        if (contact) {
                            contact.status = newStatus;
                            updateCompetitionCredit(contact, newStatus, 'common');
                            setReviewMetadata(contact, newStatus);
                            touchContactEdit(contact, 'inline_status');
                        }
                   });
                   addToHistory('Cambio de estado masivo', `${selectedCount} contactos → ${newStatus}`);
                   AppState.selectedContacts.clear();
                   saveData();
                   render();
                   showNotification(`${selectedCount} contactos actualizados.`, 'success');
                   e.target.value = "";
                }
            };

            $('#bulkCancelBtn').onclick = () => {
                AppState.selectedContacts.clear();
                render();
            };

            $('#exportBtn').onclick = () => {
                const pid = AppState.activeProfileId || 'default';
                const profileContacts = AppState.contacts.filter(c => (c.profileId || 'default') === pid);
                const profileName = (AppState.profiles || []).find(p => p.id === pid)?.name || 'Base principal';
                $('#exportFilteredCount').textContent = `${AppState.filteredContacts.length} contactos`;
                $('#exportAllCount').textContent = `${profileContacts.length} contactos (${profileName})`;
                $('#exportModal').classList.add('active');
            };

            $('#cancelExport').onclick = () => $('#exportModal').classList.remove('active');

            $('#confirmExport').onclick = () => {
                const selectedTypeEl = $('#exportModal .export-option[data-type].selected');
                const selectedFormatEl = $('#exportModal .export-option[data-format].selected');
                const type = selectedTypeEl ? selectedTypeEl.dataset.type : 'all';
                const format = selectedFormatEl ? selectedFormatEl.dataset.format : 'sheet';
                const pid = AppState.activeProfileId || 'default';
                const profileContacts = AppState.contacts.filter(c => (c.profileId || 'default') === pid);
                const contactsToExport = type === 'filtered' ? AppState.filteredContacts : profileContacts;

                if (!contactsToExport.length) {
                    showNotification('No hay contactos para exportar', 'warning');
                    return;
                }

                if (format === 'vcf') exportToVCF(contactsToExport);
                else exportToSheetFormat(contactsToExport);

                localStorage.setItem('lastExportAt', new Date().toISOString());
                updateExportUrgencyBadge();
                $('#exportModal').classList.remove('active');
            };

            $$('#exportModal .export-option').forEach(opt => opt.onclick = (e) => {
                const option = e.target.closest('.export-option');
                const group = option.dataset.type ? '[data-type]' : '[data-format]';
                $$(`#exportModal .export-option${group}`).forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
            });

            elements.manageDuplicatesBtn.onclick = showDuplicatesModal;
            $('#closeDuplicatesModal').onclick = () => $('#duplicatesModal').classList.remove('active');
            $('#mergeAllDuplicates').onclick = () => {
                if (confirm('¿Fusionar todos los duplicados? Esta acción no se puede deshacer.')) {
                    mergeAllDuplicates();
                }
            };

            elements.historyBtn.onclick = showHistoryModal;
            $('#closeHistoryModal').onclick = () => $('#historyModal').classList.remove('active');
            if ($('#closeContactHistoryModal')) $('#closeContactHistoryModal').onclick = () => $('#contactHistoryModal').classList.remove('active');
            $('#clearHistoryBtn').onclick = () => {
                if (confirm('¿Borrar todo el historial?')) {
                    AppState.history = [];
                    saveHistory();
                    $('#historyModal').classList.remove('active');
                    showNotification('Historial borrado', 'success');
                }
            };

            $('#cancelAddSingle').onclick = () => {
                resetAddSingleModalState();
                $('#addSingleModal').classList.remove('active');
            };

            $('#confirmAddSingle').onclick = () => {
                const name = $('#singleName').value.trim();
                const phone = normalizePhoneNumber($('#singlePhone').value.trim());
                const origin = $('#singleOrigin').value.trim() || 'Manual';
                const status = $('#singleStatus').value;

                if (!name) {
                    showNotification('El nombre es obligatorio', 'error');
                    return;
                }

                if (AppState.editingContactId) {
                    const contact = AppState.contacts.find(c => c.id === AppState.editingContactId);
                    if (!contact) {
                        showNotification('No se encontró el contacto a editar', 'error');
                        resetAddSingleModalState();
                        $('#addSingleModal').classList.remove('active');
                        return;
                    }
                    const oldSnapshot = `${contact.name} | ${contact.phone || 'sin teléfono'} | ${contact.origin || 'Manual'} | ${contact.status || 'sin revisar'}`;
                    contact.name = name;
                    contact.phone = phone;
                    contact.origin = origin;
                    if (contact.status !== status) {
                        setReviewMetadata(contact, status);
                    }
                    contact.status = status;
                    updateCompetitionCredit(contact, status, 'common');
                    touchContactEdit(contact, 'modal_edit');
                    AppState.lastEditedContact = contact.id;
                    const newSnapshot = `${contact.name} | ${contact.phone || 'sin teléfono'} | ${contact.origin || 'Manual'} | ${contact.status || 'sin revisar'}`;
                    addToHistory('Contacto editado', `${oldSnapshot} → ${newSnapshot}`, contact.id);
                    detectDuplicates();
                    // Actualizar índice del contacto editado sin rebuild completo
                    addContactToIndex(contact);
                    AppState.searchIndexDirty = false;
                    saveData();
                    render();
                    resetAddSingleModalState();
                    $('#addSingleModal').classList.remove('active');
                    showNotification('✅ Contacto actualizado', 'success');
                    return;
                }

                const newContact = {
                    id: Date.now() + Math.random(),
                    name: name,
                    phone: phone,
                    origin: origin,
                    status: status,
                    lastUpdated: new Date().toISOString(),
                    lastEditedAt: new Date().toISOString(),
                    lastEditReason: 'manual_create',
                    recontactAttempts: 0,
                    isDuplicate: false
                };

                // Asignar profileId al nuevo contacto
                newContact.profileId = AppState.activeProfileId || 'default';
                AppState.contacts.push(newContact);
                // Indexar inmediatamente sin reconstruir todo el índice
                addContactToIndex(newContact);
                AppState.lastEditedContact = newContact.id;
                recordMetricEvent('user_created', { profileId: AppState.activeProfileId || 'default', contactId: newContact.id, status: newContact.status, selectionType: 'manual' });
                addToHistory('Contacto agregado manualmente', name);
                detectDuplicates();
                saveData();
                // render con índice ya actualizado — la búsqueda funciona al instante
                AppState.searchIndexDirty = false;
                render();
                resetAddSingleModalState();
                $('#addSingleModal').classList.remove('active');
                showNotification('✅ Contacto agregado — ya podés buscarlo', 'success');
            };

            $('#deleteAllBtn').onclick = async () => {
                if (!confirm('⚠️ ¿BORRAR TODOS LOS CONTACTOS? Esta acción NO se puede deshacer.')) return;
                if (!confirm('Confirmación final: se vaciará la base de contactos actual para volver a subir desde cero.')) return;
                try {
                    const count = AppState.contacts.length;
                    setLoadingState(true, 'Limpiando base…', 35, false);
                    await new Promise((r) => setTimeout(r, 0));
                    AppState.contacts = [];
                    AppState.filteredContacts = [];
                    AppState.duplicates = [];
                    AppState.undoStack = [];
                    AppState.lastEditedContact = null;
                    AppState.selectedContacts.clear();
                    AppState.currentPage = 1;
                    setLoadingState(true, 'Guardando limpieza…', 80, false);
                    saveDataImmediate();
                    addToHistory('Todos los contactos eliminados', `${count} contactos borrados`);
                    saveHistory();
                    render();
                    setLoadingState(false, 'Listo', 100, false);
                    showNotification(`${count} contactos eliminados`, 'success');
                } catch (clearErr) {
                    reportError('deleteAllBtn', clearErr);
                    setLoadingState(false, 'Error', 100, false);
                    showNotification(`No se pudo limpiar la base: ${clearErr?.message || clearErr}`, 'error');
                }
            };

        // Exponer función de inicialización globalmente
        window.initNexoApp = init;
        window.NexoActions = {
            render,
            saveData,
            applyFilters,
            setLoadingState,
            loadData,
            flushSaveQueue,
            remountDashboardState,
            reportError,
            normalizeProfileName,
            normalizeSearchText,
            savePreferences,
            ensureActiveProfile,
            syncProfilesFromMain,
            ensureProfileByName,
            detectDuplicates,
            renderShiftsView,
            getStatusOption,
            getLocalCompetitionShift,
            showNotification,
            addToHistory,
            saveStatusTransitions,
            saveButtonPressEvents,
            saveShiftSnapshots,
            saveHistory,
            downloadFile,
            verifyControlPassword,
            ensureUploadUnlocked,
            queueReportUpload,
            exportFullSnapshot,
            exportDailyDelta
        };


        }

        function updateFileList() {
            if (selectedFiles.length === 0) {
                elements.fileList.innerHTML = '';
                elements.startBtn.disabled = true;
                return;
            }
            
            elements.fileList.innerHTML = selectedFiles.map((f, i) => 
                `<div class="file-item">
                    <span><i class="fas fa-file-csv"></i> ${f.name}</span>
                    <span>${(f.size / 1024).toFixed(1)} KB</span>
                </div>`
            ).join('');
            
            elements.startBtn.disabled = false;
        }

        function csvField(value) {
            if (value === null || value === undefined) return '';
            return String(value).replace(/\r?\n/g, ' ').trim();
        }

        function vcfEscape(value) {
            return String(value || '')
                .replace(/\\/g, '\\\\')
                .replace(/;/g, '\\;')
                .replace(/,/g, '\\,')
                .replace(/\r?\n/g, '\\n');
        }

        function formatCsvField(value) {
            if (value === null || value === undefined) return '""';
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return `"${stringValue}"`;
        }

        function exportToVCF(contacts) {
            const lines = [];
            contacts.forEach(c => {
                const name = csvField(c.name) || 'Sin nombre';
                const phone = normalizePhoneNumber(c.phone || '');
                lines.push('BEGIN:VCARD');
                lines.push('VERSION:3.0');
                lines.push(`N:${vcfEscape(name)};;;;`);
                lines.push(`FN:${vcfEscape(name)}`);
                if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
                lines.push(`NOTE:${vcfEscape(`Origen: ${c.origin || '-'} | Estado: ${c.status || '-'}`)}`);
                lines.push('END:VCARD');
            });
            const vcfContent = lines.join('\r\n') + '\r\n';
            downloadFile(vcfContent, `contactos_${new Date().toISOString().split('T')[0]}.vcf`, 'text/vcard;charset=utf-8');
            showNotification('✅ VCF real exportado (compatible con celulares)', 'success');
        }

        function parseVCF(text) {
            const contacts = [];
            const vcards = text.split('BEGIN:VCARD').filter(v => v.trim());
            
            vcards.forEach(vcard => {
                const contact = {};
                const lines = vcard.split('\n').map(l => l.trim()).filter(Boolean);
                
                lines.forEach(line => {
                    if (line.startsWith('FN:')) {
                        contact.name = line.substring(3).trim();
                    } else if (line.startsWith('TEL')) {
                        const phoneMatch = line.match(/:([\d+]+)/);
                        if (phoneMatch) {
                            contact.phone = normalizePhoneNumber(phoneMatch[1]);
                        }
                    } else if (line.startsWith('NOTE:')) {
                        const noteText = line.substring(5);
                        
                        const origenMatch = noteText.match(/Origen:\s*([^,]+)/);
                        if (origenMatch) {
                            contact.origin = origenMatch[1].trim();
                        }
                        
                        const estadoMatch = noteText.match(/Estado:\s*(.+)/);
                        if (estadoMatch) {
                            const estado = estadoMatch[1].trim().toLowerCase();
                            if (estado.includes('contactado')) contact.status = 'contactado';
                            else if (estado.includes('jugando')) contact.status = 'jugando';
                            else if (estado.includes('revisado') || estado.includes('verificado')) contact.status = 'revisado';
                            else if (estado.includes('sin wsp')) contact.status = 'sin wsp';
                            else if (estado.includes('no interesado')) contact.status = 'no interesado';
                            else contact.status = 'sin revisar';
                        }
                    }
                });
                
                if (contact.name) {
                    if (!contact.status) contact.status = 'sin revisar';
                    if (!contact.origin) contact.origin = 'VCF Importado';
                    if (!contact.phone) contact.phone = '';
                    contacts.push(contact);
                }
            });
            
            return contacts;
        }

        function exportToSheetFormat(contacts) {
            const headers = "usuarios,alias,estado de revision,telefono,estado actual,cargas,descargas,neto,score,lealtad,ultima actividad,\"VISTO, RESPONDIDO?\",RECUPERADO,TURNO DE LAS CARGAS,interesado en jugar?,ya contactados,recuperados!,actualmente cargando,TURNO MAÑANA,TURNO TARDE,TURNO NOCHE,contactos a borrar\n";
            
            const statusToSheetStatus = (status) => {
                const map = { 'contactado': 'promo enviada', 'revisado': 'REVISADO', 'sin wsp': 'NO ESTA EN WSP', 'sin revisar': 'A CONTACTAR', 'jugando': 'EN CONTACTO', 'no interesado': 'ELIMINADO' };
                return map[status] || 'SIN REVISAR';
            };

            const yaContactados = contacts.filter(c => c.status === 'contactado').map(c => c.name);
            const recuperados = contacts.filter(c => c.status === 'jugando').map(c => c.name);
            const actualmenteCargando = contacts.filter(c => c.origin && c.origin.toLowerCase().includes('cargando')).map(c => c.name);
            const turnoManana = contacts.filter(c => c.origin && c.origin.toLowerCase().includes('mañana')).map(c => c.name);
            const turnoTarde = contacts.filter(c => c.origin && c.origin.toLowerCase().includes('tarde')).map(c => c.name);
            const turnoNoche = contacts.filter(c => c.origin && c.origin.toLowerCase().includes('noche')).map(c => c.name);
            const aBorrar = contacts.filter(c => c.status === 'no interesado' || c.markedForCleanup).map(c => c.name);

            const maxLength = Math.max(contacts.length, yaContactados.length, recuperados.length, actualmenteCargando.length, turnoManana.length, turnoTarde.length, turnoNoche.length, aBorrar.length);
            
            let csvContent = headers;

            for (let i = 0; i < maxLength; i++) {
                const mainContact = contacts[i];
                const row = [
                    mainContact ? formatCsvField(mainContact.name) : '',
                    mainContact ? formatCsvField(mainContact.alias || extractPrimaryAlias(mainContact.name || '')) : '',
                    mainContact ? formatCsvField(statusToSheetStatus(mainContact.status)) : '',
                    mainContact && mainContact.phone ? formatCsvField(mainContact.phone) : '',
                    mainContact ? formatCsvField(statusToSheetStatus(mainContact.status)) : '',
                    mainContact ? formatCsvField(mainContact.ops?.cargasCount || 0) : '',
                    mainContact ? formatCsvField(mainContact.ops?.descargasCount || 0) : '',
                    mainContact ? formatCsvField(Math.round(mainContact.ops?.netoTotal || 0)) : '',
                    mainContact ? formatCsvField(mainContact.ops?.score || 0) : '',
                    mainContact ? formatCsvField(mainContact.ops?.loyalty || 0) : '',
                    mainContact && mainContact.ops?.lastCargaAt ? formatCsvField(new Date(mainContact.ops.lastCargaAt).toLocaleString('es-ES')) : '',
                    'NO', 'NO', '', 'NO',
                    formatCsvField(yaContactados[i]),
                    formatCsvField(recuperados[i]),
                    formatCsvField(actualmenteCargando[i]),
                    formatCsvField(turnoManana[i]),
                    formatCsvField(turnoTarde[i]),
                    formatCsvField(turnoNoche[i]),
                    formatCsvField(aBorrar[i])
                ];
                csvContent += row.join(',') + '\n';
            }

            const shiftTotals = { tm: 0, tt: 0, tn: 0 };
            contacts.forEach((c) => {
                const key = String(c.shiftReviewedByShift || '').toLowerCase();
                if (shiftTotals[key] !== undefined) shiftTotals[key]++;
            });
            const originsCount = {};
            contacts.forEach((c) => {
                const o = (c.origin || 'Sin origen').toString();
                originsCount[o] = (originsCount[o] || 0) + 1;
            });
            csvContent += '\n\n';
            csvContent += 'META_LOG,TIPO,VALOR\n';
            csvContent += `META_LOG,exportado_en,${formatCsvField(new Date().toISOString())}\n`;
            csvContent += `META_LOG,total_contactos,${contacts.length}\n`;
            csvContent += `META_LOG,turno_manana,${shiftTotals.tm}\n`;
            csvContent += `META_LOG,turno_tarde,${shiftTotals.tt}\n`;
            csvContent += `META_LOG,turno_noche,${shiftTotals.tn}\n`;
            Object.entries(originsCount).forEach(([originName, qty]) => {
                csvContent += `META_LOG,origen_${formatCsvField(originName)},${qty}\n`;
            });

            downloadFile(csvContent, `planilla_exportada_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
            showNotification('Exportación completada con teléfonos', 'success');
        }

        function downloadFile(content, fileName, mimeType) {
            const bom = mimeType.includes('csv') ? '\uFEFF' : '';
            const blob = new Blob([bom + content], { type: mimeType });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        async function init() {
            try {
                await (window.__nexoStoreReady || Promise.resolve());
                try {
                    const version = await window.electronAPI?.getAppVersion?.();
                    if (version) {
                        const safeVersion = String(version || '').replace(/^v/i, '');
                        document.title = `Nexo Desktop v${safeVersion}`;
                        const h1 = document.querySelector('#uploadScreen h1');
                        if (h1) h1.textContent = `Gestor de Contactos Masivo · v${safeVersion}`;
                    }
                } catch (e) {
                    reportError('init:getAppVersion', e);
                }
                elements.bulkStatusSelect.innerHTML = `<option value="" disabled selected>Cambiar estado</option>` + STATUS_OPTIONS.map(opt => `<option value="${opt.id}">${opt.label}</option>`).join('');
                setupEventListeners();
                if (window.electronAPI?.onDeepLinkImport) {
                    window.electronAPI.onDeepLinkImport((payload) => {
                        const filePath = String(payload?.file || '');
                        elements.uploadScreen.classList.remove('hidden');
                        showNotification(filePath ? `Deep link import recibido: ${filePath}` : 'Deep link import recibido', 'info');
                    });
                }

                window.nexoUpdaterDiagnostics = async () => {
                    const diag = await window.electronAPI?.getUpdaterDiagnostics?.();
                    console.table(diag || {});
                    return diag || {};
                };
                loadHistory();
                loadPreferences();
                await syncProfilesFromMain();
                AppState.currentPage = Math.max(1, Number(AppState.profilePageMap?.[AppState.activeProfileId || 'default'] || AppState.currentPage || 1));
                AppState.themeCatalog = { ...getDefaultThemes(), ...(AppState.themeCatalog || {}) };
                if (!AppState.themeCatalog[AppState.activeThemeId]) AppState.activeThemeId = 'whaticket-blue';
                applyTheme(AppState.activeThemeId);
                ensureActiveProfile();
                try {
                    if (typeof refreshProfilesUI === 'function') refreshProfilesUI();
                } catch (refreshError) {
                    reportError('init:refreshProfilesUI', refreshError);
                }
                loadOpsData();
                setLoadingState(true, 'Hidratando datos…', 8, false);
                await perfMark('init/hidratacion', async () => loadData());
                window.restoreShiftModeMemory?.();
                window.initProfilesLogic?.();
                window.initSyncManager?.();
                ensureReviewMilestonesState();
                if (Date.now() - lastStorageDiagAt > 15000) {
                    lastStorageDiagAt = Date.now();
                    refreshStorageDiagnostics();
                }
                updateExportUrgencyBadge();
                setInterval(() => { if (AppState.contacts.length) render(); else updateExportUrgencyBadge(); }, 300000);
                setInterval(() => { refreshStorageDiagnostics(); }, 45000);
                setInterval(() => {
                    if (!AppState.contacts.length) return;
                    maybeDownloadAutomaticBackup('interval');
                }, 60000);
            } catch (e) {
                console.error("Error fatal en la inicialización:", e);
                document.body.innerHTML = "<h1>Error Crítico</h1><p>La aplicación no pudo iniciarse. Por favor, borra la caché y los datos del sitio e inténtalo de nuevo.</p>";
            } finally {
                try {
                    setLoadingState(false, 'Listo', 100, false);
                    const hasContacts = (AppState.contacts?.length || 0) > 0;
                    const uploadScreenEl = elements.uploadScreen || $('#uploadScreen');
                    const mainAppEl = elements.mainApp || $('#mainApp');
                    if (uploadScreenEl) uploadScreenEl.classList.toggle('hidden', hasContacts);
                    if (mainAppEl) mainAppEl.style.display = hasContacts ? 'block' : 'none';
                } catch (uiFinalizeError) {
                    reportError('init:finalize-ui', uiFinalizeError);
                }
            }
        }


        // Exposición controlada para scripts separados (estado y helpers compartidos)
        window.AppState = AppState;
        window.NexoElements = elements;
        
        // Inicialización con Bridge Pattern
        (async () => {
            try {
                console.log('[NEXO-APP] 🚀 Iniciando con NexoBridge...');
                
                // 1. Poblar elementos del dashboard
                window.NexoBridge.populateElements();
                
                // 2. Esperar a que todos los módulos estén listos
                await window.NexoBridge.waitFor('auth', 'shifts', 'sync', 'profiles');
                
                // 3. Inicializar aplicación
                console.log('[NEXO-APP] ✅ Todos los módulos listos, iniciando app...');
                init();
                
            } catch (error) {
                console.error('[NEXO-APP] ❌ Error en inicialización:', error);
                // Fallback: intentar iniciar de todos modos
                try {
                    init();
                } catch (fallbackError) {
                    console.error('[NEXO-APP] ❌ Error fatal en fallback:', fallbackError);
                }
            }
        })();

    })(); // cierre IIFE exterior
