# ⚔️ Rundenkampf-Studio

Eine kleine Web-App zum **Erstellen** und **Testen** von Inhalten für ein rundenbasiertes Kampfspiel.
Das eigentliche Spiel folgt später – die Kampf-Engine (`js/battle.js`) ist dafür bereits wiederverwendbar.

## Starten

Keine Installation nötig: einfach `index.html` im Browser öffnen.
Alternativ mit lokalem Server: `npm start` → <http://localhost:8080>

## Erstell-Modus

| Bereich     | Inhalt |
|-------------|--------|
| 🗺️ Level    | Name, Symbol, max. Teamgröße, Gegner (mit Anzahl), Belohnungs-Objekte, Beschreibung |
| 🧪 Objekte  | Effekt (Heilen, MP, Schaden, Angriff+/Verteidigung+), Wert, Ziel (eins/alle) |
| 🛡️ Allys    | HP, MP, Angriff, Verteidigung, Tempo, Fähigkeiten |
| 👹 Gegner   | wie Allys, zusätzlich EP-Belohnung |

Fähigkeiten haben eine Art (Schaden/Heilung), Stärke, MP-Kosten und ein Ziel (eins/alle).
Alles wird automatisch im Browser gespeichert (localStorage). Über **Export/Import** lassen sich
die Daten als JSON-Datei sichern bzw. laden; **Beispiele** lädt einen Demo-Datensatz.

## Test-Modus

1. Level wählen (oder „Freie Gegnerauswahl“)
2. Team zusammenstellen (bis zur max. Teamgröße des Levels)
3. Inventar mit Objekten füllen
4. **Kampf starten** – Allys selbst steuern (Angriff, Fähigkeit, Objekt, Verteidigen) oder per „Auto“ von der KI spielen lassen
5. **Simulation ×100** spielt 100 Kämpfe automatisch durch und zeigt Siegquote, Ø Runden und Überlebensraten – praktisch fürs Balancing

### Kampfregeln

- Zugreihenfolge pro Runde nach **Tempo**
- Schaden = (Angriff + Stärke − Verteidigung × 0,5) × Zufall 85–115 %, 10 % Chance auf kritischen Treffer (×1,5)
- **Verteidigen** halbiert erlittenen Schaden bis zum nächsten eigenen Zug
- Heilung durch Fähigkeiten = Stärke + Angriff × 0,25

## Entwicklung

```
index.html        Oberfläche
css/style.css     Design
js/data.js        Schemas, Beispieldaten, Speicherung
js/battle.js      Kampf-Engine (ohne DOM, auch in Node nutzbar)
js/editor.js      Erstell-Modus (generischer Editor aus den Schemas)
js/testmode.js    Test-Modus
js/app.js         Navigation, Import/Export
test/             Tests der Kampf-Engine
```

Tests ausführen: `npm test` (Node ≥ 18, keine Abhängigkeiten).
