const test = require('node:test');
const assert = require('node:assert');
const Battle = require('../js/battle.js');
const { SAMPLE } = require('../js/data.js');

// Deterministischer Zufallsgenerator für reproduzierbare Tests
function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const enemy = (id) => SAMPLE.enemies.find((e) => e.id === id);

test('Zugreihenfolge richtet sich nach Tempo', () => {
  const state = Battle.create({ allies: [SAMPLE.allies[3]], enemies: [enemy('e-schleim')], rng: seeded(1) });
  assert.strictEqual(Battle.next(state).name, 'Schurkin');
  assert.strictEqual(state.round, 1);
});

test('Gleichnamige Gegner werden durchnummeriert', () => {
  const state = Battle.create({ allies: [SAMPLE.allies[0]], enemies: [enemy('e-goblin'), enemy('e-goblin')] });
  assert.deepStrictEqual(state.units.filter((u) => u.side === 'enemy').map((u) => u.name), ['Goblin A', 'Goblin B']);
});

test('Angriff verursacht Schaden, Verteidigen halbiert ihn', () => {
  const a = Battle.create({ allies: [SAMPLE.allies[0]], enemies: [enemy('e-ork')], rng: () => 0.5 });
  const b = Battle.create({ allies: [SAMPLE.allies[0]], enemies: [enemy('e-ork')], rng: () => 0.5 });
  b.units[1].defending = true;
  Battle.act(a, a.units[0], { type: 'attack', target: 'enemy-0' });
  Battle.act(b, b.units[0], { type: 'attack', target: 'enemy-0' });
  const dmgA = a.units[1].maxHp - a.units[1].hp;
  const dmgB = b.units[1].maxHp - b.units[1].hp;
  assert.ok(dmgA > 0);
  assert.ok(dmgB < dmgA);
});

test('Fähigkeiten kosten MP und sind ohne MP nicht nutzbar', () => {
  const state = Battle.create({ allies: [SAMPLE.allies[1]], enemies: [enemy('e-ork')], rng: seeded(2) });
  const mage = state.units[0];
  assert.ok(Battle.act(state, mage, { type: 'skill', skill: 0, target: 'enemy-0' }));
  assert.strictEqual(mage.mp, mage.maxMp - 6);
  mage.mp = 0;
  assert.strictEqual(Battle.act(state, mage, { type: 'skill', skill: 0, target: 'enemy-0' }), false);
});

test('Objekte werden verbraucht und wirken', () => {
  const state = Battle.create({
    allies: [SAMPLE.allies[0]], enemies: [enemy('e-ork')],
    items: { 'o-heiltrank': 1 }, itemDefs: SAMPLE.objects,
  });
  const knight = state.units[0];
  knight.hp = 10;
  assert.ok(Battle.act(state, knight, { type: 'item', item: 'o-heiltrank', target: knight.uid }));
  assert.strictEqual(knight.hp, 50);
  assert.strictEqual(state.items['o-heiltrank'], 0);
  assert.strictEqual(Battle.act(state, knight, { type: 'item', item: 'o-heiltrank', target: knight.uid }), false);
});

test('Automatischer Kampf endet mit einem Ergebnis', () => {
  const state = Battle.autoPlay(Battle.create({
    allies: SAMPLE.allies.slice(0, 3), enemies: [enemy('e-goblin'), enemy('e-schleim')], rng: seeded(3),
  }));
  assert.ok(['ally', 'enemy', 'draw'].includes(state.winner));
});

test('Simulation liefert Statistiken', () => {
  const r = Battle.simulate({ allies: SAMPLE.allies.slice(0, 2), enemies: [enemy('e-schleim')] }, 20);
  assert.strictEqual(r.wins + r.losses + r.draws, 20);
  assert.ok(r.winRate >= 0 && r.winRate <= 1);
});
