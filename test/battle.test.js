const test = require('node:test');
const assert = require('node:assert');
const Battle = require('../js/battle.js');
const GridMap = require('../js/map.js');
const Data = require('../js/data.js');

const { SAMPLE } = Data;

// Deterministischer Zufallsgenerator für reproduzierbare Tests
function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const ally = (id) => SAMPLE.allies.find((a) => a.id === id);
const enemy = (id) => SAMPLE.enemies.find((e) => e.id === id);
const map = (...rows) => ({ w: rows[0].length, h: rows.length, rows });

/* ---------- Map ---------- */

test('Map: Start- und Zielfelder, Standard = unterste/oberste Reihe', () => {
  const m = map('GG..', '....', '.SS.');
  assert.deepStrictEqual(GridMap.goalTiles(m), [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  assert.strictEqual(GridMap.startTiles(m).length, 2);
  const plain = map('...', '...', '...');
  assert.strictEqual(GridMap.goalTiles(plain).length, 3);
  assert.ok(GridMap.startTiles(plain).every((t) => t.y === 2));
});

test('Map: diagonale Schritte zählen 1, Wände blockieren', () => {
  const m = map('....', '.##.', '....');
  const d = GridMap.bfs(m, [{ x: 0, y: 2 }]);
  assert.strictEqual(d.get(GridMap.key(m, 0, 0)), 2);
  assert.strictEqual(d.get(GridMap.key(m, 3, 0)), 4, 'Umweg um die Wand');
  assert.ok(!d.has(GridMap.key(m, 1, 1)));
  assert.strictEqual(GridMap.dist({ x: 0, y: 0 }, { x: 3, y: 2 }), 3);
});

test('Map: Größe ändern erhält oberste und unterste Reihe', () => {
  const m = GridMap.create(5, 6);
  const enemies = [{ id: 'x', x: 1, y: 5 }, { id: 'y', x: 4, y: 3 }];
  GridMap.resize(m, 4, 8, enemies);
  assert.strictEqual(m.rows.length, 8);
  assert.strictEqual(m.rows[0], 'GGGG');
  assert.ok(m.rows[7].includes('S'));
  assert.deepStrictEqual(enemies, [{ id: 'x', x: 1, y: 7 }]);
});

/* ---------- Kampf ---------- */

test('Allys starten auf den Startfeldern, Gegner auf ihrer Position', () => {
  const state = Battle.create({
    map: map('GGGGG', '.....', '.....', '.SSS.'),
    allies: [ally('a-ritter'), ally('a-heiler')],
    enemies: [{ def: enemy('e-goblin'), x: 1, y: 1 }],
  });
  const [knight, healer] = state.units.filter((u) => u.side === 'ally');
  assert.deepStrictEqual([knight.x, knight.y], [2, 3]);
  assert.strictEqual(healer.y, 3);
  const goblin = state.units.find((u) => u.side === 'enemy');
  assert.deepStrictEqual([goblin.x, goblin.y], [1, 1]);
});

test('Bewegung: höchstens BEW Felder, nicht durch Wände', () => {
  const state = Battle.create({ map: map('G......', '.......', '.......', '###.###', '.......', '...S...'), allies: [ally('a-ritter')] });
  const knight = Battle.next(state);
  const reach = Battle.reachable(state, knight);
  assert.ok(reach.every((t) => t.steps <= knight.move));
  assert.ok(!reach.some((t) => t.y === 3 && t.x !== 3));
  assert.ok(Battle.move(state, knight, 3, 2));
  assert.strictEqual(Battle.move(state, knight, 3, 1), false, 'nur eine Bewegung pro Zug');
});

test('Kontrollzone: neben einem Gegner endet die Bewegung', () => {
  const state = Battle.create({
    map: map('GGGGG', '#...#', '#...#', '#...#', '#.S.#'),
    allies: [ally('a-schurkin')],
    enemies: [{ def: enemy('e-ork'), x: 2, y: 2 }],
  });
  const rogue = state.units.find((u) => u.side === 'ally');
  state.queue = [rogue.uid]; state.round = 1;
  Battle.next(state);
  const reach = Battle.reachable(state, rogue);
  // Der Ork versperrt den Gang: dahinter ist trotz BEW 5 nichts erreichbar
  assert.ok(!reach.some((t) => t.y <= 1));
  assert.ok(reach.some((t) => t.x === 2 && t.y === 3));
});

test('Nahkampf nur aus der Nähe, Fernkampf auf Distanz', () => {
  const state = Battle.create({
    map: map('G......', '.......', '.......', '.......', '...SS..'),
    allies: [ally('a-ritter'), ally('a-jaegerin')],
    enemies: [{ def: enemy('e-ork'), x: 3, y: 1 }],
    rng: () => 0.5,
  });
  const [knight, hunter] = state.units.filter((u) => u.side === 'ally');
  const ork = state.units.find((u) => u.side === 'enemy');
  state.queue = [knight.uid, hunter.uid]; state.round = 1;
  Battle.next(state);
  assert.strictEqual(Battle.act(state, knight, { type: 'attack', target: ork.uid }), false);
  Battle.next(state);
  assert.ok(Battle.act(state, hunter, { type: 'attack', target: ork.uid }));
  assert.ok(ork.hp < ork.maxHp);
});

test('Flächenangriff trifft Ziel und Nachbarn', () => {
  const state = Battle.create({
    map: map('G......', '.......', '.......', '.......', '...S...'),
    allies: [ally('a-magierin')],
    enemies: [{ def: enemy('e-schleim'), x: 3, y: 1 }, { def: enemy('e-schleim'), x: 4, y: 1 }, { def: enemy('e-schleim'), x: 0, y: 1 }],
    rng: () => 0.5,
  });
  const mage = Battle.next(state).side === 'ally' ? Battle.byUid(state, state.current) : null;
  state.turn = { uid: 'ally-0', moved: false, acted: false }; state.current = 'ally-0';
  const m = mage || Battle.byUid(state, 'ally-0');
  assert.ok(Battle.act(state, m, { type: 'skill', skill: 1, target: 'enemy-0' }));
  const hurt = state.units.filter((u) => u.side === 'enemy' && u.hp < u.maxHp).map((u) => u.uid);
  assert.deepStrictEqual(hurt.sort(), ['enemy-0', 'enemy-1']);
});

test('Ziel erreicht: Sieg, auch wenn Gegner übrig sind', () => {
  const state = Battle.create({
    map: map('GGG', '...', '.S.'),
    allies: [ally('a-ritter')],
    enemies: [{ def: enemy('e-schleim'), x: 0, y: 1 }],
  });
  const knight = state.units.find((u) => u.side === 'ally');
  state.queue = [knight.uid]; state.round = 1;
  Battle.next(state);
  state.units.find((u) => u.side === 'enemy').x = 2; // aus der Kontrollzone räumen
  state.units.find((u) => u.side === 'enemy').y = 2;
  assert.ok(Battle.move(state, knight, 0, 0));
  assert.ok(knight.escaped);
  assert.strictEqual(state.winner, 'ally');
});

test('Siegbedingung "alle": erst wenn alle Überlebenden im Ziel sind', () => {
  const state = Battle.create({ map: map('GGGG', '....', '....', '.SS.'), allies: [ally('a-ritter'), ally('a-heiler')] });
  const [a, b] = state.units;
  state.queue = [a.uid]; state.round = 1;
  Battle.next(state);
  a.y = 1;
  Battle.skipMove(state, a);
  state.turn.moved = false;
  Battle.move(state, a, 1, 0);
  assert.ok(a.escaped);
  assert.strictEqual(state.winner, null);
  b.hp = 0;
  state.queue = [];
  assert.strictEqual(Battle.next(state), null);
  assert.strictEqual(state.winner, 'ally');
});

test('Gegner bleiben ruhig, bis ein Ally in Sichtweite ist', () => {
  const state = Battle.create({
    map: GridMap.create(5, 12),
    allies: [ally('a-ritter')],
    enemies: [{ def: enemy('e-schleim'), x: 2, y: 1 }],
  });
  const slime = state.units.find((u) => u.side === 'enemy');
  state.queue = [slime.uid]; state.round = 1;
  Battle.next(state);
  assert.strictEqual(slime.alerted, false);
  assert.strictEqual(Battle.aiStep(state, slime), false);
  assert.deepStrictEqual([slime.x, slime.y], [2, 1]);
});

test('Objekte haben Reichweite und werden verbraucht', () => {
  const state = Battle.create({
    map: map('G....', '.....', '.SS..'),
    allies: [ally('a-ritter'), ally('a-heiler')],
    items: { 'o-heiltrank': 1 }, itemDefs: SAMPLE.objects,
  });
  const [knight, healer] = state.units;
  state.queue = [knight.uid]; state.round = 1;
  Battle.next(state);
  healer.hp = 10;
  assert.ok(Battle.act(state, knight, { type: 'item', item: 'o-heiltrank', target: healer.uid }));
  assert.strictEqual(healer.hp, 50);
  assert.strictEqual(state.items['o-heiltrank'], 0);
});

test('Automatischer Kampf endet in allen Beispiel-Leveln', () => {
  SAMPLE.levels.forEach((l, i) => {
    const state = Battle.autoPlay(Battle.create({
      map: l.map, goalRule: l.goalRule,
      allies: SAMPLE.allies.slice(0, l.maxParty),
      enemies: l.enemies.map((p) => ({ def: enemy(p.id), x: p.x, y: p.y })),
      itemDefs: SAMPLE.objects, rng: seeded(i + 1),
    }));
    assert.ok(['ally', 'enemy', 'draw'].includes(state.winner), l.name);
  });
});

test('Simulation liefert Statistiken', () => {
  const l = SAMPLE.levels[0];
  const r = Battle.simulate({ map: l.map, allies: SAMPLE.allies.slice(0, 2), enemies: [{ def: enemy('e-schleim') }] }, 20);
  assert.strictEqual(r.wins + r.losses + r.draws, 20);
  assert.ok(r.winRate >= 0 && r.winRate <= 1);
});

/* ---------- Daten ---------- */

test('Alte Daten ohne Map werden übernommen', () => {
  const data = Data.normalize({
    levels: [{ id: 'l1', name: 'Alt', enemies: ['e1', 'e1'], rewards: [] }],
    enemies: [{ id: 'e1', name: 'Alt-Gegner', skills: [{ name: 'Feuer', kind: 'damage', power: 5, mp: 1, target: 'all' }] }],
  });
  const l = data.levels[0];
  assert.strictEqual(l.map.w, 7);
  assert.strictEqual(l.enemies.length, 2);
  assert.ok(l.enemies.every((e) => e.id === 'e1' && Number.isInteger(e.x)));
  const e = data.enemies[0];
  assert.strictEqual(e.move, 3);
  assert.strictEqual(e.skills[0].target, 'area');
  assert.strictEqual(e.skills[0].range, 3);
});

/* ---------- Schutz, Freeze, Beschwören ---------- */

// Kleines Testfeld: Einheit `uid` ist sofort am Zug
function turnOf(state, uid) {
  state.round = Math.max(1, state.round);
  state.queue = [uid];
  return Battle.next(state);
}

test('Schutz: Schild fängt Schaden ab und läuft nach der Dauer ab', () => {
  const state = Battle.create({
    map: map('G....', '.....', '..S..'),
    allies: [ally('a-ritter')],
    enemies: [{ def: enemy('e-ork'), x: 2, y: 1 }],
    rng: () => 0.5,
  });
  const knight = state.units.find((u) => u.side === 'ally');
  const ork = state.units.find((u) => u.side === 'enemy');
  turnOf(state, knight.uid);
  assert.ok(Battle.act(state, knight, { type: 'skill', skill: 1, target: knight.uid }));
  assert.strictEqual(knight.shield, 30);
  turnOf(state, ork.uid);
  Battle.act(state, ork, { type: 'attack', target: knight.uid });
  assert.strictEqual(knight.hp, knight.maxHp, 'Schaden komplett abgefangen');
  assert.ok(knight.shield < 30);
  turnOf(state, knight.uid); // Dauer 2 → noch aktiv
  assert.ok(knight.shield > 0);
  turnOf(state, knight.uid); // abgelaufen
  assert.strictEqual(knight.shield, 0);
});

test('Freeze: Ziel setzt aus und hält niemanden auf', () => {
  const state = Battle.create({
    map: map('GGGGG', '#...#', '#...#', '#...#', '#.S.#'),
    allies: [ally('a-magierin')],
    enemies: [{ def: enemy('e-ork'), x: 2, y: 2 }],
    rng: () => 0.5,
  });
  const mage = state.units.find((u) => u.side === 'ally');
  const ork = state.units.find((u) => u.side === 'enemy');
  turnOf(state, mage.uid);
  assert.ok(Battle.act(state, mage, { type: 'skill', skill: 2, target: ork.uid }));
  assert.strictEqual(ork.frozen, 1);
  assert.ok(ork.hp < ork.maxHp, 'Zusatzschaden');
  // Kontrollzone gilt nicht für Eingefrorene
  assert.ok(Battle.reachable(state, mage).some((t) => t.y === 1));
  // Der Ork kommt nicht zum Zug
  state.queue = [ork.uid, mage.uid];
  assert.strictEqual(Battle.next(state).uid, mage.uid);
  assert.strictEqual(ork.frozen, 0);
});

test('Beschwören: Figur erscheint auf freiem Feld, zählt nicht für den Sieg und verschwindet', () => {
  const state = Battle.create({
    map: map('GGGGG', '.....', '.....', '.....', '..S..'),
    allies: [ally('a-beschwoererin')],
    summonDefs: { allies: SAMPLE.allies, enemies: SAMPLE.enemies },
  });
  const caster = state.units[0];
  turnOf(state, caster.uid);
  const action = { type: 'skill', skill: 0 };
  const tiles = Battle.summonTiles(state, caster, action);
  assert.ok(tiles.length > 0 && tiles.every((t) => GridMap.dist(t, caster) <= 2));
  assert.strictEqual(Battle.act(state, caster, Object.assign({}, action, { x: 4, y: 0 })), false, 'Ziel-/Außerhalb-Feld ungültig');
  assert.ok(Battle.act(state, caster, Object.assign({}, action, { x: 2, y: 2 })));
  const wolf = state.units.find((u) => u.summoned);
  assert.strictEqual(wolf.name, 'Geisterwolf');
  assert.deepStrictEqual([wolf.x, wolf.y], [2, 2]);
  // Beschwörerin fällt → Niederlage, obwohl der Wolf noch lebt
  caster.hp = 0;
  state.queue = [];
  assert.strictEqual(Battle.next(state), null);
  assert.strictEqual(state.winner, 'enemy');
});

test('Beschwörung mit Dauer verschwindet nach ihren Zügen', () => {
  const state = Battle.create({
    map: map('GGGGG', '.....', '.....', '.....', '..S..'),
    allies: [ally('a-beschwoererin')],
    summonDefs: { allies: SAMPLE.allies, enemies: [] },
  });
  const caster = state.units[0];
  turnOf(state, caster.uid);
  Battle.act(state, caster, { type: 'skill', skill: 0, x: 2, y: 2 });
  const wolf = state.units.find((u) => u.summoned);
  for (let i = 0; i < 4; i++) assert.strictEqual(turnOf(state, wolf.uid).uid, wolf.uid);
  state.queue = [wolf.uid, caster.uid];
  assert.strictEqual(Battle.next(state).uid, caster.uid);
  assert.strictEqual(wolf.hp, 0);
});

test('KI nutzt Beschwören, Freeze und Schutz', () => {
  const r = Battle.simulate({
    map: SAMPLE.levels[3].map,
    allies: ['a-ritter', 'a-magierin', 'a-beschwoererin'].map(ally),
    enemies: SAMPLE.levels[3].enemies.map((p) => ({ def: enemy(p.id), x: p.x, y: p.y })),
    summonDefs: { allies: SAMPLE.allies, enemies: SAMPLE.enemies },
  }, 10);
  assert.strictEqual(r.wins + r.losses + r.draws, 10);
  const state = Battle.autoPlay(Battle.create({
    map: SAMPLE.levels[3].map,
    allies: ['a-ritter', 'a-magierin', 'a-beschwoererin'].map(ally),
    enemies: SAMPLE.levels[3].enemies.map((p) => ({ def: enemy(p.id), x: p.x, y: p.y })),
    summonDefs: { allies: SAMPLE.allies, enemies: SAMPLE.enemies },
    rng: seeded(7),
  }));
  const text = state.log.map((l) => l.text).join('\n');
  assert.match(text, /beschwört/);
  assert.match(text, /eingefroren/);
});
