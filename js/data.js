/*
 * Datenmodell, Beispieldaten und Speicherung (localStorage).
 */
(function (global) {
  'use strict';

  const GridMap = (typeof module !== 'undefined' && module.exports) ? require('./map.js') : global.GridMap;

  const STORAGE_KEY = 'rundenkampf-data-v1';
  const TYPES = ['levels', 'objects', 'allies', 'enemies'];

  const TARGET_OPTIONS = [['single', 'Ein Ziel'], ['area', 'Fläche (Ziel + Nachbarfelder)'], ['all', 'Alle']];

  /** Arten von Fähigkeiten. Beschwören holt Figuren derselben Liste (Allys bzw. Gegner). */
  function skillKinds(type) {
    return [['damage', 'Schaden'], ['heal', 'Heilung'], ['shield', 'Schutz'], ['freeze', 'Freeze'],
      ['summon', type === 'enemies' ? 'Gegner beschwören' : 'Ally beschwören']];
  }

  // Startwerte, wenn eine Fähigkeit auf diese Art umgestellt wird
  const SKILL_DEFAULTS = {
    damage: { power: 10, duration: 0, target: 'single' },
    heal: { power: 20, duration: 0, target: 'single' },
    shield: { power: 25, duration: 2, target: 'single' },
    freeze: { power: 0, duration: 1, target: 'single' },
    summon: { power: 1, duration: 0, target: 'single' },
  };

  const characterFields = [
    { key: 'icon', label: 'Symbol', type: 'icon', default: '🙂' },
    { key: 'name', label: 'Name', type: 'text', default: 'Neue Figur' },
    { key: 'maxHp', label: 'HP', type: 'number', default: 100, min: 1 },
    { key: 'maxMp', label: 'MP', type: 'number', default: 20, min: 0 },
    { key: 'atk', label: 'Angriff', type: 'number', default: 10, min: 0 },
    { key: 'def', label: 'Verteidigung', type: 'number', default: 8, min: 0 },
    { key: 'spd', label: 'Tempo', type: 'number', default: 10, min: 0, hint: 'Bestimmt die Zugreihenfolge' },
    { key: 'move', label: 'Bewegung', type: 'number', default: 3, min: 0, max: 20, hint: 'Felder pro Zug (auch diagonal)' },
    { key: 'range', label: 'Angriffsreichweite', type: 'number', default: 1, min: 1, max: 20, hint: '1 = Nahkampf' },
  ];

  const skillsField = { key: 'skills', label: 'Fähigkeiten', type: 'skills', default: [], wide: true };
  const descField = { key: 'description', label: 'Beschreibung', type: 'textarea', default: '', wide: true };

  const SCHEMAS = {
    levels: {
      label: 'Level', singular: 'Level', icon: '🗺️',
      fields: [
        { key: 'icon', label: 'Symbol', type: 'icon', default: '🗺️' },
        { key: 'name', label: 'Name', type: 'text', default: 'Neues Level' },
        { key: 'maxParty', label: 'Max. Teamgröße', type: 'number', default: 3, min: 1, max: 8 },
        {
          key: 'goalRule', label: 'Siegbedingung', type: 'select', default: 'all',
          options: [['all', 'Alle überlebenden Allys im Ziel'], ['one', 'Ein Ally im Ziel']],
        },
        { key: 'map', label: 'Map', type: 'map', default: () => GridMap.create(7, 10), wide: true },
        { key: 'enemies', type: 'hidden', default: [] },
        { key: 'rewards', label: 'Belohnungen (Objekte)', type: 'pick', source: 'objects', default: [], wide: true },
        descField,
      ],
      summary: (l) => l.map.w + '×' + l.map.h + ' Felder · ' + l.enemies.length + ' Gegner',
    },
    objects: {
      label: 'Objekte', singular: 'Objekt', icon: '🧪',
      fields: [
        { key: 'icon', label: 'Symbol', type: 'icon', default: '🧪' },
        { key: 'name', label: 'Name', type: 'text', default: 'Neues Objekt' },
        {
          key: 'effect', label: 'Effekt', type: 'select', default: 'heal',
          options: [['heal', 'Heilt HP'], ['mana', 'Stellt MP her'], ['damage', 'Fügt Gegnern Schaden zu'],
            ['buffAtk', 'Erhöht Angriff'], ['buffDef', 'Erhöht Verteidigung']],
        },
        { key: 'value', label: 'Wert', type: 'number', default: 30, min: 0 },
        { key: 'target', label: 'Ziel', type: 'select', default: 'single', options: TARGET_OPTIONS },
        { key: 'range', label: 'Reichweite', type: 'number', default: 1, min: 1, max: 20, hint: '1 = selbst oder Nachbarfeld' },
        descField,
      ],
      summary: (o) => {
        const opt = SCHEMAS.objects.fields[2].options.find((x) => x[0] === o.effect);
        return (opt ? opt[1] : '') + ' · ' + o.value;
      },
    },
    allies: {
      label: 'Allys', singular: 'Ally', icon: '🛡️',
      fields: characterFields.concat([skillsField, descField]),
      summary: (c) => 'HP ' + c.maxHp + ' · ANG ' + c.atk + ' · BEW ' + c.move + ' · RW ' + c.range,
    },
    enemies: {
      label: 'Gegner', singular: 'Gegner', icon: '👹',
      fields: characterFields.map((f) => (f.key === 'icon' ? Object.assign({}, f, { default: '👾' }) : f)).concat([
        { key: 'sight', label: 'Sichtweite', type: 'number', default: 4, min: 0, max: 30, hint: 'Ab dieser Nähe greift der Gegner an' },
        { key: 'xp', label: 'EP-Belohnung', type: 'number', default: 10, min: 0 },
        skillsField, descField,
      ]),
      summary: (c) => 'HP ' + c.maxHp + ' · ANG ' + c.atk + ' · BEW ' + c.move + ' · RW ' + c.range,
    },
  };

  const skill = (name, kind, power, mp, range, target, extra) =>
    Object.assign({ name, kind, power, mp, range, target: target || 'single', duration: 0, summon: null }, extra);
  const at = (id, x, y) => ({ id, x, y });

  const SAMPLE = {
    objects: [
      { id: 'o-heiltrank', icon: '🧪', name: 'Heiltrank', effect: 'heal', value: 40, target: 'single', range: 1, description: 'Heilt eine Figur.' },
      { id: 'o-aether', icon: '🔷', name: 'Äther', effect: 'mana', value: 15, target: 'single', range: 1, description: 'Stellt MP wieder her.' },
      { id: 'o-bombe', icon: '💣', name: 'Bombe', effect: 'damage', value: 25, target: 'area', range: 3, description: 'Wurfgeschoss mit Flächenschaden.' },
      { id: 'o-kraft', icon: '💪', name: 'Kraftelixier', effect: 'buffAtk', value: 5, target: 'single', range: 1, description: 'Erhöht den Angriff für den Rest des Kampfes.' },
    ],
    allies: [
      { id: 'a-ritter', icon: '🛡️', name: 'Ritter', maxHp: 140, maxMp: 10, atk: 14, def: 14, spd: 8, move: 3, range: 1,
        skills: [skill('Schildschlag', 'damage', 8, 3, 1), skill('Schutzwall', 'shield', 30, 4, 1, 'single', { duration: 2 })],
        description: 'Robuster Nahkämpfer, schützt Verbündete.' },
      { id: 'a-magierin', icon: '🧙', name: 'Magierin', maxHp: 80, maxMp: 40, atk: 9, def: 6, spd: 11, move: 3, range: 1,
        skills: [skill('Feuerball', 'damage', 18, 6, 4), skill('Blitzsturm', 'damage', 10, 10, 3, 'area'),
          skill('Frostbann', 'freeze', 4, 8, 3, 'single', { duration: 1 })], description: 'Mächtige Fernzauber, wenig Ausdauer.' },
      { id: 'a-heiler', icon: '💚', name: 'Heiler', maxHp: 90, maxMp: 35, atk: 7, def: 8, spd: 10, move: 3, range: 1,
        skills: [skill('Heilen', 'heal', 30, 5, 3), skill('Gruppenheilung', 'heal', 18, 12, 1, 'all')], description: 'Hält das Team am Leben.' },
      { id: 'a-schurkin', icon: '🗡️', name: 'Schurkin', maxHp: 95, maxMp: 15, atk: 15, def: 7, spd: 15, move: 5, range: 1,
        skills: [skill('Doppelstich', 'damage', 12, 4, 1)], description: 'Schnell und gefährlich.' },
      { id: 'a-jaegerin', icon: '🏹', name: 'Jägerin', maxHp: 85, maxMp: 15, atk: 12, def: 6, spd: 12, move: 3, range: 4,
        skills: [skill('Pfeilhagel', 'damage', 6, 6, 4, 'area')], description: 'Greift aus der Distanz an.' },
      { id: 'a-beschwoererin', icon: '🔮', name: 'Beschwörerin', maxHp: 75, maxMp: 40, atk: 8, def: 6, spd: 10, move: 3, range: 1,
        skills: [skill('Wolf rufen', 'summon', 1, 12, 2, 'single', { duration: 4, summon: 'a-wolf' }), skill('Arkaner Schlag', 'damage', 10, 4, 3)],
        description: 'Ruft einen Geisterwolf zu Hilfe.' },
      { id: 'a-wolf', icon: '🐺', name: 'Geisterwolf', maxHp: 60, maxMp: 0, atk: 13, def: 5, spd: 14, move: 5, range: 1,
        skills: [], description: 'Wird von der Beschwörerin gerufen.' },
    ],
    enemies: [
      { id: 'e-schleim', icon: '🟢', name: 'Schleim', maxHp: 40, maxMp: 0, atk: 8, def: 3, spd: 6, move: 2, range: 1, sight: 3, xp: 5, skills: [], description: 'Langsam und harmlos.' },
      { id: 'e-fledermaus', icon: '🦇', name: 'Fledermaus', maxHp: 30, maxMp: 0, atk: 9, def: 2, spd: 16, move: 6, range: 1, sight: 6, xp: 6, skills: [], description: 'Sehr schnell.' },
      { id: 'e-goblin', icon: '👺', name: 'Goblin', maxHp: 60, maxMp: 9, atk: 11, def: 5, spd: 12, move: 4, range: 1, sight: 5, xp: 10,
        skills: [skill('Wurfmesser', 'damage', 6, 3, 3)], description: '' },
      { id: 'e-schuetze', icon: '💀', name: 'Skelett-Schütze', maxHp: 45, maxMp: 0, atk: 11, def: 4, spd: 9, move: 2, range: 4, sight: 6, xp: 12, skills: [], description: 'Schießt aus der Ferne.' },
      { id: 'e-ork', icon: '👹', name: 'Ork', maxHp: 120, maxMp: 8, atk: 15, def: 9, spd: 7, move: 3, range: 1, sight: 4, xp: 25,
        skills: [skill('Keulenhieb', 'damage', 10, 4, 1)], description: '' },
      { id: 'e-drache', icon: '🐉', name: 'Drache', maxHp: 320, maxMp: 50, atk: 20, def: 12, spd: 9, move: 3, range: 1, sight: 7, xp: 200,
        skills: [skill('Feueratem', 'damage', 8, 10, 3, 'area'), skill('Klauenhieb', 'damage', 14, 5, 1),
          skill('Brut rufen', 'summon', 2, 15, 2, 'single', { summon: 'e-fledermaus' })], description: 'Der Endgegner. Ruft Fledermäuse.' },
    ],
    levels: [
      {
        id: 'l-wiese', icon: '🌿', name: 'Grüne Wiese', maxParty: 3, goalRule: 'all',
        map: { w: 7, h: 9, rows: ['GGGGGGG', '.......', '.......', '...#...', '.......', '.#...#.', '.......', '.......', '..SSS..'] },
        enemies: [at('e-schleim', 1, 2), at('e-schleim', 5, 2), at('e-schleim', 3, 4)],
        rewards: ['o-heiltrank'], description: 'Ein leichter Einstieg.',
      },
      {
        id: 'l-hoehle', icon: '🕳️', name: 'Goblin-Höhle', maxParty: 3, goalRule: 'all',
        map: { w: 8, h: 11, rows: ['##GGGG##', '#......#', '#.#..#.#', '#......#', '###..###', '#......#', '#.#..#.#', '#......#', '###..###', '#......#', '##SSSS##'] },
        enemies: [at('e-goblin', 3, 1), at('e-goblin', 5, 3), at('e-schleim', 2, 3), at('e-fledermaus', 1, 5)],
        rewards: ['o-aether', 'o-heiltrank'], description: 'Enge Gänge – die Gegner versperren den Weg.',
      },
      {
        id: 'l-lager', icon: '⛺', name: 'Orklager', maxParty: 4, goalRule: 'all',
        map: { w: 9, h: 12, rows: ['GGGGGGGGG', '.........', '..#...#..', '..#...#..', '.........', '###.#.###', '.........', '.........', '..#...#..', '.........', '.........', '..SSSS...'] },
        enemies: [at('e-ork', 4, 3), at('e-ork', 4, 9), at('e-schuetze', 1, 1), at('e-schuetze', 7, 1), at('e-goblin', 2, 6), at('e-goblin', 6, 6)],
        rewards: ['o-bombe'], description: 'Schützen decken den Ausgang.',
      },
      {
        id: 'l-hort', icon: '🌋', name: 'Drachenhort', maxParty: 4, goalRule: 'all',
        map: { w: 9, h: 14, rows: ['GGGGGGGGG', '#.......#', '#.......#', '##..#..##', '#.......#', '#.......#', '#.......#', '###...###', '#.......#', '#.......#', '#..#.#..#', '#.......#', '#.......#', '##SSSSS##'] },
        enemies: [at('e-drache', 4, 5), at('e-fledermaus', 2, 9), at('e-fledermaus', 6, 9), at('e-schuetze', 2, 2), at('e-schuetze', 6, 2)],
        rewards: ['o-kraft'], description: 'Alle müssen am Drachen vorbei.',
      },
    ],
  };

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function emptyData() {
    return { levels: [], objects: [], allies: [], enemies: [] };
  }

  function defaultOf(f) {
    return typeof f.default === 'function' ? f.default() : clone(f.default);
  }

  function withDefaults(type, item) {
    const out = Object.assign({}, item);
    SCHEMAS[type].fields.forEach((f) => {
      if (out[f.key] === undefined) out[f.key] = defaultOf(f);
    });
    return out;
  }

  // Ältere Daten (ohne Map/Reichweiten) auf das aktuelle Format bringen
  function migrate(type, item) {
    if (type === 'levels') {
      item.map = GridMap.normalize(item.map);
      let auto = 0;
      item.enemies = (item.enemies || []).map((e) => {
        if (typeof e === 'string') {
          const i = auto++;
          const x = (i * 2 + 1) % item.map.w;
          const y = Math.min(item.map.h - 2, 1 + Math.floor((i * 2 + 1) / item.map.w));
          return { id: e, x, y };
        }
        return e && e.id ? { id: e.id, x: Math.round(Number(e.x)) || 0, y: Math.round(Number(e.y)) || 0 } : null;
      }).filter((e) => e && GridMap.inside(item.map, e.x, e.y));
    }
    if (type === 'allies' || type === 'enemies') {
      item.skills = (item.skills || []).map((s) => Object.assign({}, s, {
        range: s.range === undefined ? 3 : s.range,
        target: s.target === 'all' && s.kind !== 'heal' && s.range === undefined ? 'area' : s.target,
        duration: s.duration === undefined ? 0 : s.duration,
        summon: s.summon === undefined ? null : s.summon,
      }));
    }
    if (type === 'objects' && item.range === undefined && item.effect === 'damage') {
      item.range = 3;
      if (item.target === 'all') item.target = 'area';
    }
    return item;
  }

  function normalize(raw) {
    const data = emptyData();
    TYPES.forEach((t) => {
      if (Array.isArray(raw && raw[t])) {
        data[t] = raw[t].filter((x) => x && x.id).map((x) => withDefaults(t, migrate(t, Object.assign({}, x))));
      }
    });
    return data;
  }

  const Store = {
    data: emptyData(),

    load() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { raw = null; }
      this.data = raw ? normalize(raw) : clone(SAMPLE);
      this.save();
    },

    save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch (e) { /* z. B. privater Modus */ }
    },

    list(type) { return this.data[type]; },

    get(type, id) { return this.data[type].find((x) => x.id === id) || null; },

    newId(type) {
      return type[0] + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    },

    create(type, base) {
      const item = withDefaults(type, base ? clone(base) : {});
      item.id = this.newId(type);
      this.data[type].push(item);
      this.save();
      return item;
    },

    duplicate(type, id) {
      const src = this.get(type, id);
      if (!src) return null;
      const copy = this.create(type, src);
      copy.name = src.name + ' (Kopie)';
      this.save();
      return copy;
    },

    remove(type, id) {
      this.data[type] = this.data[type].filter((x) => x.id !== id);
      // Verweise aufräumen
      if (type === 'allies' || type === 'enemies') {
        this.data[type].forEach((c) => c.skills.forEach((s) => { if (s.summon === id) s.summon = null; }));
      }
      this.data.levels.forEach((l) => {
        if (type === 'enemies') l.enemies = l.enemies.filter((e) => e.id !== id);
        if (type === 'objects') l.rewards = l.rewards.filter((x) => x !== id);
      });
      this.save();
    },

    exportJson() { return JSON.stringify(this.data, null, 2); },

    importJson(text) {
      const raw = JSON.parse(text);
      if (!raw || typeof raw !== 'object') throw new Error('Ungültige Datei');
      this.data = normalize(raw);
      this.save();
    },

    loadSamples() { this.data = clone(SAMPLE); this.save(); },

    clear() { this.data = emptyData(); this.save(); },
  };

  const Data = { SCHEMAS, SAMPLE, TYPES, TARGET_OPTIONS, SKILL_DEFAULTS, skillKinds, Store, clone, normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = Data;
  else global.Data = Data;
})(this);
