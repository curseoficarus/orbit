# Orbit

Android-App für Kalender, To-dos, Listen, Trainingspläne und Personen.

## Installieren

1. Rechts unter **Releases** die neueste Version öffnen.
2. Unter „Assets“ die Datei **`Orbit-x.y.z.apk`** am Handy herunterladen und öffnen.
3. Beim ersten Mal fragt Android, ob der Browser Apps installieren darf – erlauben.

## Updates – deine Daten bleiben

Jede Änderung an diesem Repository baut automatisch eine neue APK (Reiter **Actions**) und legt sie unter **Releases** ab.
Die neue APK einfach **über die alte installieren, nicht vorher deinstallieren**. Dann bleiben alle Einträge erhalten.

Das klappt, weil jede APK mit demselben Schlüssel signiert wird (`android-signing/`) und die gleiche App-ID hat (`io.github.curseoficarus.orbit`). Diese beiden Dinge dürfen nie geändert werden.

Zusätzlich gibt es in der App unter **Einstellungen → Backup speichern** eine Sicherungsdatei, z. B. für ein neues Handy.

## Was die App kann

- **Heute / Woche / Monat:** Termine, Aufgaben, Trainings und Geburtstage auf einen Blick, zum Abhaken
- **Kalender:** Monatsansicht mit farbigen Punkten; zum Monatswechsel wischen
- **Listen:** eigene Listen, Aufgaben mit oder ohne Datum, Sammelliste „Irgendwann“
- **Training:** Pläne mit Zeitraum, Trainingstagen, optionaler Uhrzeit, Übungen (Sätze × Wiederholungen, bis Muskelversagen oder Dauer); Einheiten abhaken oder mit Grund auslassen
- **Personen:** Geburtstag (auch ohne Jahr; steht jedes Jahr im Kalender), Telefon, E-Mail, Adresse, Notiz
- **Notizen:** mit Überschrift, Text auch per Diktat
- **Sprachsteuerung (Mikrofon-Knopf):** Termine, Aufgaben, Urlaub, Listen, Personen und Notizen per Sprache anlegen – läuft auf dem Gerät, ohne KI-Dienst
- **Benachrichtigungen (Glocke auf „Heute“):** für Geburtstage, Termine, Aufgaben und Training einzeln wählbar
- **Einstellungen (Zahnrad):** Hell/Dunkel/Automatisch, Tags verwalten inkl. Farbe, Backup

## Aufbau

- `www/` – die App selbst (HTML, CSS, JavaScript, Schriften, Logo); `www/voice.js` ist der Sprachversteher
- `android-res/` – App-Symbol und Startbildschirm im Orbit-Logo
- `android-signing/` – Signaturschlüssel für die APK
- `capacitor.config.json`, `package.json` – Android-Verpackung mit Capacitor
- `.github/workflows/android.yml` – baut und veröffentlicht die APK

Neue Version: in `www/app.js` die `APP_VERSION` hochzählen, committen, pushen – fertig.
