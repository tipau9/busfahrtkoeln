# Busfahrt nach Köln

Web-App für die Reisebusfahrt Pontremoli → Köln.

**Live:** https://tipau9.github.io/busfahrtkoeln/

- **Fahrt:** Restzeit mit Sekunden, Ankunftszeit, km gefahren/verbleibend, Tempo, Ø-Tempo, Höhe, GPS-Genauigkeit, aktuelles Land mit Bus-Tempolimit, nächste Grenze, Wetter in Köln zur Ankunft und am Standort
- **Karte:** echte Straßenroute (OpenStreetMap/OSRM), Live-Position des Busses, gefahrene Spur
- **Unterwegs:** Was es draußen zu sehen gibt (Luganersee, Gotthard, Schwarzwald, Kölner Dom …) mit Entfernung und Uhrzeit, Roaming-Warnung für die Schweiz, Hinweise per Vibration und Benachrichtigung
- **Etappen:** alle Orte mit Kilometer und Durchfahrtszeit, manuelle Eingabe ohne GPS, Einstellungen

Funktioniert nach dem ersten Öffnen auch offline (z. B. im Gotthardtunnel).

## Auf GitHub Pages veröffentlichen

1. Auf github.com ein neues **öffentliches** Repository anlegen, z. B. `busfahrtkoeln`.
2. **Add file → Upload files** und alle Dateien aus diesem Ordner hochladen (inklusive Ordner `icons`). Dann **Commit changes**.
3. **Settings → Pages**: unter *Source* „Deploy from a branch“, Branch `main`, Ordner `/ (root)`, **Save**.
4. Nach 1–2 Minuten ist die App erreichbar unter
   `https://tipau9.github.io/busfahrtkoeln/`

## Aufs Handy installieren

- **Android (Chrome):** Link öffnen → Menü ⋮ → **App installieren** bzw. **Zum Startbildschirm hinzufügen**.
- **iPhone (Safari):** Link öffnen → Teilen-Symbol → **Zum Home-Bildschirm**.

Beim ersten Tippen auf **GPS starten** den Standort erlauben. Danach startet GPS beim Öffnen automatisch.

## Als APK

Den GitHub-Pages-Link auf pwabuilder.com eingeben → **Package for stores → Android** → APK herunterladen.

## Anpassen

Route, Kilometer und Plantempo stehen in `index.html` oben im Skript (`W` und `SPEED`).
