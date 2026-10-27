/* Erstell-Modus: ein generischer Editor, der sich aus den Schemas in data.js aufbaut. */
(function (global) {
  'use strict';

  const { esc } = UI;
  const Store = Data.Store;

  let root = null;
  let type = 'levels';
  let selected = {};       // zuletzt gewählter Eintrag je Typ
  let filter = '';

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
    renderList();
    renderForm();
  }

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
    switch (f.type) {
      case 'icon':
        return '<label class="field icon-field">' + label + '<input data-key="' + f.key + '" value="' + esc(v) + '" maxlength="8"></label>';
      case 'text':
        return '<label class="field">' + label + '<input data-key="' + f.key + '" value="' + esc(v) + '"></label>';
      case 'number':
        return '<label class="field num-field">' + label + '<input type="number" data-key="' + f.key + '" data-num="1" value="' + esc(v) + '"' +
          (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + '></label>';
      case 'textarea':
        return '<label class="field' + wide + '">' + label + '<textarea data-key="' + f.key + '" rows="3">' + esc(v) + '</textarea></label>';
      case 'select':
        return '<label class="field">' + label + '<select data-key="' + f.key + '">' +
          f.options.map(([val, txt]) => '<option value="' + val + '"' + (val === v ? ' selected' : '') + '>' + esc(txt) + '</option>').join('') +
          '</select></label>';
      case 'pick':
        return '<div class="field' + wide + '">' + label + UI.picklist(f.key, v, f.source) + '</div>';
      case 'skills':
        return '<div class="field' + wide + '">' + label + skillsTable(v) + '</div>';
      default:
        return '';
    }
  }

  function skillsTable(skills) {
    const rows = skills.map((s, i) =>
      '<tr>' +
      '<td><input data-skill="' + i + '" data-skey="name" value="' + esc(s.name) + '"></td>' +
      '<td><select data-skill="' + i + '" data-skey="kind">' +
      '<option value="damage"' + (s.kind === 'damage' ? ' selected' : '') + '>Schaden</option>' +
      '<option value="heal"' + (s.kind === 'heal' ? ' selected' : '') + '>Heilung</option></select></td>' +
      '<td><input type="number" min="0" data-skill="' + i + '" data-skey="power" data-num="1" value="' + esc(s.power) + '"></td>' +
      '<td><input type="number" min="0" data-skill="' + i + '" data-skey="mp" data-num="1" value="' + esc(s.mp) + '"></td>' +
      '<td><select data-skill="' + i + '" data-skey="target">' +
      '<option value="single"' + (s.target === 'single' ? ' selected' : '') + '>Ein Ziel</option>' +
      '<option value="all"' + (s.target === 'all' ? ' selected' : '') + '>Alle</option></select></td>' +
      '<td><button type="button" class="icon-btn danger" title="Entfernen" data-act="skill-del" data-i="' + i + '">✕</button></td>' +
      '</tr>').join('');
    return '<table class="skills"><thead><tr><th>Name</th><th>Art</th><th>Stärke</th><th>MP</th><th>Ziel</th><th></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="6" class="muted">Keine Fähigkeiten.</td></tr>') + '</tbody></table>' +
      '<button type="button" data-act="skill-add">+ Fähigkeit</button>';
  }

  function extraInfo(it) {
    if (type !== 'levels') return '';
    const enemies = it.enemies.map((id) => Store.get('enemies', id)).filter(Boolean);
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
    const it = current();
    if (!it) return;
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
    } else if (t.dataset.skill != null) {
      const s = it.skills[Number(t.dataset.skill)];
      s[t.dataset.skey] = t.dataset.num ? Math.max(0, Number(t.value) || 0) : t.value;
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
      it.skills.push({ name: 'Neue Fähigkeit', kind: 'damage', power: 10, mp: 5, target: 'single' });
      Store.save(); renderForm();
    } else if (act === 'skill-del' && it) {
      it.skills.splice(Number(btn.dataset.i), 1);
      Store.save(); renderForm();
    } else if (act.startsWith('pick-') && it) {
      const key = btn.dataset.key;
      const id = act === 'pick-add' ? root.querySelector('[data-pick-select="' + key + '"]').value : btn.dataset.id;
      if (id && UI.applyPick(it[key], act, id)) { Store.save(); renderForm(); renderList(); }
    } else if (act === 'test-level' && it) {
      App.show('test', { levelId: it.id });
    }
  }

  global.Editor = { mount };
})(this);
