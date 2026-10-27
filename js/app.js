/* Einstieg: Navigation zwischen Erstell-Modus und Test-Modus, Import/Export. */
(function (global) {
  'use strict';

  const Store = Data.Store;
  const view = document.getElementById('view');
  const tabs = document.getElementById('tabs');
  let currentView = null;

  function show(name, opts) {
    if (currentView === 'test') TestMode.unmount();
    else if (currentView) Editor.unmount();
    currentView = name;
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    if (name === 'test') TestMode.mount(view, opts);
    else Editor.mount(view, name);
    try { localStorage.setItem('rundenkampf-view', name); } catch (e) { /* ignorieren */ }
  }

  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (b) show(b.dataset.view);
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([Store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rundenkampf-daten.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  document.getElementById('file-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Import überschreibt alle aktuellen Daten. Fortfahren?')) return;
    file.text().then((text) => {
      Store.importJson(text);
      show(currentView);
      UI.toast('Daten importiert');
    }).catch((err) => alert('Import fehlgeschlagen: ' + err.message));
  });

  document.getElementById('btn-samples').addEventListener('click', () => {
    if (!confirm('Beispieldaten laden? Deine aktuellen Daten werden überschrieben.')) return;
    Store.loadSamples();
    show(currentView);
    UI.toast('Beispieldaten geladen');
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Wirklich ALLE Level, Objekte, Allys und Gegner löschen?')) return;
    Store.clear();
    show(currentView);
    UI.toast('Alle Daten gelöscht');
  });

  // Installierbare App (PWA): Service Worker + eigener Installieren-Knopf (Chrome/Edge/Android)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Modus nicht verfügbar */ });
  }
  const installBtn = document.getElementById('btn-install');
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.finally(() => { installPrompt = null; installBtn.hidden = true; });
  });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; UI.toast('App installiert'); });

  Store.load();
  let start = 'levels';
  try { start = localStorage.getItem('rundenkampf-view') || start; } catch (e) { /* ignorieren */ }
  show(['levels', 'objects', 'allies', 'enemies', 'test'].includes(start) ? start : 'levels');

  global.App = { show };
})(this);
