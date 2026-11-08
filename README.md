# Orbit

Kalender, To-dos, Listen, Trainingspläne und Personen in einer App – als Web-App, die du am Handy wie eine normale App installierst.

**App öffnen:** https://curseoficarus.github.io/orbit/

## Aufs Handy holen

- **iPhone (Safari):** Link öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.
- **Android (Chrome):** Link öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

Danach startet Orbit wie eine eigene App mit eigenem Symbol und funktioniert auch offline.

## Was die App kann

- **Heute / Woche / Monat:** alle Termine, Aufgaben, Trainingseinheiten und Geburtstage in einem Blick, zum Abhaken.
- **Kalender:** Monatsansicht mit farbigen Punkten je Tag (zum Monatswechsel nach links/rechts wischen).
- **Listen:** eigene Listen, Aufgaben mit oder ohne Datum, Sammelliste „Irgendwann“.
- **Training:** Pläne mit Zeitraum, Trainingstagen, optionaler Uhrzeit, Notizen zu den Übungen; jede Einheit erscheint im Kalender und unter „Heute“.
- **Personen:** Geburtstag (steht jedes Jahr automatisch im Kalender), Telefon, E-Mail, Adresse, Notizen.
- **Einstellungen (Zahnrad):** Hell/Dunkel/Automatisch, Tags anlegen, umbenennen, Farbe ändern, löschen; Backup speichern und einspielen.
- Alles lässt sich bearbeiten und löschen – Löschen kann man direkt rückgängig machen.

## Deine Daten

Alle Einträge werden **nur auf deinem Gerät** gespeichert (im Browser-Speicher unter `orbit-data`). Es gibt keinen Server und kein Konto.

- **Updates löschen nichts:** Ein Update ersetzt nur die Programmdateien. Deine Daten bleiben, wo sie sind. Ändert sich einmal das Datenformat, werden alte Daten beim Start automatisch übernommen (`migrate()` in `app.js`).
- **Backup:** Einstellungen → „Backup speichern“ erzeugt eine `.json`-Datei. Mit „Backup einspielen“ holst du sie zurück, z. B. auf einem neuen Handy.
- Achtung: Wenn du die Website-Daten im Browser löschst oder die App vom Home-Bildschirm entfernst, sind die Daten auf dem Gerät weg – dafür gibt es das Backup.

## Technik

Reines HTML, CSS und JavaScript ohne Build-Schritt: `index.html`, `styles.css`, `app.js`, `sw.js` (Offline-Unterstützung), `manifest.webmanifest`, `icons/`.
Gehostet über GitHub Pages vom Branch `main`.

**Neue Version veröffentlichen:** Dateien ändern, in `app.js` `APP_VERSION` und in `sw.js` `CACHE` hochzählen, committen und pushen. Beim nächsten Öffnen holt sich die App die neue Version – die Daten bleiben erhalten.
