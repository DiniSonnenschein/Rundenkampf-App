# ⚔️ Rundenkampf-Studio

Eine kleine Web-App zum **Erstellen** und **Testen** von Inhalten für ein rundenbasiertes Kampfspiel.
Das eigentliche Spiel folgt später – die Kampf-Engine (`js/battle.js`) ist dafür bereits wiederverwendbar.

## Starten

**Online (empfohlen):** <https://dinisonnenschein.github.io/Rundenkampf-App/>
(sobald GitHub Pages aktiviert ist, siehe unten)

**Lokal:** `index.html` im Browser öffnen – oder `npm start` → <http://localhost:8080>

## Als App installieren (Icon auf dem Startbildschirm)

Die App ist eine *Progressive Web App* und funktioniert nach dem ersten Öffnen auch offline.
Installieren klappt nur über die Online-Adresse (HTTPS), nicht über eine lokal geöffnete Datei.

- **iPhone/iPad (Safari):** Teilen-Symbol ⬆️ → „Zum Home-Bildschirm“
- **Android (Chrome):** Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“
- **PC (Chrome/Edge):** Knopf „📲 Installieren“ oben in der App oder Install-Symbol in der Adressleiste

### GitHub Pages einmalig aktivieren

Repository auf GitHub → **Settings** → **Pages** → bei *Source* „Deploy from a branch“ wählen →
Branch `ccr-158abe65-z3ymq2` und Ordner `/ (root)` → **Save**. Nach ca. 1–2 Minuten ist die App unter der
Adresse oben erreichbar. Jeder neue Push aktualisiert sie automatisch.

> Hinweis: Die Daten liegen im Speicher des jeweiligen Browsers bzw. der installierten App.
> Zum Übertragen auf ein anderes Gerät: **Export** → Datei rüberschicken → **Import**.

## Erstell-Modus

| Bereich     | Inhalt |
|-------------|--------|
| 🗺️ Level    | Map (Breite × Höhe, Felder malen, Gegner platzieren), Siegbedingung, max. Teamgröße, Belohnungen |
| 🧪 Objekte  | Effekt (Heilen, MP, Schaden, Angriff+/Verteidigung+), Wert, Ziel, Reichweite |
| 🛡️ Allys    | HP, MP, Angriff, Verteidigung, Tempo, Bewegung, Angriffsreichweite, Fähigkeiten |
| 👹 Gegner   | wie Allys, zusätzlich Sichtweite und EP-Belohnung |

**Map-Editor:** Werkzeug wählen und über die Felder tippen oder ziehen.
Feldarten: ⬜ Boden, 🧱 Wand, 🟦 Startfeld der Allys, 🏁 Ziel. Gegner werden mit „Gegner setzen“ auf ein Feld gestellt.
Ohne Start-/Zielfelder gelten die unterste bzw. oberste Reihe. Der Editor warnt, wenn das Ziel nicht erreichbar ist.

Fähigkeiten haben MP-Kosten, eine Reichweite und eine von fünf Arten:

| Art | Wirkung | Werte |
|-----|---------|-------|
| ⚔️ Schaden | Angriff + Stärke − halbe Verteidigung | Stärke, Ziel |
| 💚 Heilung | Stärke + ¼ Angriff HP | Stärke, Ziel |
| 🔰 Schutz | Schild, der Schaden abfängt, bis er aufgebraucht ist oder die Dauer abläuft | Schildpunkte, Dauer, Ziel |
| ❄️ Freeze | Ziel setzt Züge aus und hält niemanden auf (keine Kontrollzone) | Zusatzschaden, Dauer, Ziel |
| ✨ Ally beschwören | Figur aus der Ally-Liste erscheint auf einem freien Feld in Reichweite (bei Gegnern: aus der Gegner-Liste) | Figur, Anzahl, Dauer (0 = dauerhaft) |

Ziel: ein Ziel · Fläche (Ziel + direkte Nachbarfelder) · alle. Die Dauer zählt in eigenen Zügen der betroffenen Figur.
Beschworene Figuren kämpfen mit (die KI lässt sie Gegner jagen), zählen aber nicht für Sieg oder Niederlage,
können das Ziel nicht „erreichen“, selbst nicht beschwören und geben keine EP.
Alles wird automatisch im Browser gespeichert (localStorage). Über **Export/Import** lassen sich
die Daten als JSON-Datei sichern bzw. laden; **Beispiele** lädt einen Demo-Datensatz.

## Test-Modus

1. Level wählen (mit Vorschau der Startaufstellung) oder „Freie Gegnerauswahl“
2. Team zusammenstellen (bis zur max. Teamgröße des Levels)
3. Inventar mit Objekten füllen
4. **Kampf starten** – Allys selbst steuern oder per „Auto“ von der KI spielen lassen
5. **Simulation ×100** spielt 100 Kämpfe automatisch durch und zeigt Siegquote, Ø Runden und
   wie oft jeder Ally das Ziel erreicht bzw. überlebt – praktisch fürs Balancing

### Regeln

- **Ziel:** Die Allys starten unten und müssen das Ziel oben erreichen – egal, ob noch Gegner übrig sind.
  Siegbedingung pro Level: *alle überlebenden Allys* oder *ein Ally* im Ziel. Niederlage, wenn alle Allys besiegt sind.
  Allys im Ziel verlassen das Spielfeld.
- **Zugreihenfolge** pro Runde nach Tempo.
- **Ein Zug** = einmal bewegen (bis zu *Bewegung* Felder, auch diagonal) **und** eine Aktion
  (Angriff, Fähigkeit, Objekt, Verteidigen) – in beliebiger Reihenfolge. Man darf auch auf beides verzichten.
- **Bewegung:** nicht durch Wände (auch nicht diagonal zwischen zwei Wänden hindurch), nicht durch Gegner;
  durch eigene Figuren darf man hindurch, aber nicht auf ihnen stehen bleiben.
- **Kontrollzone:** Wer ein Feld direkt neben einem Gegner betritt, muss dort stehen bleiben.
  So können Nahkämpfer Gänge versperren.
- **Reichweite:** Abstand in Feldern (diagonal zählt 1). Reichweite 1 = Nahkampf (nur Nachbarfelder).
- **Sichtweite:** Gegner (💤) werden erst aktiv, wenn ein Ally so nah kommt oder sie angegriffen werden.
- Schaden = (Angriff + Stärke − Verteidigung × 0,5) × Zufall 85–115 %, 10 % Chance auf kritischen Treffer (×1,5)
- **Verteidigen** halbiert erlittenen Schaden bis zum nächsten eigenen Zug
- Heilung durch Fähigkeiten = Stärke + Angriff × 0,25

## Entwicklung

```
index.html        Oberfläche
css/style.css     Design
js/map.js         Map-Raster: Felder, Abstände, Wegsuche, Größe ändern
js/data.js        Schemas, Beispieldaten, Speicherung, Übernahme alter Daten
js/battle.js      Kampf-Engine inkl. KI (ohne DOM, auch in Node nutzbar)
js/editor.js      Erstell-Modus (generischer Editor aus den Schemas)
js/testmode.js    Test-Modus
js/app.js         Navigation, Import/Export, Installation
manifest.webmanifest, sw.js, icons/   App-Installation & Offline-Modus
test/             Tests der Kampf-Engine
```

Tests ausführen: `npm test` (Node ≥ 18, keine Abhängigkeiten).
