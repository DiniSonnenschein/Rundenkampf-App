/* Test-Modus: Kämpfe auf der Level-Map mit selbst erstellten Allys und Objekten ausprobieren. */
(function (global) {
  'use strict';

  const { esc } = UI;
  const Store = Data.Store;
  const CUSTOM = '__custom__';

  const setup = { levelId: null, allyIds: [], items: {}, customEnemies: [], auto: false, speed: 600 };
  let root = null;
  let fight = null;     // { state, level, awaiting, mode, menu, inspect }
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
    const l = level();
    const enemies = l
      ? l.enemies.map((p) => ({ def: Store.get('enemies', p.id), x: p.x, y: p.y }))
      : setup.customEnemies.map((id) => ({ def: Store.get('enemies', id) }));
    return {
      map: l ? l.map : GridMap.create(7, 10),
      goalRule: l ? l.goalRule : 'all',
      allies: setup.allyIds.map((id) => Store.get('allies', id)).filter(Boolean),
      enemies: enemies.filter((e) => e.def),
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

    // Vorschau: so stehen alle zu Kampfbeginn
    const preview = Battle.create(Object.assign({}, opts, { quiet: true }));
    const levelInfo = (l
      ? '<p class="muted">' + esc(l.goalRule === 'one' ? 'Sieg: Ein Ally erreicht das Ziel.' : 'Sieg: Alle überlebenden Allys erreichen das Ziel.') +
        (l.description ? ' ' + esc(l.description) : '') + '</p>'
      : UI.picklist('customEnemies', setup.customEnemies, 'enemies') + '<p class="muted">Standard-Map 7×10, Gegner werden oben platziert.</p>') +
      '<div class="board preview">' + boardHtml(preview, {}) + '</div>';

    const allyCards = allies.map((a) => {
      const on = setup.allyIds.includes(a.id);
      return '<button class="ally-pick' + (on ? ' on' : '') + '" data-act="toggle-ally" data-id="' + esc(a.id) + '">' +
        '<span class="ent-icon">' + esc(a.icon) + '</span><b>' + esc(a.name) + '</b>' +
        '<small>HP ' + a.maxHp + ' · ANG ' + a.atk + ' · VER ' + a.def + ' · TEM ' + a.spd + ' · BEW ' + a.move + ' · RW ' + a.range + '</small></button>';
    }).join('') || '<p class="muted">Lege zuerst Allys an.</p>';

    const itemRows = objects.map((o) =>
      '<label class="item-row"><span>' + esc(o.icon + ' ' + o.name) + '</span>' +
      '<input type="number" min="0" max="99" data-item="' + esc(o.id) + '" value="' + (setup.items[o.id] || 0) + '"></label>'
    ).join('') || '<p class="muted">Keine Objekte vorhanden.</p>';

    const canStart = opts.allies.length > 0;

    root.innerHTML =
      '<div class="test-setup">' +
      '<section class="panel"><h3>1 · Level</h3><select data-setup="level">' + levelOptions + '</select>' + levelInfo + '</section>' +
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
      (canStart ? '' : '<p class="muted">Wähle mindestens einen Ally.</p>') +
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
      '</div><table class="survival"><thead><tr><th></th><th>im Ziel</th><th>überlebt</th></tr></thead><tbody>' +
      Object.values(r.units).map((s) =>
        '<tr><td>' + esc(s.icon + ' ' + s.name) + '</td><td>' + pct(s.escaped / r.runs) + '</td><td>' + pct(s.alive / r.runs) + '</td></tr>').join('') +
      '</tbody></table>' +
      (r.draws ? '<p class="muted">' + r.draws + ' Kämpfe nach ' + Battle.MAX_ROUNDS + ' Runden abgebrochen.</p>' : '') +
      '<p class="muted">Die KI läuft möglichst direkt zum Ziel und greift unterwegs an.</p>' +
      '</div>';
  }

  /* ---------- Spielfeld ---------- */

  /**
   * Zeichnet die Map mit Einheiten.
   * @param {object} hl  { reach: Set, range: Set, targets: Set(uid), inspect: uid, clickable: bool }
   */
  function boardHtml(s, hl) {
    const m = s.map;
    let html = '<div class="grid' + (hl.clickable ? ' playing' : '') + '" style="--w:' + m.w + ';--h:' + m.h + '">';
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const k = GridMap.key(m, x, y);
        const u = Battle.unitAt(s, x, y);
        const cls = ['tile', UI.tileClass(m.rows[y][x])];
        if (Battle.isGoal(s, x, y)) cls.push('goal');
        if (hl.reach && hl.reach.has(k)) cls.push('reach');
        if (hl.range && hl.range.has(k)) cls.push('inrange');
        if (u && hl.targets && hl.targets.has(u.uid)) cls.push('target');
        html += '<div class="' + cls.join(' ') + '" data-x="' + x + '" data-y="' + y + '">' + (u ? tokenHtml(s, u, hl) : '') + '</div>';
      }
    }
    return html + '</div>';
  }

  function tokenHtml(s, u, hl) {
    const ev = s.events.filter((e) => e.uid === u.uid);
    const pct = Math.max(0, Math.round((u.hp / u.maxHp) * 100));
    const idle = u.side === 'enemy' && !u.alerted;
    const cls = ['token', u.side,
      s.current === u.uid && !s.winner ? 'current' : '',
      hl.inspect === u.uid ? 'inspected' : '',
      idle ? 'idle' : '',
      ev.some((e) => e.kind === 'dmg') ? 'hit' : ''].join(' ');
    return '<div class="' + cls + '" title="' + esc(u.name) + '">' +
      ev.filter((e) => e.kind !== 'move').map((e) =>
        '<span class="float ' + e.kind + '">' + (e.kind === 'dmg' ? '−' : '+') + e.amount + '</span>').join('') +
      '<span class="token-icon">' + esc(u.icon) + '</span>' +
      (u.defending ? '<span class="badge">🛡️</span>' : idle ? '<span class="badge">💤</span>' : '') +
      '<span class="mini-hp"><span style="width:' + pct + '%"></span></span></div>';
  }

  function tilesInRange(s, actor, range) {
    const out = new Set();
    const m = s.map;
    for (let y = actor.y - range; y <= actor.y + range; y++) {
      for (let x = actor.x - range; x <= actor.x + range; x++) {
        if (GridMap.inside(m, x, y)) out.add(GridMap.key(m, x, y));
      }
    }
    return out;
  }

  /* ---------- Kampf ---------- */

  function start() {
    fight = { state: Battle.create(battleOptions()), level: level(), awaiting: null, mode: null, menu: 'main', inspect: null };
    step();
    window.scrollTo(0, 0);
  }

  /** Nächste Einheit an die Reihe bringen. */
  function step() {
    stop();
    if (!fight) return;
    const s = fight.state;
    const actor = Battle.next(s);
    fight.menu = 'main';
    fight.inspect = null;
    if (!actor) { fight.awaiting = null; fight.mode = null; renderBattle(); return; }
    if (actor.side === 'enemy' || setup.auto) {
      fight.awaiting = null;
      fight.mode = null;
      renderBattle();
      // Schlafende Gegner ohne Verzögerung überspringen
      timer = setTimeout(aiLoop, actor.side === 'enemy' && !actor.alerted ? 0 : setup.speed);
    } else {
      fight.awaiting = actor;
      fight.mode = 'move';
      renderBattle();
    }
  }

  function aiLoop() {
    if (!fight) return;
    const s = fight.state;
    const actor = Battle.byUid(s, s.current);
    if (actor && Battle.aiStep(s, actor)) {
      renderBattle();
      timer = setTimeout(aiLoop, setup.speed);
    } else {
      step();
    }
  }

  /** Nach einer Spieler-Aktion: Zug beenden oder weitermachen. */
  function afterPlayerStep() {
    if (Battle.turnDone(fight.state)) { step(); return; }
    fight.menu = 'main';
    fight.mode = fight.state.turn.moved ? null : 'move';
    renderBattle();
  }

  function chooseAction(action) {
    const s = fight.state;
    const info = Battle.actionInfo(s, fight.awaiting, action);
    if (!info.valid) { UI.toast(info.reason || 'Nicht möglich'); return; }
    if (info.scope === 'none' || info.scope === 'all') {
      Battle.act(s, fight.awaiting, action);
      afterPlayerStep();
      return;
    }
    fight.mode = action;
    if (!Battle.targets(s, fight.awaiting, action).length) UI.toast('Kein Ziel in Reichweite (' + info.range + ')');
    renderBattle();
  }

  function onTile(x, y) {
    const s = fight.state;
    const a = fight.awaiting;
    const u = Battle.unitAt(s, x, y);
    if (a && fight.mode === 'move' && Battle.reachable(s, a).some((t) => t.x === x && t.y === y)) {
      Battle.move(s, a, x, y);
      afterPlayerStep();
      return;
    }
    if (a && fight.mode && fight.mode !== 'move' && u &&
      Battle.targets(s, a, fight.mode).some((t) => t.uid === u.uid)) {
      Battle.act(s, a, Object.assign({}, fight.mode, { target: u.uid }));
      afterPlayerStep();
      return;
    }
    fight.inspect = u ? u.uid : null;
    renderBattle();
  }

  function unitInfo(u, s) {
    if (!u) return '';
    const status = [
      u.escaped ? '🏁 im Ziel' : '',
      u.hp <= 0 ? '💀 besiegt' : '',
      u.defending ? '🛡️ verteidigt' : '',
      u.side === 'enemy' && !u.alerted ? '💤 hat euch noch nicht bemerkt (Sicht ' + u.sight + ')' : '',
      u.buffAtk ? '⚔️ +' + u.buffAtk : '',
      u.buffDef ? '🛡 +' + u.buffDef : '',
    ].filter(Boolean).join(' · ');
    return '<div class="unit-info ' + u.side + '">' +
      '<div class="unit-info-head"><span class="unit-icon">' + esc(u.icon) + '</span><b>' + esc(u.name) + '</b>' +
      (s.current === u.uid ? ' <small class="muted">ist am Zug</small>' : '') + '</div>' +
      UI.bar(u.hp, u.maxHp, 'hp') + (u.maxMp ? UI.bar(u.mp, u.maxMp, 'mp') : '') +
      '<div class="stats">ANG ' + (u.atk + u.buffAtk) + ' · VER ' + (u.def + u.buffDef) + ' · TEM ' + u.spd +
      ' · BEW ' + u.move + ' · RW ' + u.range + '</div>' +
      (status ? '<div class="stats">' + status + '</div>' : '') + '</div>';
  }

  function actionPanel(s) {
    const a = fight.awaiting;
    if (s.winner) return '';
    if (!a) {
      const cur = Battle.byUid(s, s.current);
      return '<div class="action-panel waiting">' + (cur ? esc(cur.icon + ' ' + cur.name) + ' ist am Zug …' : '') + '</div>';
    }
    const t = s.turn;
    let hint = '';
    if (fight.mode === 'move') hint = 'Tippe auf ein markiertes Feld, um dich zu bewegen (bis zu ' + a.move + ' Felder).';
    else if (fight.mode) hint = 'Wähle ein rot markiertes Ziel (Reichweite ' + Battle.actionInfo(s, a, fight.mode).range + ').';
    else if (!t.acted) hint = 'Wähle eine Aktion.';

    const on = (cond) => (cond ? ' class="on"' : '');
    let buttons = '';
    if (fight.menu === 'main') {
      buttons =
        '<button data-act="mode-move"' + (t.moved ? ' disabled' : '') + on(fight.mode === 'move') + '>🚶 Bewegen</button>' +
        '<button data-act="do-attack"' + (t.acted ? ' disabled' : '') + on(fight.mode && fight.mode.type === 'attack') + '>⚔️ Angriff</button>' +
        '<button data-act="menu" data-menu="skill"' + (t.acted || !a.skills.length ? ' disabled' : '') + on(fight.mode && fight.mode.type === 'skill') + '>✨ Fähigkeit</button>' +
        '<button data-act="menu" data-menu="item"' + (t.acted ? ' disabled' : '') + on(fight.mode && fight.mode.type === 'item') + '>🎒 Objekt</button>' +
        '<button data-act="do-defend"' + (t.acted ? ' disabled' : '') + '>🛡️ Verteidigen</button>' +
        '<button data-act="end-turn" class="primary">⏭ Zug beenden</button>';
    } else if (fight.menu === 'skill') {
      buttons = a.skills.map((sk, i) =>
        '<button data-act="do-skill" data-i="' + i + '"' + (a.mp < sk.mp ? ' disabled' : '') + '>' +
        esc(sk.name) + ' <small>' + (sk.kind === 'heal' ? 'Heilung' : 'Schaden') + ' ' + sk.power +
        ' · RW ' + sk.range + (sk.target === 'area' ? ' · Fläche' : sk.target === 'all' ? ' · alle' : '') + ' · ' + sk.mp + ' MP</small></button>').join('') +
        '<button data-act="back">← Zurück</button>';
    } else if (fight.menu === 'item') {
      const ids = Object.keys(s.items).filter((id) => s.items[id] > 0 && s.itemDefs[id]);
      buttons = (ids.length ? ids.map((id) => {
        const d = s.itemDefs[id];
        return '<button data-act="do-item" data-id="' + esc(id) + '">' + esc(d.icon + ' ' + d.name) +
          ' <small>×' + s.items[id] + ' · RW ' + (d.range || 1) + '</small></button>';
      }).join('') : '<p class="muted">Keine Objekte im Inventar.</p>') +
        '<button data-act="back">← Zurück</button>';
    }
    return '<div class="action-panel"><div class="action-head">' + esc(a.icon + ' ' + a.name) + ' ist am Zug' +
      ' <small class="muted">' + (t.moved ? '✓ bewegt' : '') + (t.acted ? ' ✓ gehandelt' : '') + '</small></div>' +
      (hint ? '<p class="hint">' + esc(hint) + '</p>' : '') +
      '<div class="action-buttons">' + buttons + '</div></div>';
  }

  function resultBox(s) {
    if (!s.winner) return '';
    const win = s.winner === 'ally';
    let rewards = '';
    if (win) {
      const xp = s.units.filter((u) => u.side === 'enemy' && u.hp <= 0).reduce((sum, u) => sum + u.xp, 0);
      const items = fight.level ? UI.countIds(fight.level.rewards).map(([id, n]) => {
        const o = Store.get('objects', id);
        return o ? esc(o.icon + ' ' + o.name) + (n > 1 ? ' ×' + n : '') : '';
      }).filter(Boolean).join(', ') : '';
      const inGoal = s.units.filter((u) => u.escaped).map((u) => esc(u.icon)).join(' ');
      rewards = '<p>Im Ziel: ' + inGoal + '</p><p>EP für besiegte Gegner: <b>' + xp + '</b></p>' +
        (items ? '<p>Belohnungen: ' + items + '</p>' : '');
    }
    const title = win ? '🏆 Sieg!' : s.winner === 'enemy' ? '💀 Niederlage' : '⏱ Abgebrochen';
    return '<div class="result ' + s.winner + '"><h2>' + title + '</h2><p>nach ' + s.round + ' Runden</p>' + rewards +
      '<div class="start-row"><button class="primary" data-act="start">↻ Nochmal</button>' +
      '<button data-act="to-setup">Zurück zur Auswahl</button></div></div>';
  }

  function renderBattle() {
    const s = fight.state;
    const a = fight.awaiting;
    const hl = { clickable: true, inspect: fight.inspect };
    if (a && fight.mode === 'move') {
      hl.reach = new Set(Battle.reachable(s, a).map((t) => GridMap.key(s.map, t.x, t.y)));
    } else if (a && fight.mode) {
      const info = Battle.actionInfo(s, a, fight.mode);
      if (info.valid) hl.range = tilesInRange(s, a, info.range);
      hl.targets = new Set(Battle.targets(s, a, fight.mode).map((u) => u.uid));
    }
    const order = [s.current].concat(s.queue)
      .map((uid) => Battle.byUid(s, uid)).filter((u) => u && Battle.isActive(u))
      .map((u, i) => '<span class="' + (i === 0 ? 'now ' : '') + u.side + '" title="' + esc(u.name) + '">' + esc(u.icon) + '</span>').join('');
    const logHtml = s.log.slice(-80).map((l) => '<li class="' + l.kind + '">' + esc(l.text) + '</li>').join('');
    const shown = Battle.byUid(s, fight.inspect) || Battle.byUid(s, s.current);
    const escaped = s.units.filter((u) => u.escaped);

    root.innerHTML =
      '<div class="battle">' +
      '<div class="battle-top"><div><b>' + esc(fight.level ? fight.level.icon + ' ' + fight.level.name : 'Freier Kampf') + '</b>' +
      ' · Runde ' + s.round + '</div>' +
      '<div class="turn-order">' + (s.winner ? '' : order) + '</div>' +
      '<div><label class="check"><input type="checkbox" data-setup="auto"' + (setup.auto ? ' checked' : '') + '> Auto</label>' +
      ' <button data-act="to-setup" class="danger">Abbrechen</button></div></div>' +
      '<div class="battle-main">' +
      '<div class="board" style="--bw:' + s.map.w + ';--bh:' + s.map.h + '">' + boardHtml(s, hl) + '</div>' +
      '<div class="battle-side">' + resultBox(s) + actionPanel(s) + unitInfo(shown, s) +
      (escaped.length ? '<div class="escaped">🏁 Im Ziel: ' + escaped.map((u) => esc(u.icon + ' ' + u.name)).join(', ') + '</div>' : '') +
      '<ul class="log" id="battle-log">' + logHtml + '</ul></div>' +
      '</div></div>';
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
        if (fight && setup.auto && fight.awaiting) {
          fight.awaiting = null;
          fight.mode = null;
          renderBattle();
          timer = setTimeout(aiLoop, setup.speed);
        }
        break;
    }
  }

  function onClick(e) {
    const tile = e.target.closest('.grid.playing .tile');
    if (tile && fight) { onTile(Number(tile.dataset.x), Number(tile.dataset.y)); return; }
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
      case 'menu': fight.menu = btn.dataset.menu; fight.mode = null; renderBattle(); break;
      case 'back': fight.menu = 'main'; fight.mode = fight.state.turn.moved ? null : 'move'; renderBattle(); break;
      case 'mode-move': fight.mode = 'move'; renderBattle(); break;
      case 'end-turn': step(); break;
      case 'do-attack': chooseAction({ type: 'attack' }); break;
      case 'do-defend': chooseAction({ type: 'defend' }); break;
      case 'do-skill': fight.menu = 'main'; chooseAction({ type: 'skill', skill: Number(btn.dataset.i) }); break;
      case 'do-item': fight.menu = 'main'; chooseAction({ type: 'item', item: btn.dataset.id }); break;
    }
  }

  global.TestMode = { mount, unmount };
})(this);
