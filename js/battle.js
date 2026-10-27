/*
 * Kampf-Engine (ohne DOM). Wird vom Test-Modus genutzt und kann später
 * vom eigentlichen Spiel wiederverwendet werden.
 */
(function (global) {
  'use strict';

  const MAX_ROUNDS = 200;

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
      xp: num(src.xp, 0),
      skills: (src.skills || []).map((s) => ({
        name: s.name || 'Fähigkeit',
        kind: s.kind === 'heal' ? 'heal' : 'damage',
        power: num(s.power, 0),
        mp: Math.max(0, num(s.mp, 0)),
        target: s.target === 'all' ? 'all' : 'single',
      })),
      buffAtk: 0,
      buffDef: 0,
      defending: false,
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

  /**
   * @param {object} opts
   * @param {object[]} opts.allies   Ally-Definitionen
   * @param {object[]} opts.enemies  Gegner-Definitionen (Duplikate erlaubt)
   * @param {object}   opts.items    { objektId: anzahl }
   * @param {object[]} opts.itemDefs Objekt-Definitionen
   * @param {function} [opts.rng]    Zufallsfunktion (0..1)
   * @param {boolean}  [opts.quiet]  Kein Kampflog schreiben
   */
  function create(opts) {
    const allies = (opts.allies || []).map((a, i) => makeUnit(a, 'ally', i));
    const enemies = (opts.enemies || []).map((e, i) => makeUnit(e, 'enemy', i));
    labelDuplicates(enemies);
    const itemDefs = {};
    (opts.itemDefs || []).forEach((d) => { itemDefs[d.id] = d; });
    return {
      units: allies.concat(enemies),
      items: Object.assign({}, opts.items || {}),
      itemDefs,
      round: 0,
      queue: [],
      current: null,
      winner: null,
      log: [],
      events: [],
      quiet: !!opts.quiet,
      rng: opts.rng || Math.random,
    };
  }

  function log(state, text, kind) {
    if (!state.quiet) state.log.push({ text, kind: kind || 'info' });
  }

  function byUid(state, uid) {
    return state.units.find((u) => u.uid === uid) || null;
  }

  function alive(state, side) {
    return state.units.filter((u) => u.hp > 0 && (!side || u.side === side));
  }

  function opponent(side) {
    return side === 'ally' ? 'enemy' : 'ally';
  }

  function checkWinner(state) {
    if (state.winner) return state.winner;
    if (!alive(state, 'enemy').length) state.winner = 'ally';
    else if (!alive(state, 'ally').length) state.winner = 'enemy';
    else if (state.round > MAX_ROUNDS) state.winner = 'draw';
    return state.winner;
  }

  /** Nächste Einheit am Zug bestimmen. Gibt null zurück, wenn der Kampf vorbei ist. */
  function next(state) {
    if (checkWinner(state)) { state.current = null; return null; }
    let actor = null;
    while (!actor) {
      if (!state.queue.length) {
        state.round++;
        if (checkWinner(state)) { state.current = null; return null; }
        state.queue = alive(state)
          .map((u) => ({ u, tie: state.rng() }))
          .sort((a, b) => b.u.spd - a.u.spd || a.tie - b.tie)
          .map((x) => x.u.uid);
        log(state, 'Runde ' + state.round, 'round');
      }
      const u = byUid(state, state.queue.shift());
      if (u && u.hp > 0) actor = u;
    }
    actor.defending = false;
    state.current = actor.uid;
    return actor;
  }

  /** Beschreibt, auf welche Seite und wie viele Ziele eine Aktion wirkt. */
  function actionInfo(state, actor, action) {
    switch (action.type) {
      case 'attack':
        return { side: opponent(actor.side), scope: 'single', valid: true };
      case 'defend':
        return { side: actor.side, scope: 'none', valid: true };
      case 'skill': {
        const s = actor.skills[action.skill];
        if (!s) return { valid: false, reason: 'Unbekannte Fähigkeit' };
        return {
          side: s.kind === 'heal' ? actor.side : opponent(actor.side),
          scope: s.target,
          valid: actor.mp >= s.mp,
          reason: actor.mp >= s.mp ? '' : 'Nicht genug MP',
        };
      }
      case 'item': {
        const d = state.itemDefs[action.item];
        if (!d) return { valid: false, reason: 'Unbekanntes Objekt' };
        const has = (state.items[action.item] || 0) > 0;
        return {
          side: d.effect === 'damage' ? opponent(actor.side) : actor.side,
          scope: d.target === 'all' ? 'all' : 'single',
          valid: has && actor.side === 'ally',
          reason: has ? '' : 'Keine mehr übrig',
        };
      }
      default:
        return { valid: false, reason: 'Unbekannte Aktion' };
    }
  }

  function targets(state, actor, action) {
    const info = actionInfo(state, actor, action);
    return info.valid ? alive(state, info.side) : [];
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
    dmg = Math.max(1, Math.round(dmg));
    applyDamage(state, target, dmg, crit ? ' (Kritisch!)' : '');
  }

  function applyDamage(state, target, dmg, suffix) {
    target.hp = Math.max(0, target.hp - dmg);
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

  /** Führt eine Aktion aus. Gibt false zurück, wenn sie ungültig war. */
  function act(state, actor, action) {
    if (state.winner || !actor || actor.hp <= 0) return false;
    const info = actionInfo(state, actor, action);
    if (!info.valid) return false;
    state.events = [];

    let hit = [];
    if (info.scope === 'all') {
      hit = alive(state, info.side);
    } else if (info.scope === 'single') {
      const t = byUid(state, action.target);
      if (t && t.hp > 0 && t.side === info.side) hit = [t];
      else hit = alive(state, info.side).slice(0, 1);
    }

    switch (action.type) {
      case 'attack':
        log(state, actor.name + ' greift ' + hit[0].name + ' an.', 'action');
        dealDamage(state, actor, hit[0], 0);
        break;
      case 'defend':
        actor.defending = true;
        log(state, actor.name + ' verteidigt sich.', 'action');
        break;
      case 'skill': {
        const s = actor.skills[action.skill];
        actor.mp -= s.mp;
        log(state, actor.name + ' setzt ' + s.name + ' ein' +
          (info.scope === 'single' ? ' auf ' + hit[0].name : '') + '.', 'action');
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
        log(state, actor.name + ' benutzt ' + d.name +
          (info.scope === 'single' ? ' auf ' + hit[0].name : '') + '.', 'action');
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

    if (checkWinner(state)) {
      if (state.winner === 'ally') log(state, 'Sieg!', 'win');
      else if (state.winner === 'enemy') log(state, 'Niederlage …', 'lose');
    }
    return true;
  }

  /** Einfache KI für Gegner und automatisch gesteuerte Allys. */
  function ai(state, actor) {
    const own = alive(state, actor.side);
    const foes = alive(state, opponent(actor.side));
    const hurt = own.filter((u) => u.hp / u.maxHp < 0.4).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    const usable = actor.skills.map((s, i) => ({ s, i })).filter((x) => x.s.mp <= actor.mp);

    if (hurt.length) {
      const heals = usable.filter((x) => x.s.kind === 'heal').sort((a, b) => b.s.power - a.s.power);
      if (heals.length) {
        const pick = hurt.length > 1 && heals.find((x) => x.s.target === 'all') || heals[0];
        return { type: 'skill', skill: pick.i, target: hurt[0].uid };
      }
      if (actor.side === 'ally') {
        const potion = Object.keys(state.items).find((id) =>
          state.items[id] > 0 && state.itemDefs[id] && state.itemDefs[id].effect === 'heal');
        if (potion) return { type: 'item', item: potion, target: hurt[0].uid };
      }
    }

    const target = foes.slice().sort((a, b) => a.hp - b.hp)[0];
    const attacks = usable.filter((x) => x.s.kind === 'damage');
    if (attacks.length && state.rng() < 0.6) {
      const area = foes.length > 1 && attacks.find((x) => x.s.target === 'all');
      const pick = area || attacks[Math.floor(state.rng() * attacks.length)];
      return { type: 'skill', skill: pick.i, target: target.uid };
    }
    return { type: 'attack', target: target.uid };
  }

  /** Spielt einen Kampf komplett automatisch durch. */
  function autoPlay(state) {
    let actor;
    while ((actor = next(state))) act(state, actor, ai(state, actor));
    return state;
  }

  /**
   * Viele automatische Kämpfe für Balancing-Tests.
   * @param {object} opts wie bei create()
   * @param {number} runs
   */
  function simulate(opts, runs) {
    const result = { runs, wins: 0, losses: 0, draws: 0, rounds: 0, hpLeft: 0, survival: {} };
    (opts.allies || []).forEach((a, i) => { result.survival['ally-' + i] = { name: a.name, icon: a.icon, alive: 0 }; });
    for (let r = 0; r < runs; r++) {
      const state = autoPlay(create(Object.assign({}, opts, { quiet: true })));
      if (state.winner === 'ally') result.wins++;
      else if (state.winner === 'enemy') result.losses++;
      else result.draws++;
      result.rounds += Math.min(state.round, MAX_ROUNDS);
      const allies = state.units.filter((u) => u.side === 'ally');
      const total = allies.reduce((s, u) => s + u.maxHp, 0) || 1;
      result.hpLeft += allies.reduce((s, u) => s + u.hp, 0) / total;
      allies.forEach((u) => { if (u.hp > 0) result.survival[u.uid].alive++; });
    }
    result.winRate = result.wins / runs;
    result.avgRounds = result.rounds / runs;
    result.avgHpLeft = result.hpLeft / runs;
    return result;
  }

  const Battle = { create, next, act, ai, actionInfo, targets, alive, byUid, autoPlay, simulate, MAX_ROUNDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Battle;
  else global.Battle = Battle;
})(this);
