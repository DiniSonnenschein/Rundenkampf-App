/* Erstell-Modus: ein generischer Editor, der sich aus den Schemas in data.js aufbaut. */
(function (global) {
  'use strict';

  const { esc } = UI;
  const Store = Data.Store;

  const MAP_TOOLS = [
    ['.', '⬜ Boden'], ['#', '🧱 Wand'], ['S', '🟦 Start'], ['G', '🏁 Ziel'],
    ['enemy', '👾 Gegner setzen'], ['erase', '✖ Gegner entfernen'],
  ];

  let root = null;
  let type = 'levels';
  let selected = {};       // zuletzt gewählter Eintrag je Typ
  let filter = '';
  let mapTool = '#';
  let mapEnemy = null;
  let painting = false;

  function schema() { return Data.SCHEMAS[type]; }
  function current() { return Store.get(type, selected[type]); }

  function mount(el, t) {
    root = el;
    type = t;
    filter = '';
    if (!current()) selected[type] = (Store.list(type)[0] || {}).id;
    root.innerHTML =
      '<div class="editor">' +
      '<aside class="panel list-panel"><div class="list-head"><h2>' + schema().icon + ' ' + esc(schema().label) + '</h2>' +
      '<button class="primary" data-act="new">+ Neu</button></div>' +
      '<input type="search" class="search" placeholder="Suchen …" data-search>' +
      '<ul class="entity-list" id="entity-list"></ul></aside>' +
      '<section class="panel form-panel" id="form-panel"></section>' +
      '</div>';
    root.onclick = onClick;
    root.oninput = onInput;
    root.onchange = onInput;
    root.onpointerdown = onPointerDown;
    root.onpointermove = onPointerMove;
    renderList();
    renderForm();
  }

  function unmount() {
    if (!root) return;
    root.onpointerdown = null;
    root.onpointermove = null;
  }

  window.addEventListener('pointerup', () => { painting = false; });
  window.addEventListener('pointercancel', () => { painting = false; });

  function renderList() {
    const ul = root.querySelector('#entity-list');
    const items = Store.list(type).filter((it) => it.name.toLowerCase().includes(filter));
    ul.innerHTML = items.map((it) =>
      '<li class="' + (it.id === selected[type] ? 'active' : '') + '" data-act="select" data-id="' + esc(it.id) + '">' +
      '<span class="ent-icon">' + esc(it.icon) + '</span>' +
      '<span class="ent-text"><b>' + esc(it.name || '(ohne Namen)') + '</b><small>' + esc(schema().summary(it)) + '</small></span></li>'
    ).join('') || '<li class="muted empty">Keine Einträge.</li>';
  }

  function renderForm() {
    const panel = root.querySelector('#form-panel');
    const it = current();
    if (!it) {
      panel.innerHTML = '<div class="empty-state"><p>Noch kein ' + esc(schema().singular) + ' vorhanden.</p>' +
        '<button class="primary" data-act="new">+ ' + esc(schema().singular) + ' erstellen</button></div>';
      return;
    }
    panel.innerHTML =
      '<div class="form-head"><h2><span class="big-icon">' + esc(it.icon) + '</span> <span data-title>' + esc(it.name) + '</span></h2>' +
      '<div class="form-actions"><button data-act="duplicate">Duplizieren</button>' +
      '<button class="danger" data-act="delete">Löschen</button></div></div>' +
      '<div class="form-grid">' + schema().fields.map((f) => field(it, f)).join('') + '</div>' +
      extraInfo(it) +
      '<p class="muted save-hint">Änderungen werden automatisch gespeichert.</p>';
  }

  function field(it, f) {
    const v = it[f.key];
    const wide = f.wide ? ' wide' : '';
    const label = '<span class="label">' + esc(f.label) + '</span>';
    const hint = f.hint ? '<small class="hint">' + esc(f.hint) + '</small>' : '';
    switch (f.type) {
      case 'icon':
        return '<label class="field icon-field">' + label + '<input data-key="' + f.key + '" value="' + esc(v) + '" maxlength="8"></label>';
      case 'text':
        return '<label class="field">' + label + '<input data-key="' + f.key + '" value="' + esc(v) + '"></label>';
      case 'number':
        return '<label class="field num-field">' + label + '<input type="number" data-key="' + f.key + '" data-num="1" value="' + esc(v) + '"' +
          (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + '>' + hint + '</label>';
      case 'textarea':
        return '<label class="field' + wide + '">' + label + '<textarea data-key="' + f.key + '" rows="3">' + esc(v) + '</textarea></label>';
      case 'select':
        return '<label class="field">' + label + selectHtml('data-key="' + f.key + '"', f.options, v) + hint + '</label>';
      case 'pick':
        return '<div class="field' + wide + '">' + label + UI.picklist(f.key, v, f.source) + '</div>';
      case 'skills':
        return '<div class="field' + wide + '">' + label + skillsTable(v) + '</div>';
      case 'map':
        return '<div class="field' + wide + '">' + label + mapEditor(it) + '</div>';
      default:
        return '';
    }
  }

  function selectHtml(attrs, options, value) {
    return '<select ' + attrs + '>' + options.map(([val, txt]) =>
      '<option value="' + esc(val) + '"' + (val === value ? ' selected' : '') + '>' + esc(txt) + '</option>').join('') + '</select>';
  }

  // Bedeutung der Werte je nach Art der Fähigkeit
  const SKILL_FIELDS = {
    damage: { power: 'Stärke', target: true },
    heal: { power: 'Stärke', target: true },
    shield: { power: 'Schildpunkte', duration: 'Dauer (Züge)', target: true },
    freeze: { power: 'Zusatzschaden', duration: 'Dauer (Züge)', target: true },
    summon: { summon: true, power: 'Anzahl', duration: 'Dauer (0 = immer)' },
  };

  const SKILL_HINTS = {
    damage: 'Schaden = Angriff + Stärke − halbe Verteidigung des Ziels.',
    heal: 'Heilt Stärke + ¼ Angriff HP.',
    shield: 'Das Ziel bekommt einen Schild, der Schaden abfängt, bis er aufgebraucht ist oder die Dauer (eigene Züge des Ziels) abläuft.',
    freeze: 'Das Ziel setzt für die Dauer seine Züge aus und hält niemanden auf. Zusatzschaden 0 = kein Schaden.',
    summon: 'Die Figur erscheint auf einem freien Feld in Reichweite und kämpft mit. Sie zählt nicht für die Siegbedingung.',
  };

  function skillsTable(skills) {
    const kinds = Data.skillKinds(type);
    const pool = Store.list(type);
    const rows = skills.map((s, i) => {
      const attr = (k) => 'data-skill="' + i + '" data-skey="' + k + '"';
      const f = SKILL_FIELDS[s.kind] || SKILL_FIELDS.damage;
      const num = (k, label, min, max) => '<label class="sk-field"><span>' + esc(label) + '</span><input type="number" min="' + min + '"' +
        (max != null ? ' max="' + max + '"' : '') + ' ' + attr(k) + ' data-num="1" value="' + esc(s[k]) + '"></label>';
      const sel = (k, label, options) => '<label class="sk-field wide"><span>' + esc(label) + '</span>' + selectHtml(attr(k), options, s[k]) + '</label>';
      return '<div class="skill-card kind-' + esc(s.kind) + '">' +
        '<div class="skill-head"><input class="skill-name" ' + attr('name') + ' value="' + esc(s.name) + '">' +
        selectHtml(attr('kind') + ' data-rerender="1"', kinds, s.kind) +
        '<button type="button" class="icon-btn danger" title="Entfernen" data-act="skill-del" data-i="' + i + '">✕</button></div>' +
        '<div class="skill-body">' +
        (f.summon ? sel('summon', 'Figur', [['', '– wählen –']].concat(pool.map((c) => [c.id, c.icon + ' ' + c.name]))) : '') +
        num('power', f.power, f.summon ? 1 : 0, f.summon ? 10 : null) +
        (f.duration ? num('duration', f.duration, s.kind === 'summon' ? 0 : 1, 99) : '') +
        num('mp', 'MP', 0) +
        num('range', 'Reichweite', 1, 20) +
        (f.target ? sel('target', 'Ziel', Data.TARGET_OPTIONS.map(([v, t]) => [v, t.replace(/ \(.*\)/, '')])) : '') +
        '</div><small class="hint block">' + esc(SKILL_HINTS[s.kind] || '') + '</small></div>';
    }).join('');
    return '<div class="skills">' + (rows || '<p class="muted">Keine Fähigkeiten.</p>') + '</div>' +
      '<button type="button" data-act="skill-add">+ Fähigkeit</button>' +
      '<small class="hint block">Reichweite 1 = Nahkampf bzw. Nachbarfeld. Fläche trifft das Ziel und alle Einheiten direkt daneben.</small>';
  }

  /* ---------- Map-Editor ---------- */

  function mapEditor(it) {
    const enemies = Store.list('enemies');
    if (!enemies.some((e) => e.id === mapEnemy)) mapEnemy = enemies.length ? enemies[0].id : null;
    const tools = MAP_TOOLS.map(([t, label]) =>
      '<button type="button" class="tool' + (t === mapTool ? ' on' : '') + '" data-act="map-tool" data-tool="' + t + '">' + label + '</button>').join('');
    return '<div class="map-tools">' +
      '<label>Breite <input type="number" data-map="w" min="' + GridMap.LIMITS.minW + '" max="' + GridMap.LIMITS.maxW + '" value="' + it.map.w + '"></label>' +
      '<label>Höhe <input type="number" data-map="h" min="' + GridMap.LIMITS.minH + '" max="' + GridMap.LIMITS.maxH + '" value="' + it.map.h + '"></label>' +
      '</div>' +
      '<div class="map-tools">' + tools +
      (enemies.length ? selectHtml('data-map-enemy', enemies.map((e) => [e.id, e.icon + ' ' + e.name]), mapEnemy) : '<span class="muted">Noch keine Gegner angelegt.</span>') +
      '</div>' +
      '<div class="map-board" data-map-board>' + mapGrid(it) + '</div>' +
      '<div data-map-info>' + mapInfo(it) + '</div>';
  }

  function mapGrid(it) {
    const m = it.map;
    let html = '<div class="grid editing" style="--w:' + m.w + ';--h:' + m.h + '">';
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const p = it.enemies.find((e) => e.x === x && e.y === y);
        const e = p && Store.get('enemies', p.id);
        html += '<div class="tile ' + UI.tileClass(m.rows[y][x]) + '" data-x="' + x + '" data-y="' + y + '">' +
          (e ? '<span class="token enemy" title="' + esc(e.name) + '">' + esc(e.icon) + '</span>' : '') + '</div>';
      }
    }
    return html + '</div>';
  }

  function mapInfo(it) {
    const m = it.map;
    const starts = GridMap.startTiles(m);
    const goals = GridMap.goalTiles(m);
    const notes = [];
    if (!m.rows.some((r) => r.includes('S'))) notes.push('Keine Startfelder gesetzt – die unterste Reihe wird genutzt.');
    if (!m.rows.some((r) => r.includes('G'))) notes.push('Keine Zielfelder gesetzt – die oberste Reihe ist das Ziel.');
    if (starts.length < it.maxParty) notes.push('Nur ' + starts.length + ' Startfelder für ' + it.maxParty + ' Allys – weitere werden daneben platziert.');
    const reach = GridMap.bfs(m, starts);
    if (!goals.length || !goals.some((g) => reach.has(GridMap.key(m, g.x, g.y)))) {
      notes.push('⚠️ Das Ziel ist von den Startfeldern aus nicht erreichbar!');
    }
    const counts = UI.countIds(it.enemies.map((e) => e.id)).map(([id, n]) => {
      const e = Store.get('enemies', id);
      return e ? esc(e.icon + ' ' + e.name) + (n > 1 ? ' ×' + n : '') : '';
    }).filter(Boolean).join(', ');
    return '<p class="hint block">Wähle ein Werkzeug und tippe oder ziehe über die Felder. ' +
      'Allys starten auf den blauen Startfeldern und müssen das Ziel erreichen.</p>' +
      '<p class="map-enemies">Gegner auf der Map: ' + (counts || '<span class="muted">keine</span>') + '</p>' +
      notes.map((n) => '<p class="map-note">' + esc(n) + '</p>').join('');
  }

  function refreshMap(it) {
    root.querySelector('[data-map-board]').innerHTML = mapGrid(it);
    root.querySelector('[data-map-info]').innerHTML = mapInfo(it);
    const box = root.querySelector('.info-box');
    if (box) box.outerHTML = extraInfo(it);
  }

  function applyTool(tileEl) {
    const it = current();
    if (!it || type !== 'levels' || !tileEl) return;
    const x = Number(tileEl.dataset.x), y = Number(tileEl.dataset.y);
    const idx = it.enemies.findIndex((e) => e.x === x && e.y === y);
    if (mapTool === 'enemy') {
      if (!mapEnemy) { UI.toast('Lege zuerst einen Gegner an'); return; }
      if (it.map.rows[y][x] === '#') { UI.toast('Gegner können nicht auf Wänden stehen'); return; }
      if (idx >= 0) it.enemies.splice(idx, 1);
      it.enemies.push({ id: mapEnemy, x, y });
    } else if (mapTool === 'erase') {
      if (idx < 0) return;
      it.enemies.splice(idx, 1);
    } else {
      if (it.map.rows[y][x] === mapTool) return;
      GridMap.set(it.map, x, y, mapTool);
      if (mapTool === '#' && idx >= 0) it.enemies.splice(idx, 1);
    }
    Store.save();
    refreshMap(it);
    renderList();
  }

  function tileFromEvent(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el && el.closest('.grid.editing .tile');
  }

  function onPointerDown(e) {
    const tile = e.target.closest('.grid.editing .tile');
    if (!tile) return;
    e.preventDefault();
    // Gelände lässt sich durch Ziehen malen, Gegner werden einzeln gesetzt
    painting = mapTool !== 'enemy';
    applyTool(tile);
  }

  function onPointerMove(e) {
    if (!painting) return;
    applyTool(tileFromEvent(e));
  }

  /* ---------- Sonstiges ---------- */

  function extraInfo(it) {
    if (type !== 'levels') return '';
    const enemies = it.enemies.map((p) => Store.get('enemies', p.id)).filter(Boolean);
    const hp = enemies.reduce((s, e) => s + Number(e.maxHp || 0), 0);
    const xp = enemies.reduce((s, e) => s + Number(e.xp || 0), 0);
    return '<div class="info-box">Gegner gesamt: <b>' + enemies.length + '</b> · Gesamt-HP: <b>' + hp + '</b> · EP: <b>' + xp + '</b>' +
      ' <button data-act="test-level">🎯 Level testen</button></div>';
  }

  function onInput(e) {
    const t = e.target;
    if (t.matches('[data-search]')) {
      filter = t.value.trim().toLowerCase();
      renderList();
      return;
    }
    if (t.matches('[data-map-enemy]')) {
      mapEnemy = t.value;
      mapTool = 'enemy';
      root.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === 'enemy'));
      return;
    }
    const it = current();
    if (!it) return;
    if (t.dataset.map) {
      if (e.type !== 'change') return;  // erst nach der Eingabe anpassen
      const w = t.dataset.map === 'w' ? t.value : it.map.w;
      const h = t.dataset.map === 'h' ? t.value : it.map.h;
      GridMap.resize(it.map, w, h, it.enemies);
      Store.save();
      renderForm();
      renderList();
      return;
    }
    if (t.dataset.key) {
      let v = t.value;
      if (t.dataset.num) {
        v = t.value === '' ? 0 : Number(t.value);
        if (t.min !== '' && v < Number(t.min)) v = Number(t.min);
        if (t.max !== '' && v > Number(t.max)) v = Number(t.max);
      }
      it[t.dataset.key] = v;
      if (t.dataset.key === 'name') root.querySelector('[data-title]').textContent = v;
      if (t.dataset.key === 'icon') root.querySelector('.big-icon').textContent = v;
      if (t.dataset.key === 'maxParty' && type === 'levels') root.querySelector('[data-map-info]').innerHTML = mapInfo(it);
    } else if (t.dataset.skill != null) {
      const s = it.skills[Number(t.dataset.skill)];
      let v = t.value;
      if (t.dataset.num) {
        v = Math.max(Number(t.min) || 0, Number(t.value) || 0);
        if (t.max !== '') v = Math.min(Number(t.max), v);
      }
      if (t.dataset.skey === 'summon' && !v) v = null;
      s[t.dataset.skey] = v;
      if (t.dataset.skey === 'kind' && e.type === 'change') {
        // Passende Startwerte für die neue Art übernehmen
        Object.assign(s, Data.SKILL_DEFAULTS[v]);
        if (v === 'summon' && !s.summon) s.summon = (Store.list(type).find((c) => c.id !== it.id) || {}).id || null;
        Store.save();
        renderForm();
        return;
      }
    } else {
      return;
    }
    Store.save();
    renderList();
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const it = current();

    if (act === 'new') {
      selected[type] = Store.create(type).id;
      renderList(); renderForm();
      const name = root.querySelector('[data-key="name"]');
      if (name) { name.focus(); name.select(); }
    } else if (act === 'select') {
      selected[type] = btn.dataset.id;
      renderList(); renderForm();
    } else if (act === 'duplicate' && it) {
      selected[type] = Store.duplicate(type, it.id).id;
      renderList(); renderForm();
      UI.toast('Dupliziert');
    } else if (act === 'delete' && it) {
      if (!confirm('„' + it.name + '“ wirklich löschen?')) return;
      Store.remove(type, it.id);
      selected[type] = (Store.list(type)[0] || {}).id;
      renderList(); renderForm();
      UI.toast('Gelöscht');
    } else if (act === 'skill-add' && it) {
      it.skills.push({ name: 'Neue Fähigkeit', kind: 'damage', power: 10, mp: 5, range: 1, target: 'single', duration: 0, summon: null });
      Store.save(); renderForm();
    } else if (act === 'skill-del' && it) {
      it.skills.splice(Number(btn.dataset.i), 1);
      Store.save(); renderForm();
    } else if (act === 'map-tool') {
      mapTool = btn.dataset.tool;
      root.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b === btn));
    } else if (act.startsWith('pick-') && it) {
      const key = btn.dataset.key;
      const id = act === 'pick-add' ? root.querySelector('[data-pick-select="' + key + '"]').value : btn.dataset.id;
      if (id && UI.applyPick(it[key], act, id)) { Store.save(); renderForm(); renderList(); }
    } else if (act === 'test-level' && it) {
      App.show('test', { levelId: it.id });
    }
  }

  global.Editor = { mount, unmount };
})(this);
