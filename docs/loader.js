(function () {
  function loadIife() {
    var s = document.createElement('script');
    s.src = './bundle.iife.js';
    s.defer = true;
    (document.head || document.documentElement).appendChild(s);
  }

  try {
    if (location.protocol === 'file:') {
      // Local file: avoid ESM imports due to file: CORS; use IIFE bundle
      loadIife();
      return;
    }

    // Try ESM on http(s)
    var m = document.createElement('script');
    m.type = 'module';
    m.src = './src/main.js';
    m.onerror = function () {
      // Fallback to IIFE if ESM fails to load
      loadIife();
    };
    (document.head || document.documentElement).appendChild(m);

    // Safety fallback: if app UI doesn't initialize shortly, load IIFE
    setTimeout(function () {
      try {
        var hist = document.getElementById('historyTable');
        var storage = document.getElementById('sidebar-storage');
        var initialized = !!(hist && hist.children && hist.children.length) || !!(storage && storage.children && storage.children.length);
        if (!initialized) loadIife();
      } catch {}
    }, 1500);
  } catch (e) {
    console.error('Failed to bootstrap app:', e);
    // Last resort
    try { loadIife(); } catch {}
  }
})();
