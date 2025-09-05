(function () {
  // Use the same loader everywhere (local file and GitHub Pages): IIFE bundle
  try {
    var s = document.createElement('script');
    s.src = './bundle.iife.js';
    s.defer = true;
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {
    console.error('Failed to bootstrap app:', e);
  }
})();
