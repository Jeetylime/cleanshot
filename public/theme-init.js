// Apply the saved theme and accessibility settings before first paint to avoid a flash.
// Kept as a file (not inline) so the Content-Security-Policy needs no 'unsafe-inline'.
try {
  var t = JSON.parse(localStorage.getItem('cleanshot:prefs') || '{}').theme || 'dark';
  if (t === 'system') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  var a = JSON.parse(localStorage.getItem('cleanshot:prefs') || '{}').a11y || {};
  var d = document.documentElement.dataset;
  if (a.textSize && a.textSize !== 'default') d.textSize = a.textSize;
  if (a.reduceMotion) d.reduceMotion = '';
  if (a.highContrast) d.highContrast = '';
  // Link underlines default to on; prefs saved before a11yRev 2 stored the old default (off). Mirrors loadA11y in src/store/store.ts.
  var p = JSON.parse(localStorage.getItem('cleanshot:prefs') || '{}');
  if (a.underlineLinks !== false || (p.a11yRev || 1) < 2) d.underlineLinks = '';
} catch (e) {}
