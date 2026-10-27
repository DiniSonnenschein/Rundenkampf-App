/* Kleine DOM-Helfer, die Editor und Test-Modus gemeinsam nutzen. */
(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let toastTimer = null;
  function toast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  // Zählt IDs in Reihenfolge ihres ersten Auftretens: [[id, anzahl], …]
  function countIds(ids) {
    const map = new Map();
    (ids || []).forEach((id) => map.set(id, (map.get(id) || 0) + 1));
    return Array.from(map.entries());
  }

  /**
   * Liste von Verweisen (z. B. Gegner eines Levels) mit Mengenangabe.
   * Aktionen: data-act="pick-add|pick-inc|pick-dec" mit data-key / data-id.
   */
  function picklist(key, ids, source) {
    const items = Data.Store.list(source);
    const rows = countIds(ids).map(([id, n]) => {
      const it = Data.Store.get(source, id);
      if (!it) return '';
      return '<li class="pick-row">' +
        '<span class="pick-name">' + esc(it.icon) + ' ' + esc(it.name) + '</span>' +
        '<span class="stepper">' +
        '<button type="button" data-act="pick-dec" data-key="' + key + '" data-id="' + esc(id) + '">−</button>' +
        '<b>' + n + '</b>' +
        '<button type="button" data-act="pick-inc" data-key="' + key + '" data-id="' + esc(id) + '">+</button>' +
        '</span></li>';
    }).join('');
    const options = items.map((it) => '<option value="' + esc(it.id) + '">' + esc(it.icon + ' ' + it.name) + '</option>').join('');
    return '<ul class="picklist">' + (rows || '<li class="muted">Noch nichts ausgewählt.</li>') + '</ul>' +
      (items.length
        ? '<div class="pick-add"><select data-pick-select="' + key + '">' + options + '</select>' +
          '<button type="button" data-act="pick-add" data-key="' + key + '">+ Hinzufügen</button></div>'
        : '<p class="muted">Lege zuerst ' + esc(Data.SCHEMAS[source].label) + ' an.</p>');
  }

  /** Wendet eine Picklist-Aktion auf ein ID-Array an. Gibt true zurück, wenn etwas geändert wurde. */
  function applyPick(arr, act, id) {
    if (act === 'pick-add' || act === 'pick-inc') { arr.push(id); return true; }
    if (act === 'pick-dec') {
      const i = arr.lastIndexOf(id);
      if (i >= 0) { arr.splice(i, 1); return true; }
    }
    return false;
  }

  function bar(value, max, cls) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    return '<div class="bar ' + cls + '"><div style="width:' + pct + '%"></div><span>' + value + ' / ' + max + '</span></div>';
  }

  const TILE_CLASS = { '.': 't-floor', '#': 't-wall', S: 't-start', G: 't-goal' };
  function tileClass(ch) {
    return TILE_CLASS[ch] || 't-floor';
  }

  global.UI = { esc, toast, countIds, picklist, applyPick, bar, tileClass };
})(this);
