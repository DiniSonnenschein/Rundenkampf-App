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
js/app.js         Navigation, Import/Export, Installation
manifest.webmanifest, sw.js, icons/   App-Installation & Offline-Modus
test/             Tests der Kampf-Engine
```

Tests ausführen: `npm test` (Node ≥ 18, keine Abhängigkeiten).
