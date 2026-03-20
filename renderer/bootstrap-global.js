(() => {
    console.log('[BOOTSTRAP] Inicializando puente global...');
    
    // Esperar a que todos los módulos carguen
    const waitForModules = () => {
        // Verificar que los objetos globales existan
        const requiredGlobals = [
            'AppState', 'elements', 'STATUS_OPTIONS',
            'refreshProfilesUI', 'switchProfile', 'renameProfile', 'deleteProfile',
            'persistShiftModeMemory', 'restoreShiftModeMemory', 'renameShift', 'rebalanceShift',
            'startShiftReview', 'reviewSetStatus', 'reviewPrev', 'reviewSkip', 'closeQuickReview',
            'exportSnapshot', 'exportDelta', 'importFullSnapshot',
            'ensureUploadUnlocked', 'hasAccess'
        ];
        
        const missing = requiredGlobals.filter(name => typeof window[name] === 'undefined');
        
        if (missing.length > 0) {
            console.warn('[BOOTSTRAP] Funciones faltantes:', missing);
            setTimeout(waitForModules, 100);
            return false;
        }
        
        console.log('[BOOTSTRAP] ✅ Todas las funciones globales disponibles');
        
        // Inicializar sistemas
        try {
            if (typeof window.initProfilesLogic === 'function') {
                window.initProfilesLogic();
                console.log('[BOOTSTRAP] ✅ Perfiles inicializados');
            }
            
            if (typeof window.restoreShiftModeMemory === 'function') {
                window.restoreShiftModeMemory();
                console.log('[BOOTSTRAP] ✅ Estado de turnos restaurado');
            }
            
            if (typeof window.initSyncManager === 'function') {
                window.initSyncManager();
                console.log('[BOOTSTRAP] ✅ Gestor de sincronización inicializado');
            }
            
            // Inicializar aplicación principal
            if (typeof window.initNexoApp === 'function') {
                window.initNexoApp();
                console.log('[BOOTSTRAP] ✅ Aplicación Nexo inicializada');
            }
            
        } catch (error) {
            console.error('[BOOTSTRAP] Error durante inicialización:', error);
        }
        
        return true;
    };
    
    // Si STATUS_OPTIONS no existe, crearlo
    if (!window.STATUS_OPTIONS) {
        window.STATUS_OPTIONS = [
            { id: 'sin revisar', label: 'Sin Revisar', icon: 'fa-question-circle', color: '#9ca3af', rgb: '156, 163, 175' },
            { id: 'contactado', label: 'Contactado', icon: 'fa-check-circle', color: '#10b981', rgb: '16, 185, 129' },
            { id: 'revisado', label: 'Revisado', icon: 'fa-user-check', color: '#34d399', rgb: '52, 211, 153' },
            { id: 'jugando', label: 'Jugando', icon: 'fa-gamepad', color: '#8b5cf6', rgb: '139, 92, 246' },
            { id: 'sin wsp', label: 'Sin WhatsApp', icon: 'fa-ban', color: '#f59e0b', rgb: '245, 158, 11' },
            { id: 'no interesado', label: 'No Interesado', icon: 'fa-times-circle', color: '#ef4444', rgb: '239, 68, 68' }
        ];
        console.log('[BOOTSTRAP] ✅ STATUS_OPTIONS creado');
    }
    
    // Comenzar verificación
    setTimeout(waitForModules, 500);
    
})();
