(function() {
  'use strict';

  const _registry = {};
  const _resolvers = {};

  window.NexoBridge = {

    register(moduleName) {
      console.log(`[NexoBridge] ✅ Módulo registrado: ${moduleName}`);
      if (_resolvers[moduleName]) {
        _resolvers[moduleName]();
      } else {
        _registry[moduleName] = Promise.resolve();
      }
    },

    waitFor(...moduleNames) {
      const promises = moduleNames.map(name => {
        if (!_registry[name]) {
          _registry[name] = new Promise(resolve => {
            _resolvers[name] = resolve;
          });
        }
        return _registry[name];
      });
      return Promise.all(promises);
    },

    populateElements() {
      window.elements = window.elements || {};
      console.log('[NexoBridge] ✅ populateElements() llamado');
    }
  };

  console.log('[NexoBridge] 🌉 Puente inicializado.');
})();