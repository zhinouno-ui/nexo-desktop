/**
 * Módulo de diagnóstico para detectar deadlocks en promesas asíncronas
 * Se integra sin modificar el código principal de nexo-app.js
 */

(() => {
    'use strict';

    /**
     * Envuelve una promesa en una carrera contra un temporizador.
     * Si la promesa no se resuelve/rechaza antes de 'ms', la carrera la gana
     * una promesa de timeout que rechaza con un error informativo.
     * 
     * @param {Promise} promise La promesa que queremos vigilar.
     * @param {number} ms El tiempo máximo de espera en milisegundos.
     * @param {string} promiseName Un nombre para identificar la operación en el mensaje de error.
     * @returns {Promise}
     */
    const withTimeout = (promise, ms, promiseName = 'Operación Asíncrona') => {
        let timeoutId = null;

        // Creamos una promesa que rechazará después de 'ms' milisegundos
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`[TIMEOUT] La operación '${promiseName}' excedió el límite de ${ms}ms.`));
            }, ms);
        });

        // Promise.race() devuelve la primera promesa que se resuelva o rechace.
        return Promise.race([
            promise,
            timeoutPromise
        ]).finally(() => {
            // Es importante limpiar el timeout para evitar que se ejecute si la promesa original termina a tiempo.
            clearTimeout(timeoutId);
        });
    };

    /**
     * Versión de diagnóstico de la función init() principal
     * Esta función reemplaza temporalmente a la original para detectar dónde se cuelga
     */
    const initWithDiagnostics = async () => {
        try {
            console.log('🔍 [DIAGNÓSTICO] Iniciando secuencia de arranque con timeout...');
            
            // 1. Vigilamos __nexoStoreReady (que contiene getAll)
            console.log('🔍 [DIAGNÓSTICO] Paso 1/3: Esperando window.__nexoStoreReady...');
            await withTimeout(window.__nexoStoreReady, 5000, 'window.__nexoStoreReady');
            console.log('✅ [DIAGNÓSTICO] Paso 1/3: OK - __nexoStoreReady completado.');

            // 2. Vigilamos la obtención de versión
            console.log('🔍 [DIAGNÓSTICO] Paso 2/3: Esperando getAppVersion...');
            const version = await withTimeout(
                window.electronAPI?.getAppVersion?.() || Promise.resolve('unknown'), 
                3000, 
                'getAppVersion'
            );
            console.log(`✅ [DIAGNÓSTICO] Paso 2/3: OK - getAppVersion completado. Versión: ${version}`);

            // 3. Simulamos la carga de contactos (esto está dentro del init original)
            console.log('🔍 [DIAGNÓSTICO] Paso 3/3: Simulando carga de contactos...');
            // Nota: La carga real de contactos ocurre después en el código original
            await withTimeout(Promise.resolve(), 1000, 'simulación-carga-contactos');
            console.log('✅ [DIAGNÓSTICO] Paso 3/3: OK - Simulación completada.');

            console.log('🎉 [DIAGNÓSTICO] ¡Secuencia de arranque finalizada con éxito!');
            
            // Si llegamos aquí, el problema está después del init
            console.log('🔍 [DIAGNÓSTICO] El problema NO está en init(). Buscando en el renderizado...');
            
            // Llamamos a la función init original si existe
            if (typeof window.originalInit === 'function') {
                console.log('🔍 [DIAGNÓSTICO] Ejecutando init() original...');
                await window.originalInit();
            }

        } catch (e) {
            // Este bloque ahora SÍ se ejecutará, ya sea por un error real o por nuestro timeout.
            console.error('❌ ----------------------------------------------------');
            console.error('❌ ¡FALLO CRÍTICO DURANTE LA INICIALIZACIÓN!', e);
            console.error('❌ ----------------------------------------------------');
            
            // Mostramos error en pantalla para el usuario
            document.body.innerHTML = `
                <div style="color:red; padding: 20px; font-family: Arial, sans-serif;">
                    <h1>❌ Error de Inicialización Detectado</h1>
                    <h2>Diagnóstico del Deadlock:</h2>
                    <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; overflow: auto;">${e.stack || e.message}</pre>
                    <p><strong>Acción recomendada:</strong> Revisa la consola para más detalles y verifica el proceso Main de Electron.</p>
                    <button onclick="location.reload()" style="padding: 10px 20px; background: #007acc; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        🔄 Reintentar
                    </button>
                </div>
            `;
        }
    };

    /**
     * Función para diagnosticar específicamente el bootstrap-store
     */
    const diagnoseBootstrapStore = async () => {
        try {
            console.log('🔍 [BOOTSTRAP] Diagnosticando bootstrap-store.js...');
            
            // Verificamos si el puente IPC existe
            if (!window.nexoStore || typeof window.nexoStore.getAll !== 'function') {
                console.log('❌ [BOOTSTRAP] No se encuentra el puente nexoStore.getAll');
                return;
            }
            
            console.log('✅ [BOOTSTRAP] Puente nexoStore.getAll detectado');
            
            // Intentamos hacer getAll con timeout
            console.log('🔍 [BOOTSTRAP] Intentando getAll() con timeout de 3 segundos...');
            const result = await withTimeout(window.nexoStore.getAll(), 3000, 'nexoStore.getAll');
            console.log('✅ [BOOTSTRAP] getAll() completado:', result);
            
        } catch (e) {
            console.error('❌ [BOOTSTRAP] Error en bootstrap-store:', e);
            
            // Mostramos diagnóstico específico para IPC
            if (e.message.includes('TIMEOUT')) {
                console.error('🔍 [BOOTSTRAP] DIAGNÓSTICO: El proceso Main no responde a nexoStore.getAll()');
                console.error('🔍 [BOOTSTRAP] Posibles causas:');
                console.error('   1. ipcMain.handle("nexo-store-get-all") no existe en main.js');
                console.error('   2. El handler existe pero está bloqueado síncronamente');
                console.error('   3. El handler tiene una promesa interna que nunca se resuelve');
            }
        }
    };

    // Exponemos funciones globalmente para acceso desde la consola
    window.NexoDiagnostics = {
        withTimeout,
        initWithDiagnostics,
        diagnoseBootstrapStore,
        
        // Función para activar el modo diagnóstico
        enableDiagnosticMode() {
            console.log('🔧 [DIAGNÓSTICO] Modo diagnóstico activado');
            
            // Guardamos la función init original si existe
            if (typeof window.originalInit === 'undefined' && typeof window.init === 'function') {
                window.originalInit = window.init;
            }
            
            // Reemplazamos la función init
            window.init = initWithDiagnostics;
            
            console.log('🔧 [DIAGNÓSTICO] Función init() reemplazada con versión de diagnóstico');
        },
        
        // Función para restaurar el modo normal
        disableDiagnosticMode() {
            console.log('🔧 [DIAGNÓSTICO] Modo diagnóstico desactivado');
            
            if (typeof window.originalInit === 'function') {
                window.init = window.originalInit;
                console.log('🔧 [DIAGNÓSTICO] Función init() original restaurada');
            }
        }
    };

    // Mensaje de carga
    console.log('🔧 Módulo de diagnóstico cargado. Usa NexoDiagnostics.enableDiagnosticMode() para activar');

})();
