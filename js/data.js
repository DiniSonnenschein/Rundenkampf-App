/*
 * Datenmodell, Beispieldaten und Speicherung (localStorage).
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'rundenkampf-data-v1';
  const TYPES = ['levels', 'objects', 'allies', 'enemies'];

  const characterFields = [
    { key: 'icon', label: 'Symbol', type: 'icon', default: '🙂' },
    { key: 'name', label: 'Name', type: 'text', default: 'Neue Figur' },
    { key: 'maxHp', label: 'HP', type: 'number', default: 100, min: 1 },
    { key: 'maxMp', label: 'MP', type: 'number', default: 20, min: 0 },
    { key: 'atk', label: 'Angriff', type: 'number', default: 10, min: 0 },
    { key: 'def', label: 'Verteidigung', type: 'number', default: 8, min: 0 },
    { key: 'spd', label: 'Tempo', type: 'number', default: 10, min: 0 },
  ];

  const skillsField = { key: 'skills', label: 'Fähigkeiten', type: 'skills', default: [], wide: true };
  const descField = { key: 'description', label: 'Beschreibung', type: 'textarea', default: '', wide: true };

  const SCHEMAS = {
    levels: {
      label: 'Level', singular: 'Level', icon: '🗺️',
      fields: [
        { key: 'icon', label: 'Symbol', type: 'icon', default: '🗺️' },
        { key: 'name', label: 'Name', type: 'text', default: 'Neues Level' },
        { key: 'maxParty', label: 'Max. Teamgröße', type: 'number', default: 3, min: 1, max: 6 },
        { key: 'enemies', label: 'Gegner', type: 'pick', source: 'enemies', default: [], wide: true },
        { key: 'rewards', label: 'Belohnungen (Objekte)', type: 'pick', source: 'objects', default: [], wide: true },
        descField,
      ],
      summary: (l) => (l.enemies || []).length + ' Gegner',
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
        { key: 'target', label: 'Ziel', type: 'select', default: 'single', options: [['single', 'Ein Ziel'], ['all', 'Alle']] },
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
      summary: (c) => 'HP ' + c.maxHp + ' · ANG ' + c.atk + ' · VER ' + c.def,
    },
    enemies: {
      label: 'Gegner', singular: 'Gegner', icon: '👹',
      fields: characterFields.map((f) => (f.key === 'icon' ? Object.assign({}, f, { default: '👾' }) : f))
        .concat([{ key: 'xp', label: 'EP-Belohnung', type: 'number', default: 10, min: 0 }, skillsField, descField]),
      summary: (c) => 'HP ' + c.maxHp + ' · ANG ' + c.atk + ' · VER ' + c.def,
    },
  };

  const SAMPLE = {
    objects: [
      { id: 'o-heiltrank', icon: '🧪', name: 'Heiltrank', effect: 'heal', value: 40, target: 'single', description: 'Heilt eine Figur.' },
      { id: 'o-aether', icon: '🔷', name: 'Äther', effect: 'mana', value: 15, target: 'single', description: 'Stellt MP wieder her.' },
      { id: 'o-bombe', icon: '💣', name: 'Bombe', effect: 'damage', value: 25, target: 'all', description: 'Trifft alle Gegner.' },
      { id: 'o-kraft', icon: '💪', name: 'Kraftelixier', effect: 'buffAtk', value: 5, target: 'single', description: 'Erhöht den Angriff für den Rest des Kampfes.' },
    ],
    allies: [
      { id: 'a-ritter', icon: '🛡️', name: 'Ritter', maxHp: 140, maxMp: 10, atk: 14, def: 14, spd: 8,
        skills: [{ name: 'Schildschlag', kind: 'damage', power: 8, mp: 3, target: 'single' }], description: 'Robust und zuverlässig.' },
      { id: 'a-magierin', icon: '🧙', name: 'Magierin', maxHp: 80, maxMp: 40, atk: 9, def: 6, spd: 11,
        skills: [{ name: 'Feuerball', kind: 'damage', power: 18, mp: 6, target: 'single' },
          { name: 'Blitzsturm', kind: 'damage', power: 10, mp: 10, target: 'all' }], description: 'Mächtige Zauber, wenig Ausdauer.' },
      { id: 'a-heiler', icon: '💚', name: 'Heiler', maxHp: 90, maxMp: 35, atk: 7, def: 8, spd: 10,
        skills: [{ name: 'Heilen', kind: 'heal', power: 30, mp: 5, target: 'single' },
          { name: 'Gruppenheilung', kind: 'heal', power: 18, mp: 12, target: 'all' }], description: 'Hält das Team am Leben.' },
      { id: 'a-schurkin', icon: '🗡️', name: 'Schurkin', maxHp: 95, maxMp: 15, atk: 15, def: 7, spd: 15,
        skills: [{ name: 'Doppelstich', kind: 'damage', power: 12, mp: 4, target: 'single' }], description: 'Schnell und gefährlich.' },
    ],
    enemies: [
      { id: 'e-schleim', icon: '🟢', name: 'Schleim', maxHp: 40, maxMp: 0, atk: 8, def: 3, spd: 6, xp: 5, skills: [], description: '' },
      { id: 'e-goblin', icon: '👺', name: 'Goblin', maxHp: 60, maxMp: 9, atk: 11, def: 5, spd: 12, xp: 10,
        skills: [{ name: 'Wurfmesser', kind: 'damage', power: 6, mp: 3, target: 'single' }], description: '' },
      { id: 'e-ork', icon: '👹', name: 'Ork', maxHp: 120, maxMp: 8, atk: 15, def: 9, spd: 7, xp: 25,
        skills: [{ name: 'Keulenhieb', kind: 'damage', power: 10, mp: 4, target: 'single' }], description: '' },
      { id: 'e-drache', icon: '🐉', name: 'Drache', maxHp: 320, maxMp: 50, atk: 18, def: 12, spd: 9, xp: 200,
        skills: [{ name: 'Feueratem', kind: 'damage', power: 8, mp: 10, target: 'all' },
          { name: 'Klauenhieb', kind: 'damage', power: 14, mp: 5, target: 'single' }], description: 'Der Endgegner.' },
    ],
    levels: [
      { id: 'l-wiese', icon: '🌿', name: 'Grüne Wiese', maxParty: 3, enemies: ['e-schleim', 'e-schleim', 'e-schleim'], rewards: ['o-heiltrank'], description: 'Ein leichter Einstieg.' },
      { id: 'l-hoehle', icon: '🕳️', name: 'Goblin-Höhle', maxParty: 3, enemies: ['e-goblin', 'e-goblin', 'e-schleim'], rewards: ['o-aether', 'o-heiltrank'], description: '' },
      { id: 'l-lager', icon: '⛺', name: 'Orklager', maxParty: 3, enemies: ['e-ork', 'e-goblin', 'e-goblin'], rewards: ['o-bombe'], description: '' },
      { id: 'l-hort', icon: '🌋', name: 'Drachenhort', maxParty: 4, enemies: ['e-drache'], rewards: ['o-kraft'], description: 'Nur für erfahrene Teams.' },
    ],
  };

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function emptyData() {
    return { levels: [], objects: [], allies: [], enemies: [] };
  }

  function normalize(raw) {
    const data = emptyData();
    TYPES.forEach((t) => {
      if (Array.isArray(raw && raw[t])) data[t] = raw[t].filter((x) => x && x.id).map((x) => withDefaults(t, x));
    });
    return data;
  }

  function withDefaults(type, item) {
    const out = Object.assign({}, item);
    SCHEMAS[type].fields.forEach((f) => {
      if (out[f.key] === undefined) out[f.key] = clone(f.default);
    });
    return out;
  }

  const Store = {
    data: emptyData(),

    load() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { raw = null; }
      this.data = raw ? normalize(raw) : clone(SAMPLE);
      if (!raw) this.save();
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
      // Verweise in Leveln aufräumen
      this.data.levels.forEach((l) => {
        if (type === 'enemies') l.enemies = l.enemies.filter((x) => x !== id);
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

  const Data = { SCHEMAS, SAMPLE, TYPES, Store, clone };
  if (typeof module !== 'undefined' && module.exports) module.exports = Data;
  else global.Data = Data;
})(this);
