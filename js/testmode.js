/* Test-Modus: Kämpfe mit selbst erstellten Leveln, Allys und Objekten ausprobieren. */
(function (global) {
  'use strict';

  const { esc } = UI;
  const Store = Data.Store;
  const CUSTOM = '__custom__';

  const setup = { levelId: null, allyIds: [], items: {}, customEnemies: [], auto: false, speed: 600 };
  let root = null;
  let fight = null;     // { state, level, awaiting, menu, pending }
  let timer = null;
  let simResult = null;

  function level() {
    if (setup.levelId === CUSTOM) return null;
    return Store.get('levels', setup.levelId);
  }

  function maxParty() {
    const l = level();
    return l ? Math.max(1, Number(l.maxParty) || 1) : 4;
  }

  function enemyIds() {
    const l = level();
    return l ? l.enemies : setup.customEnemies;
  }

  function sanitizeSetup() {
    const levels = Store.list('levels');
    if (setup.levelId !== CUSTOM && !Store.get('levels', setup.levelId)) {
      setup.levelId = levels.length ? levels[0].id : CUSTOM;
    }
    setup.allyIds = setup.allyIds.filter((id) => Store.get('allies', id)).slice(0, maxParty());
    if (!setup.allyIds.length) setup.allyIds = Store.list('allies').slice(0, maxParty()).map((a) => a.id);
    setup.customEnemies = setup.customEnemies.filter((id) => Store.get('enemies', id));
    Object.keys(setup.items).forEach((id) => { if (!Store.get('objects', id)) delete setup.items[id]; });
  }

  function mount(el, opts) {
    root = el;
    stop();
    fight = null;
    simResult = null;
    if (opts && opts.levelId) setup.levelId = opts.levelId;
    sanitizeSetup();
    root.onclick = onClick;
    root.onchange = onChange;
    root.oninput = null;
    renderSetup();
  }

  function unmount() { stop(); }

  function stop() {
    clearTimeout(timer);
    timer = null;
  }

  function battleOptions() {
    return {
      allies: setup.allyIds.map((id) => Store.get('allies', id)).filter(Boolean),
      enemies: enemyIds().map((id) => Store.get('enemies', id)).filter(Boolean),
      items: Object.assign({}, setup.items),
      itemDefs: Store.list('objects'),
    };
  }

  /* ---------- Auswahl ---------- */

  function renderSetup() {
    const l = level();
    const levels = Store.list('levels');
    const allies = Store.list('allies');
    const objects = Store.list('objects');
    const opts = battleOptions();

    const levelOptions = levels.map((x) =>
      '<option value="' + esc(x.id) + '"' + (x.id === setup.levelId ? ' selected' : '') + '>' + esc(x.icon + ' ' + x.name) + '</option>'
    ).join('') + '<option value="' + CUSTOM + '"' + (setup.levelId === CUSTOM ? ' selected' : '') + '>✏️ Freie Gegnerauswahl</option>';

    const enemyPreview = l
      ? '<ul class="chips">' + UI.countIds(l.enemies).map(([id, n]) => {
        const e = Store.get('enemies', id);
        return e ? '<li>' + esc(e.icon + ' ' + e.name) + (n > 1 ? ' ×' + n : '') + '</li>' : '';
      }).join('') + '</ul>' + (l.description ? '<p class="muted">' + esc(l.description) + '</p>' : '')
      : UI.picklist('customEnemies', setup.customEnemies, 'enemies');

    const allyCards = allies.map((a) => {
      const on = setup.allyIds.includes(a.id);
      return '<button class="ally-pick' + (on ? ' on' : '') + '" data-act="toggle-ally" data-id="' + esc(a.id) + '">' +
        '<span class="ent-icon">' + esc(a.icon) + '</span><b>' + esc(a.name) + '</b>' +
        '<small>HP ' + a.maxHp + ' · MP ' + a.maxMp + ' · ANG ' + a.atk + ' · VER ' + a.def + ' · TEM ' + a.spd + '</small></button>';
    }).join('') || '<p class="muted">Lege zuerst Allys an.</p>';

    const itemRows = objects.map((o) =>
      '<label class="item-row"><span>' + esc(o.icon + ' ' + o.name) + '</span>' +
      '<input type="number" min="0" max="99" data-item="' + esc(o.id) + '" value="' + (setup.items[o.id] || 0) + '"></label>'
    ).join('') || '<p class="muted">Keine Objekte vorhanden.</p>';

    const canStart = opts.allies.length > 0 && opts.enemies.length > 0;

    root.innerHTML =
      '<div class="test-setup">' +
      '<section class="panel"><h3>1 · Level</h3><select data-setup="level">' + levelOptions + '</select>' + enemyPreview + '</section>' +
      '<section class="panel"><h3>2 · Team <small class="muted">(' + setup.allyIds.length + ' / ' + maxParty() + ')</small></h3>' +
      '<div class="ally-grid">' + allyCards + '</div></section>' +
      '<section class="panel"><h3>3 · Inventar</h3><div class="item-grid">' + itemRows + '</div></section>' +
      '<section class="panel"><h3>4 · Optionen</h3>' +
      '<label class="check"><input type="checkbox" data-setup="auto"' + (setup.auto ? ' checked' : '') + '> Allys automatisch steuern</label>' +
      '<label class="field inline"><span class="label">Tempo</span><select data-setup="speed">' +
      [[1000, 'Langsam'], [600, 'Normal'], [250, 'Schnell'], [0, 'Sofort']].map(([v, t]) =>
        '<option value="' + v + '"' + (v === setup.speed ? ' selected' : '') + '>' + t + '</option>').join('') +
      '</select></label>' +
      '<div class="start-row">' +
      '<button class="primary big" data-act="start"' + (canStart ? '' : ' disabled') + '>⚔️ Kampf starten</button>' +
      '<button data-act="simulate"' + (canStart ? '' : ' disabled') + ' title="100 Kämpfe automatisch durchspielen">📊 Simulation ×100</button>' +
      '</div>' +
      (canStart ? '' : '<p class="muted">Wähle mindestens einen Ally und einen Gegner.</p>') +
      renderSim() +
      '</section></div>';
  }

  function renderSim() {
    if (!simResult) return '';
    const r = simResult;
    const pct = (x) => Math.round(x * 100) + ' %';
    return '<div class="sim-result"><h4>Ergebnis aus ' + r.runs + ' Kämpfen</h4>' +
      '<div class="stat-row">' +
      '<div><b>' + pct(r.winRate) + '</b><small>Siege</small></div>' +
      '<div><b>' + r.avgRounds.toFixed(1) + '</b><small>Ø Runden</small></div>' +
      '<div><b>' + pct(r.avgHpLeft) + '</b><small>Ø Team-HP übrig</small></div>' +
      '</div><table class="survival"><tbody>' +
      Object.values(r.survival).map((s) =>
        '<tr><td>' + esc(s.icon + ' ' + s.name) + '</td><td>überlebt in ' + pct(s.alive / r.runs) + '</td></tr>').join('') +
      '</tbody></table>' +
      (r.draws ? '<p class="muted">' + r.draws + ' Kämpfe nach ' + Battle.MAX_ROUNDS + ' Runden abgebrochen.</p>' : '') +
      '</div>';
  }

  /* ---------- Kampf ---------- */

  function start() {
    const opts = battleOptions();
    fight = { state: Battle.create(opts), level: level(), awaiting: null, menu: 'main', pending: null };
    step();
  }

  function step() {
    stop();
    if (!fight) return;
    const s = fight.state;
    const actor = Battle.next(s);
    if (!actor) { renderBattle(); return; }
    if (actor.side === 'enemy' || setup.auto) {
      fight.awaiting = null;
      renderBattle();
      timer = setTimeout(() => {
        Battle.act(s, actor, Battle.ai(s, actor));
        step();
      }, setup.speed);
    } else {
      fight.awaiting = actor;
      fight.menu = 'main';
      fight.pending = null;
      renderBattle();
    }
  }

  function choose(action) {
    const actor = fight.awaiting;
    const info = Battle.actionInfo(fight.state, actor, action);
    if (!info.valid) { UI.toast(info.reason || 'Nicht möglich'); return; }
    if (info.scope === 'single') {
      fight.pending = action;
      renderBattle();
    } else {
      perform(action);
    }
  }

  function perform(action) {
    const actor = fight.awaiting;
    fight.awaiting = null;
    fight.pending = null;
    Battle.act(fight.state, actor, action);
    step();
  }

  function unitCard(u, s) {
    const targetable = fight.pending && fight.awaiting &&
      Battle.targets(s, fight.awaiting, fight.pending).some((t) => t.uid === u.uid);
    const ev = s.events.filter((e) => e.uid === u.uid);
    const cls = ['unit', u.side,
      u.hp <= 0 ? 'dead' : '',
      s.current === u.uid && !s.winner ? 'current' : '',
      targetable ? 'targetable' : '',
      ev.some((e) => e.kind === 'dmg') ? 'hit' : ''].join(' ');
    const status = [
      u.defending ? '🛡️' : '',
      u.buffAtk ? '⚔️+' + u.buffAtk : '',
      u.buffDef ? '🛡+' + u.buffDef : '',
    ].filter(Boolean).join(' ');
    return '<div class="' + cls + '"' + (targetable ? ' data-act="target" data-uid="' + u.uid + '"' : '') + '>' +
      ev.map((e) => '<span class="float ' + e.kind + '">' + (e.kind === 'dmg' ? '−' : '+') + e.amount + '</span>').join('') +
      '<div class="unit-icon">' + esc(u.icon) + '</div>' +
      '<div class="unit-body"><div class="unit-name">' + esc(u.name) + ' <small>' + status + '</small></div>' +
      UI.bar(u.hp, u.maxHp, 'hp') + (u.maxMp ? UI.bar(u.mp, u.maxMp, 'mp') : '') + '</div></div>';
  }

  function actionPanel(s) {
    const a = fight.awaiting;
    if (s.winner) return '';
    if (!a) {
      const cur = Battle.byUid(s, s.current);
      return '<div class="action-panel waiting">' + (cur ? esc(cur.icon + ' ' + cur.name) + ' ist am Zug …' : '') + '</div>';
    }
    const head = '<div class="action-head">' + esc(a.icon + ' ' + a.name) + ' ist am Zug</div>';
    if (fight.pending) {
      return '<div class="action-panel">' + head + '<p>Wähle ein Ziel (anklicken).</p>' +
        '<button data-act="back">← Zurück</button></div>';
    }
    let buttons = '';
    if (fight.menu === 'main') {
      buttons =
        '<button data-act="do-attack">⚔️ Angriff</button>' +
        '<button data-act="menu" data-menu="skill"' + (a.skills.length ? '' : ' disabled') + '>✨ Fähigkeit</button>' +
        '<button data-act="menu" data-menu="item">🎒 Objekt</button>' +
        '<button data-act="do-defend">🛡️ Verteidigen</button>';
    } else if (fight.menu === 'skill') {
      buttons = a.skills.map((sk, i) =>
        '<button data-act="do-skill" data-i="' + i + '"' + (a.mp < sk.mp ? ' disabled' : '') + '>' +
        esc(sk.name) + ' <small>' + (sk.kind === 'heal' ? 'Heilung' : 'Schaden') + ' ' + sk.power +
        (sk.target === 'all' ? ' · alle' : '') + ' · ' + sk.mp + ' MP</small></button>').join('') +
        '<button data-act="back">← Zurück</button>';
    } else if (fight.menu === 'item') {
      const ids = Object.keys(s.items).filter((id) => s.items[id] > 0 && s.itemDefs[id]);
      buttons = (ids.length ? ids.map((id) => {
        const d = s.itemDefs[id];
        return '<button data-act="do-item" data-id="' + esc(id) + '">' + esc(d.icon + ' ' + d.name) + ' <small>×' + s.items[id] + '</small></button>';
      }).join('') : '<p class="muted">Keine Objekte im Inventar.</p>') +
        '<button data-act="back">← Zurück</button>';
    }
    return '<div class="action-panel">' + head + '<div class="action-buttons">' + buttons + '</div></div>';
  }

  function resultOverlay(s) {
    if (!s.winner) return '';
    const win = s.winner === 'ally';
    let rewards = '';
    if (win) {
      const xp = s.units.filter((u) => u.side === 'enemy').reduce((sum, u) => sum + u.xp, 0);
      const items = fight.level ? UI.countIds(fight.level.rewards).map(([id, n]) => {
        const o = Store.get('objects', id);
        return o ? esc(o.icon + ' ' + o.name) + (n > 1 ? ' ×' + n : '') : '';
      }).filter(Boolean).join(', ') : '';
      rewards = '<p>Erhaltene EP: <b>' + xp + '</b></p>' + (items ? '<p>Belohnungen: ' + items + '</p>' : '');
    }
    const title = win ? '🏆 Sieg!' : s.winner === 'enemy' ? '💀 Niederlage' : '⏱ Unentschieden';
    return '<div class="result ' + s.winner + '"><h2>' + title + '</h2><p>nach ' + s.round + ' Runden</p>' + rewards +
      '<div class="start-row"><button class="primary" data-act="start">↻ Nochmal</button>' +
      '<button data-act="to-setup">Zurück zur Auswahl</button></div></div>';
  }

  function renderBattle() {
    const s = fight.state;
    const side = (name) => s.units.filter((u) => u.side === name).map((u) => unitCard(u, s)).join('');
    const order = [s.current].concat(s.queue)
      .map((uid) => Battle.byUid(s, uid)).filter((u) => u && u.hp > 0)
      .map((u, i) => '<span class="' + (i === 0 ? 'now ' : '') + u.side + '" title="' + esc(u.name) + '">' + esc(u.icon) + '</span>').join('');
    const logHtml = s.log.slice(-60).map((l) => '<li class="' + l.kind + '">' + esc(l.text) + '</li>').join('');

    root.innerHTML =
      '<div class="battle">' +
      '<div class="battle-top"><div><b>' + esc(fight.level ? fight.level.icon + ' ' + fight.level.name : 'Freier Kampf') + '</b>' +
      ' · Runde ' + s.round + '</div>' +
      '<div class="turn-order">' + (s.winner ? '' : order) + '</div>' +
      '<div><label class="check"><input type="checkbox" data-setup="auto"' + (setup.auto ? ' checked' : '') + '> Auto</label>' +
      ' <button data-act="to-setup" class="danger">Abbrechen</button></div></div>' +
      '<div class="arena"><div class="side side-enemy">' + side('enemy') + '</div>' +
      '<div class="side side-ally">' + side('ally') + '</div></div>' +
      actionPanel(s) + resultOverlay(s) +
      '<ul class="log" id="battle-log">' + logHtml + '</ul></div>';
    const logEl = root.querySelector('#battle-log');
    logEl.scrollTop = logEl.scrollHeight;
    // Treffer-Animationen nur einmal anzeigen
    s.events = [];
  }

  /* ---------- Events ---------- */

  function onChange(e) {
    const t = e.target;
    if (t.dataset.item) {
      setup.items[t.dataset.item] = Math.max(0, Math.min(99, Number(t.value) || 0));
      simResult = null;
      return;
    }
    switch (t.dataset.setup) {
      case 'level':
        setup.levelId = t.value;
        sanitizeSetup();
        simResult = null;
        renderSetup();
        break;
      case 'speed':
        setup.speed = Number(t.value);
        break;
      case 'auto':
        setup.auto = t.checked;
        // Im laufenden Kampf direkt übernehmen
        if (fight && setup.auto && fight.awaiting) step();
        break;
    }
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;

    switch (act) {
      case 'toggle-ally': {
        const id = btn.dataset.id;
        const i = setup.allyIds.indexOf(id);
        if (i >= 0) setup.allyIds.splice(i, 1);
        else if (setup.allyIds.length < maxParty()) setup.allyIds.push(id);
        else { UI.toast('Maximal ' + maxParty() + ' Allys in diesem Level'); return; }
        simResult = null;
        renderSetup();
        break;
      }
      case 'pick-add': case 'pick-inc': case 'pick-dec': {
        const id = act === 'pick-add' ? root.querySelector('[data-pick-select="customEnemies"]').value : btn.dataset.id;
        if (id && UI.applyPick(setup.customEnemies, act, id)) { simResult = null; renderSetup(); }
        break;
      }
      case 'start': start(); break;
      case 'simulate':
        simResult = Battle.simulate(battleOptions(), 100);
        renderSetup();
        break;
      case 'to-setup': stop(); fight = null; renderSetup(); break;
      case 'menu': fight.menu = btn.dataset.menu; renderBattle(); break;
      case 'back': fight.pending = null; fight.menu = 'main'; renderBattle(); break;
      case 'do-attack': choose({ type: 'attack' }); break;
      case 'do-defend': choose({ type: 'defend' }); break;
      case 'do-skill': choose({ type: 'skill', skill: Number(btn.dataset.i) }); break;
      case 'do-item': choose({ type: 'item', item: btn.dataset.id }); break;
      case 'target':
        if (fight && fight.pending) perform(Object.assign({}, fight.pending, { target: btn.dataset.uid }));
        break;
    }
  }

  global.TestMode = { mount, unmount };
})(this);
