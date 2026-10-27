/*
 * Kampf-Engine auf einer Feld-Map (ohne DOM). Wird vom Test-Modus genutzt
 * und kann später vom eigentlichen Spiel wiederverwendet werden.
 *
 * Ablauf: Alle Einheiten handeln reihum nach Tempo. In ihrem Zug darf eine
 * Einheit sich einmal bewegen (bis zu `move` Felder) und einmal handeln –
 * in beliebiger Reihenfolge. Die Allys gewinnen, wenn sie das Ziel erreichen.
 */
(function (global) {
  'use strict';

  const GridMap = (typeof module !== 'undefined' && module.exports) ? require('./map.js') : global.GridMap;

  const MAX_ROUNDS = 100;
  const AREA_RADIUS = 1;

  function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function makeUnit(src, side, index) {
    const maxHp = Math.max(1, num(src.maxHp, 1));
    const maxMp = Math.max(0, num(src.maxMp, 0));
    return {
      uid: side + '-' + index,
      side,
      id: src.id,
      name: src.name || '???',
      icon: src.icon || '❔',
      maxHp, hp: maxHp,
      maxMp, mp: maxMp,
      atk: num(src.atk, 0),
      def: num(src.def, 0),
      spd: num(src.spd, 0),
      move: Math.max(0, num(src.move, 3)),
      range: Math.max(1, num(src.range, 1)),
      sight: Math.max(0, num(src.sight, 5)),
      xp: num(src.xp, 0),
      skills: (src.skills || []).map((s) => ({
        name: s.name || 'Fähigkeit',
        kind: s.kind === 'heal' ? 'heal' : 'damage',
        power: num(s.power, 0),
        mp: Math.max(0, num(s.mp, 0)),
        range: Math.max(1, num(s.range, 1)),
        target: ['single', 'area', 'all'].includes(s.target) ? s.target : 'single',
      })),
      x: -1, y: -1,
      buffAtk: 0,
      buffDef: 0,
      defending: false,
      escaped: false,
      alerted: side === 'ally',
    };
  }

  // Gleichnamige Einheiten durchnummerieren (Goblin A, Goblin B, …)
  function labelDuplicates(units) {
    const counts = {};
    units.forEach((u) => { counts[u.name] = (counts[u.name] || 0) + 1; });
    const seen = {};
    units.forEach((u) => {
      if (counts[u.name] > 1) {
        const i = seen[u.name] = (seen[u.name] || 0) + 1;
        u.name += ' ' + String.fromCharCode(64 + i);
      }
    });
  }

  function isActive(u) {
    return u.hp > 0 && !u.escaped;
  }

  function unitAt(state, x, y) {
    return state.units.find((u) => isActive(u) && u.x === x && u.y === y) || null;
  }

  function isGoal(state, x, y) {
    return state.goals.has(GridMap.key(state.map, x, y));
  }

  // Nächstes freies, begehbares Feld (kein Ziel) ab (x, y)
  function nearestFree(state, x, y) {
    const map = state.map;
    const sx = Math.max(0, Math.min(map.w - 1, x));
    const sy = Math.max(0, Math.min(map.h - 1, y));
    const ok = (px, py) => GridMap.passable(map, px, py) && !unitAt(state, px, py) && !isGoal(state, px, py);
    if (ok(sx, sy)) return { x: sx, y: sy };
    // Ringförmig nach außen suchen (auch über Wände hinweg)
    for (let r = 1; r < Math.max(map.w, map.h); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && ok(sx + dx, sy + dy)) return { x: sx + dx, y: sy + dy };
        }
      }
    }
    return null;
  }

  /**
   * @param {object}   opts
   * @param {object}   opts.map       { w, h, rows }
   * @param {object[]} opts.allies    Ally-Definitionen (werden auf Startfelder gestellt)
   * @param {object[]} opts.enemies   [{ def, x, y }] – ohne x/y wird oben automatisch platziert
   * @param {object}   opts.items     { objektId: anzahl }
   * @param {object[]} opts.itemDefs  Objekt-Definitionen
   * @param {string}   [opts.goalRule] 'all' (alle überlebenden Allys) oder 'one'
   * @param {function} [opts.rng]     Zufallsfunktion (0..1)
   * @param {boolean}  [opts.quiet]   Kein Kampflog schreiben
   */
  function create(opts) {
    const map = GridMap.normalize(opts.map ? JSON.parse(JSON.stringify(opts.map)) : null);
    const itemDefs = {};
    (opts.itemDefs || []).forEach((d) => { itemDefs[d.id] = d; });
    const state = {
      map,
      goals: new Set(GridMap.goalTiles(map).map((t) => GridMap.key(map, t.x, t.y))),
      goalRule: opts.goalRule === 'one' ? 'one' : 'all',
      units: [],
      items: Object.assign({}, opts.items || {}),
      itemDefs,
      round: 0,
      queue: [],
      current: null,
      turn: null,
      winner: null,
      log: [],
      events: [],
      quiet: !!opts.quiet,
      rng: opts.rng || Math.random,
      goalDist: null,
    };

    const enemies = (opts.enemies || []).map((e, i) => {
      const def = e.def || e;
      return { unit: makeUnit(def, 'enemy', i), x: e.x, y: e.y };
    });
    labelDuplicates(enemies.map((e) => e.unit));
    enemies.forEach((e) => {
      const hasPos = Number.isInteger(e.x) && Number.isInteger(e.y);
      const pos = nearestFree(state, hasPos ? e.x : Math.floor(map.w / 2), hasPos ? e.y : 2);
      if (!pos) return;
      e.unit.x = pos.x; e.unit.y = pos.y;
      state.units.push(e.unit);
    });

    const starts = GridMap.startTiles(map);
    (opts.allies || []).forEach((a, i) => {
      const u = makeUnit(a, 'ally', i);
      const free = starts.find((t) => !unitAt(state, t.x, t.y) && !isGoal(state, t.x, t.y));
      const last = starts[starts.length - 1] || { x: Math.floor(map.w / 2), y: map.h - 1 };
      const pos = free || nearestFree(state, last.x, last.y);
      if (!pos) return;
      u.x = pos.x; u.y = pos.y;
      state.units.push(u);
    });

    // Schritte bis zum Ziel (ohne Einheiten) – für die Ally-KI
    state.goalDist = GridMap.bfs(map, GridMap.goalTiles(map));
    return state;
  }

  function log(state, text, kind) {
    if (!state.quiet) state.log.push({ text, kind: kind || 'info' });
  }

  function byUid(state, uid) {
    return state.units.find((u) => u.uid === uid) || null;
  }

  function alive(state, side) {
    return state.units.filter((u) => isActive(u) && (!side || u.side === side));
  }

  function opponent(side) {
    return side === 'ally' ? 'enemy' : 'ally';
  }

  function checkWinner(state) {
    if (state.winner) return state.winner;
    const allies = state.units.filter((u) => u.side === 'ally');
    const escaped = allies.filter((u) => u.escaped).length;
    const active = allies.filter(isActive).length;
    if (state.goalRule === 'one' && escaped) state.winner = 'ally';
    else if (!active) state.winner = escaped ? 'ally' : 'enemy';
    else if (state.round > MAX_ROUNDS) state.winner = 'draw';
    if (state.winner === 'ally') log(state, 'Sieg! Das Ziel wurde erreicht.', 'win');
    else if (state.winner === 'enemy') log(state, 'Niederlage …', 'lose');
    return state.winner;
  }

  function alertCheck(state, unit) {
    if (unit.alerted) return;
    if (alive(state, 'ally').some((a) => GridMap.dist(a, unit) <= unit.sight)) {
      unit.alerted = true;
      log(state, unit.name + ' hat euch bemerkt!', 'buff');
    }
  }

  /** Nächste Einheit am Zug bestimmen. Gibt null zurück, wenn der Kampf vorbei ist. */
  function next(state) {
    if (checkWinner(state)) { state.current = null; state.turn = null; return null; }
    let actor = null;
    while (!actor) {
      if (!state.queue.length) {
        state.round++;
        if (checkWinner(state)) { state.current = null; state.turn = null; return null; }
        state.queue = alive(state)
          .map((u) => ({ u, tie: state.rng() }))
          .sort((a, b) => b.u.spd - a.u.spd || a.tie - b.tie)
          .map((x) => x.u.uid);
        log(state, 'Runde ' + state.round, 'round');
      }
      const u = byUid(state, state.queue.shift());
      if (u && isActive(u)) actor = u;
    }
    actor.defending = false;
    state.current = actor.uid;
    state.turn = { uid: actor.uid, moved: false, acted: false };
    if (actor.side === 'enemy') alertCheck(state, actor);
    return actor;
  }

  function isTurnOf(state, actor) {
    return !!(state.turn && actor && state.turn.uid === actor.uid && isActive(actor) && !state.winner);
  }

  /** Ist der Zug vorbei (bewegt + gehandelt, Ziel erreicht oder besiegt)? */
  function turnDone(state) {
    const actor = byUid(state, state.current);
    return !actor || !isTurnOf(state, actor) || (state.turn.moved && state.turn.acted);
  }

  /* ---------- Bewegung ---------- */

  // Kontrollzone: Wer ein Feld neben einem Gegner betritt, muss dort stehen bleiben.
  function inZoc(foes, x, y) {
    return foes.some((f) => Math.max(Math.abs(f.x - x), Math.abs(f.y - y)) === 1);
  }

  /**
   * Erreichbare Felder: [{ x, y, steps }]. Durch eigene Einheiten darf man hindurch,
   * durch Gegner nicht, und neben Gegnern endet die Bewegung.
   */
  function reachable(state, actor) {
    if (!isTurnOf(state, actor) || state.turn.moved) return [];
    const map = state.map;
    const foes = alive(state, opponent(actor.side));
    const steps = GridMap.bfs(map, [actor], (x, y) => {
      const u = unitAt(state, x, y);
      return !u || u.side === actor.side;
    }, actor.move, (x, y) => inZoc(foes, x, y));
    const out = [];
    steps.forEach((d, k) => {
      const x = k % map.w, y = Math.floor(k / map.w);
      if (d > 0 && !unitAt(state, x, y)) out.push({ x, y, steps: d });
    });
    return out;
  }

  function move(state, actor, x, y) {
    const dest = reachable(state, actor).find((t) => t.x === x && t.y === y);
    if (!dest) return false;
    actor.x = x; actor.y = y;
    state.turn.moved = true;
    state.events = [{ uid: actor.uid, kind: 'move' }];
    log(state, actor.name + ' bewegt sich ' + dest.steps + (dest.steps === 1 ? ' Feld.' : ' Felder.'), 'move');
    if (actor.side === 'ally' && isGoal(state, x, y)) {
      actor.escaped = true;
      log(state, actor.name + ' hat das Ziel erreicht!', 'win');
    }
    // Gegner in Sichtweite werden aufmerksam
    if (actor.side === 'ally') alive(state, 'enemy').forEach((e) => alertCheck(state, e));
    checkWinner(state);
    return true;
  }

  /** Auf Bewegung verzichten. */
  function skipMove(state, actor) {
    if (isTurnOf(state, actor)) state.turn.moved = true;
  }

  /* ---------- Aktionen ---------- */

  /** Beschreibt Seite, Wirkungsart und Reichweite einer Aktion. */
  function actionInfo(state, actor, action) {
    if (!isTurnOf(state, actor)) return { valid: false, reason: 'Nicht am Zug' };
    if (state.turn.acted) return { valid: false, reason: 'Schon gehandelt' };
    switch (action.type) {
      case 'attack':
        return { side: opponent(actor.side), scope: 'single', range: actor.range, valid: true };
      case 'defend':
        return { side: actor.side, scope: 'none', range: 0, valid: true };
      case 'skill': {
        const s = actor.skills[action.skill];
        if (!s) return { valid: false, reason: 'Unbekannte Fähigkeit' };
        const ok = actor.mp >= s.mp;
        return {
          side: s.kind === 'heal' ? actor.side : opponent(actor.side),
          scope: s.target, range: s.range, valid: ok, reason: ok ? '' : 'Nicht genug MP',
        };
      }
      case 'item': {
        const d = state.itemDefs[action.item];
        if (!d) return { valid: false, reason: 'Unbekanntes Objekt' };
        const has = (state.items[action.item] || 0) > 0;
        return {
          side: d.effect === 'damage' ? opponent(actor.side) : actor.side,
          scope: ['single', 'area', 'all'].includes(d.target) ? d.target : 'single',
          range: Math.max(1, num(d.range, 1)),
          valid: has && actor.side === 'ally',
          reason: has ? '' : 'Keine mehr übrig',
        };
      }
      default:
        return { valid: false, reason: 'Unbekannte Aktion' };
    }
  }

  /** Wählbare Ziele (in Reichweite). Bei Wirkung auf "alle" sind alle der Seite betroffen. */
  function targets(state, actor, action) {
    const info = actionInfo(state, actor, action);
    if (!info.valid || info.scope === 'none') return [];
    const side = alive(state, info.side);
    if (info.scope === 'all') return side;
    return side.filter((u) => GridMap.dist(actor, u) <= info.range);
  }

  /** Alle Einheiten, die eine Aktion mit diesem Ziel trifft. */
  function affected(state, actor, action, target) {
    const info = actionInfo(state, actor, action);
    if (info.scope === 'all') return alive(state, info.side);
    if (!target) return [];
    if (info.scope === 'area') return alive(state, info.side).filter((u) => GridMap.dist(u, target) <= AREA_RADIUS);
    return [target];
  }

  function event(state, unit, kind, amount) {
    state.events.push({ uid: unit.uid, kind, amount });
  }

  function dealDamage(state, attacker, target, power) {
    const atk = attacker.atk + attacker.buffAtk;
    const def = target.def + target.buffDef;
    let dmg = (atk + power - def * 0.5) * (0.85 + state.rng() * 0.3);
    const crit = state.rng() < 0.1;
    if (crit) dmg *= 1.5;
    if (target.defending) dmg *= 0.5;
    applyDamage(state, target, Math.max(1, Math.round(dmg)), crit ? ' (Kritisch!)' : '');
  }

  function applyDamage(state, target, dmg, suffix) {
    target.hp = Math.max(0, target.hp - dmg);
    target.alerted = true;
    event(state, target, 'dmg', dmg);
    log(state, target.name + ' erleidet ' + dmg + ' Schaden' + (suffix || '') + '.', 'dmg');
    if (target.hp === 0) log(state, target.name + ' wurde besiegt!', 'ko');
  }

  function heal(state, target, amount) {
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + Math.max(0, Math.round(amount)));
    event(state, target, 'heal', target.hp - before);
    log(state, target.name + ' erhält ' + (target.hp - before) + ' HP.', 'heal');
  }

  /** Führt eine Aktion aus. Gibt false zurück, wenn sie ungültig ist (z. B. Ziel außer Reichweite). */
  function act(state, actor, action) {
    const info = actionInfo(state, actor, action);
    if (!info.valid) return false;
    let target = null;
    if (info.scope === 'single' || info.scope === 'area') {
      target = targets(state, actor, action).find((u) => u.uid === action.target);
      if (!target) return false;
    }
    const hit = affected(state, actor, action, target);
    const onTarget = target ? ' auf ' + target.name : '';
    state.events = [];
    state.turn.acted = true;

    switch (action.type) {
      case 'attack':
        log(state, actor.name + ' greift ' + target.name + ' an.', 'action');
        dealDamage(state, actor, target, 0);
        break;
      case 'defend':
        actor.defending = true;
        log(state, actor.name + ' verteidigt sich.', 'action');
        break;
      case 'skill': {
        const s = actor.skills[action.skill];
        actor.mp -= s.mp;
        log(state, actor.name + ' setzt ' + s.name + ' ein' + onTarget + '.', 'action');
        hit.forEach((t) => {
          if (s.kind === 'heal') heal(state, t, s.power + actor.atk * 0.25);
          else dealDamage(state, actor, t, s.power);
        });
        break;
      }
      case 'item': {
        const d = state.itemDefs[action.item];
        const value = num(d.value, 0);
        state.items[action.item]--;
        log(state, actor.name + ' benutzt ' + d.name + onTarget + '.', 'action');
        hit.forEach((t) => {
          if (d.effect === 'heal') heal(state, t, value);
          else if (d.effect === 'damage') applyDamage(state, t, Math.max(1, Math.round(t.defending ? value / 2 : value)));
          else if (d.effect === 'mana') {
            const before = t.mp;
            t.mp = Math.min(t.maxMp, t.mp + value);
            log(state, t.name + ' erhält ' + (t.mp - before) + ' MP.', 'heal');
          } else if (d.effect === 'buffAtk') {
            t.buffAtk += value;
            log(state, 'Angriff von ' + t.name + ' steigt um ' + value + '.', 'buff');
          } else if (d.effect === 'buffDef') {
            t.buffDef += value;
            log(state, 'Verteidigung von ' + t.name + ' steigt um ' + value + '.', 'buff');
          }
        });
        break;
      }
    }
    checkWinner(state);
    return true;
  }

  /* ---------- KI ---------- */

  function lowestHp(units) {
    return units.slice().sort((a, b) => a.hp - b.hp)[0];
  }

  /** Beste Aktion von der aktuellen Position aus – oder null, wenn nichts sinnvoll/möglich ist. */
  function aiAction(state, actor) {
    const opts = (action) => targets(state, actor, action);
    const usable = actor.skills.map((s, i) => ({ s, i })).filter((x) => x.s.mp <= actor.mp);
    const hurt = (list) => list.filter((u) => u.hp / u.maxHp < 0.4);

    // 1. Verletzte heilen
    const heals = usable.filter((x) => x.s.kind === 'heal').sort((a, b) => b.s.power - a.s.power);
    for (const h of heals) {
      const action = { type: 'skill', skill: h.i };
      const inRange = hurt(opts(action));
      if (inRange.length) return Object.assign(action, { target: lowestHp(inRange).uid });
    }
    if (actor.side === 'ally') {
      const potion = Object.keys(state.items).find((id) =>
        state.items[id] > 0 && state.itemDefs[id] && state.itemDefs[id].effect === 'heal' &&
        hurt(opts({ type: 'item', item: id })).length);
      if (potion) {
        const action = { type: 'item', item: potion };
        return Object.assign(action, { target: lowestHp(hurt(opts(action))).uid });
      }
    }

    // 2. Angreifen
    const basic = opts({ type: 'attack' });
    const skillOpts = usable.filter((x) => x.s.kind === 'damage')
      .map((x) => ({ x, action: { type: 'skill', skill: x.i } }))
      .filter((o) => opts(o.action).length);
    if (skillOpts.length && (!basic.length || state.rng() < 0.6)) {
      // Flächenangriff bevorzugen, wenn er mehrere trifft
      let best = null;
      skillOpts.forEach((o) => {
        opts(o.action).forEach((t) => {
          const n = affected(state, actor, o.action, t).length;
          const score = n * 100 - t.hp;
          if (!best || score > best.score) best = { score, action: Object.assign({}, o.action, { target: t.uid }) };
        });
      });
      return best.action;
    }
    if (basic.length) return { type: 'attack', target: lowestHp(basic).uid };
    return null;
  }

  /** Größte Reichweite, mit der die Einheit gerade Schaden machen kann. */
  function attackReach(actor) {
    return actor.skills.reduce((r, s) => (s.kind === 'damage' && s.mp <= actor.mp ? Math.max(r, s.range) : r), actor.range);
  }

  /** Zielfeld der Bewegung – oder null, wenn die Einheit stehen bleibt. */
  function aiDestination(state, actor) {
    const map = state.map;
    const options = [{ x: actor.x, y: actor.y, steps: 0 }].concat(reachable(state, actor));
    const foes = alive(state, opponent(actor.side));
    const reach = attackReach(actor);
    const canHit = (t) => foes.some((f) => GridMap.dist(t, f) <= reach);
    let best = null;
    const consider = (t, score) => {
      if (!best || score < best.score || (score === best.score && t.steps < best.t.steps)) best = { t, score };
    };

    if (actor.side === 'ally' && state.goalDist.has(GridMap.key(map, actor.x, actor.y))) {
      // Richtung Ziel, unterwegs gern in Angriffsreichweite
      options.forEach((t) => {
        const d = state.goalDist.get(GridMap.key(map, t.x, t.y));
        if (d == null) return;
        consider(t, d * 10 + (!state.turn.acted && canHit(t) ? 0 : 1));
      });
    } else {
      if (actor.side === 'enemy' && !actor.alerted) return null;
      if (!foes.length) return null;
      const foeDist = GridMap.bfs(map, foes);
      options.forEach((t) => {
        if (canHit(t)) {
          // In Reichweite: Fernkämpfer halten Abstand
          const closest = Math.min(...foes.map((f) => GridMap.dist(t, f)));
          consider(t, -closest);
        } else {
          const d = foeDist.get(GridMap.key(map, t.x, t.y));
          consider(t, 1000 + (d == null ? 500 + Math.min(...foes.map((f) => GridMap.dist(t, f))) : d));
        }
      });
    }
    return best && best.t.steps > 0 ? best.t : null;
  }

  /**
   * Führt einen Schritt (Bewegung oder Aktion) der KI aus.
   * Gibt false zurück, wenn die Einheit in diesem Zug nichts mehr tut.
   */
  function aiStep(state, actor) {
    if (!isTurnOf(state, actor)) return false;
    const t = state.turn;
    if (actor.side === 'enemy' && !actor.alerted) return false;
    if (!t.acted) {
      const a = aiAction(state, actor);
      if (a && act(state, actor, a)) return true;
    }
    if (!t.moved) {
      const dest = aiDestination(state, actor);
      if (dest && move(state, actor, dest.x, dest.y)) return true;
      skipMove(state, actor);
    }
    if (!t.acted && isTurnOf(state, actor)) {
      const a = aiAction(state, actor);
      if (a && act(state, actor, a)) return true;
    }
    return false;
  }

  /** Spielt einen Kampf komplett automatisch durch. */
  function autoPlay(state) {
    let actor;
    while ((actor = next(state))) {
      while (aiStep(state, actor)) { /* weiter */ }
    }
    return state;
  }

  /**
   * Viele automatische Kämpfe für Balancing-Tests.
   * @param {object} opts wie bei create()
   * @param {number} runs
   */
  function simulate(opts, runs) {
    const result = { runs, wins: 0, losses: 0, draws: 0, rounds: 0, hpLeft: 0, units: {} };
    for (let r = 0; r < runs; r++) {
      const state = autoPlay(create(Object.assign({}, opts, { quiet: true })));
      if (state.winner === 'ally') result.wins++;
      else if (state.winner === 'enemy') result.losses++;
      else result.draws++;
      result.rounds += Math.min(state.round, MAX_ROUNDS);
      const allies = state.units.filter((u) => u.side === 'ally');
      const total = allies.reduce((s, u) => s + u.maxHp, 0) || 1;
      result.hpLeft += allies.reduce((s, u) => s + u.hp, 0) / total;
      allies.forEach((u) => {
        const s = result.units[u.uid] = result.units[u.uid] || { name: u.name, icon: u.icon, alive: 0, escaped: 0 };
        if (u.hp > 0) s.alive++;
        if (u.escaped) s.escaped++;
      });
    }
    result.winRate = result.wins / runs;
    result.avgRounds = result.rounds / runs;
    result.avgHpLeft = result.hpLeft / runs;
    return result;
  }

  const Battle = {
    MAX_ROUNDS, AREA_RADIUS,
    create, next, turnDone, reachable, move, skipMove,
    actionInfo, targets, affected, act,
    aiAction, aiStep, autoPlay, simulate,
    alive, byUid, unitAt, isActive, isGoal,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Battle;
  else global.Battle = Battle;
})(this);
