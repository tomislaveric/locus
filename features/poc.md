# POC-Plan: FIT + GoPro zu einem Coin-Clip

## Ziel

Der POC beweist nur diese Annahme:

> Eine hochgeladene FIT-Datei und eine passende GPS-aktivierte GoPro-MP4 reichen aus, um automatisch einen kurzen MP4-Clip mit einem Coin-Overlay zu erzeugen.

Die Anwendung ist eine kleine Web-App. Nutzer laden genau eine FIT-Datei und genau eine MP4 hoch. Ein einzelner Server-Container verarbeitet die Dateien und bietet danach den Clip zum Download an.

## Strenger Scope

| Im POC | Nicht im POC |
|---|---|
| Ein vorab festgelegtes GoPro-Testgerät und **ein** daraus ausgelesener GPMF-Streamtyp (`GPS5` *oder* `GPS9`) | Andere GoPro-Modelle bzw. der andere GPMF-Streamtyp |
| Eine FIT-Datei, eine MP4, ein aktiver Coin | Mehrere Videos, weitere Kameras, mehrere Coins |
| Automatischer Zeitabgleich über FIT- und GPMF-Zeit | Manuelle Synchronisierung, GPS-/Positionsabgleich als zweite Validierung |
| Ein statisches Coin-Overlay mit `+100 XP` | Animationen, AR, 3D, Computer Vision |
| Anonymer Upload und einmaliger Download | Accounts, Historie, Social Sharing, Admin-UI |

Das Testgerät und dessen Streamtyp werden anhand der ersten zulässigen Referenzaufnahme festgelegt. Der POC unterstützt anschließend nur diese eine Kombination.

## Ergebnis

Der POC ist mit der festgelegten GPS5-GoPro-Referenzfahrt erfolgreich nachgewiesen:

- Die FIT-Durchfahrt durch den konfigurierten Coin wird erkannt, einschließlich linearer Interpolation zwischen zwei FIT-Trackpoints.
- Die GoPro-GPS5-Uhr wird automatisch mit den FIT-Zeitstempeln abgeglichen.
- Der MP4-Clip wird korrekt um das Ereignis gekürzt, mit einem statischen Coin-/`+100 XP`-Overlay versehen und erfolgreich heruntergeladen.

Für den Zeitabgleich genügt die GPS-Uhr im GPMF-Stream. Ein gültiger GPS-Positions-Fix der Kamera ist nicht erforderlich: plausible Zeitstempel werden über den daraus abgeleiteten Video-Startzeitpunkt geclustert; Platzhalter-Zeitstempel werden verworfen.

## Messbares Erfolgskriterium

Für die Referenzfahrt wird der Coin-Durchfahrtszeitpunkt im Video einmal manuell protokolliert.

Der POC ist bestanden, wenn:

1. die Anwendung die Coin-Durchquerung aus der FIT-Datei erkennt,
2. sie den Durchfahrtszeitpunkt automatisch auf eine Videosekunde abbildet,
3. diese Videosekunde höchstens **1,5 Sekunden** vom protokollierten Referenzwert abweicht und
4. ein abspielbarer Clip heruntergeladen werden kann.

Der Clip umfasst standardmäßig drei Sekunden vor und nach dem ermittelten Zeitpunkt. Liegt das Ereignis am Videorand, darf das Fenster asymmetrisch sein, muss aber mindestens vier Sekunden lang bleiben.

## Minimalarchitektur

```text
Browser
  │ Multipart-Upload
  ▼
Ein Docker-Container
  ├─ kleine Upload-/Status-Webseite
  ├─ API
  ├─ temporäre Jobverzeichnisse
  ├─ FIT-Parser
  ├─ GPMF-Extraktor für einen Streamtyp
  ├─ FFmpeg / FFprobe
  ├─ coins.json
  └─ ein Hintergrundjob im selben Prozess
        │
        ▼
Browser: Status-Polling und Download
```

- **Ein Container, kein externer Dienst:** Keine Datenbank, keine Queue, kein Object Storage, kein PostGIS und keine getrennten Worker.
- **Dateien:** Jeder Job erhält ein temporäres Verzeichnis mit hochgeladenen Dateien, `job.json`, `detection.json` und Ergebnis-MP4. Ein langer, zufälliger Job-Token schützt Status und Download.
- **Coin-Konfiguration:** Eine gemountete `coins.json` enthält genau einen aktiven Coin mit `id`, `latitude`, `longitude`, `radius_m` und `value`. Der Radius beträgt mindestens 5 m. Die Datei wird zu Beginn jedes Jobs gelesen; Coin-Änderungen brauchen keinen Image-Build.
- **Auslastung:** Es läuft höchstens ein Renderjob gleichzeitig. Ist der Container beschäftigt, wird ein neuer Upload klar abgelehnt.
- **Aufräumen:** Uploads, Zwischenartefakte und Ergebnisdateien bleiben höchstens 30 Minuten erhalten. Ein einfacher In-Process-Intervalljob entfernt danach das gesamte Jobverzeichnis.
- **Minimale Schutzgrenzen:** Uploadgröße, FFprobe-Vorprüfung sowie Laufzeitlimits für Parser und FFmpeg verhindern, dass beschädigte oder zu große Dateien den Container dauerhaft blockieren. Für originale GoPro-Kapitel im mehrstelligen-GB-Bereich werden die Grenzen per Umgebungsvariablen erhöht.

## Technischer Ablauf

1. Der Browser lädt FIT und MP4 hoch; die API legt ein temporäres Jobverzeichnis und einen Job-Token an.
2. FFprobe prüft den MP4-Container. Fehlt der festgelegte GPMF-Stream oder ist die Datei ungültig, endet der Job mit einem klaren Fehler.
3. Der FIT-Parser liest nach Zeit sortierte GPS-Trackpoints.
4. Die Engine prüft die FIT-Trackpoints auf zwei aufeinanderfolgende Positionen, die den Coin-Radius einschließen. Zwischen diesen beiden Punkten interpoliert sie den Durchquerungszeitpunkt linear aus Distanz und Zeit. Für typische 1-Hz-FIT-Samples und das 1,5-Sekunden-Ziel wird bewusst keine geodätische Linien-/Kreis-Schnittberechnung implementiert.
5. Der GPMF-Extraktor liest aus dem `gpmd`-Track des festgelegten Streamtyps GPS5-Zeit und relative Videozeit. Aus plausiblen GPS-Zeitstempeln wird ein stabiler UTC-Video-Startzeitpunkt ermittelt; ein GPS-Positions-Fix der Kamera ist dafür nicht erforderlich.
6. Die FIT-Durchfahrtszeit wird über diesen UTC-Video-Startzeitpunkt auf eine relative Videosekunde abgebildet. Liegt sie außerhalb der tatsächlichen Videodauer, wird kein Clip erstellt.
7. FFmpeg schneidet den Clip und legt am ermittelten Zeitpunkt ein statisches transparentes Overlay mit Coin und `+100 XP` darüber. Quellaudio wird übernommen, sofern dies ohne zusätzliche Komplexität möglich ist; Audio ist kein Erfolgskriterium des POC.
8. FFprobe prüft das Ergebnis-MP4. Die API setzt den Status auf erfolgreich und bietet den Download an.

## Arbeitspakete

1. **Telemetrie-Nachweis**
   - Eine zulässige Referenz-GPS-GoPro-MP4, passende FIT-Datei und den manuell protokollierten Coin-Durchfahrtszeitpunkt bereitstellen.
   - Den GPMF-Streamtyp der Aufnahme bestimmen und nur diesen Stream mit einem geeigneten Extraktor auslesen.
   - FIT-Zeit auf die Videozeit abbilden und die Abweichung zum Referenzwert messen.
   - Den FIT-/GPMF-Uhrzeitversatz als zentrale Annahme prüfen. Überschreitet die Abweichung 1,5 Sekunden, wird zuerst die Zeitbasis, UTC-Normalisierung und Stream-Zeitzuordnung untersucht – nicht vorschnell der Parser ersetzt.
   - Nur wenn die Abweichung maximal 1,5 Sekunden beträgt, mit dem Web-POC fortfahren.

2. **Ein-Container-Web-POC**
   - Docker-Container mit kleiner Upload-/Status-Seite, API, FIT-Parser, GPMF-Extraktor, FFmpeg und FFprobe erstellen.
   - Multipart-Upload, zufälligen Job-Token, Status-Polling und Ergebnisdownload implementieren.
   - Temporäre Jobverzeichnisse, Einzeljob-Sperre, Upload-/Laufzeitgrenzen und zeitgesteuerte Bereinigung implementieren.

3. **Coin-Durchfahrt und Zeitabbildung**
   - Den einzelnen Coin aus dem gemounteten `coins.json` laden.
   - Zwei aufeinanderfolgende FIT-Trackpoints erkennen, die den Coin-Radius einschließen, und den Zeitpunkt über lineare Distanz-/Zeitinterpolation bestimmen.
   - Den FIT-Zeitpunkt mit dem einen unterstützten GPMF-Stream über dessen stabile GPS-Uhr auf eine Videosekunde abbilden.
   - Nur diese Fehler behandeln: ungültige Eingabe, fehlender unterstützter GPMF-Stream, keine Coin-Durchfahrt, instabile GPS-Uhr, Ereignis außerhalb der Videodauer und zu kurzes Video.

4. **Clip rendern**
   - Ein statisches transparentes Coin-/`+100 XP`-Overlay bereitstellen.
   - Mit FFmpeg einen 4- bis 6-sekündigen MP4-Clip inklusive Quellaudio erzeugen.
   - Ergebnis mit FFprobe validieren und bei Erfolg zum Download anbieten.

5. **POC nachweisen**
   - Browser-End-to-End-Test: Upload, Status, automatische Zeitabbildung, Rendering und Download.
   - Die ermittelte Videosekunde gegen den manuellen Referenzwert testen.
   - Negative Tests für ungültige FIT, MP4 ohne unterstützten GPMF-Stream, instabile GPS-Uhr, Ereignis außerhalb der Videodauer, keine Coin-Durchfahrt und zu kurzes Video durchführen.

## Akzeptanzkriterien

- Die Referenz-FIT und die passende MP4 des festgelegten GoPro-Testgeräts können im Browser hochgeladen werden.
- Die Coin-Durchfahrt wird auch dann erkannt, wenn sie zwischen zwei FIT-Trackpoints liegt.
- Die automatisch bestimmte Videosekunde liegt maximal 1,5 Sekunden vom protokollierten Referenzwert entfernt.
- Die Anwendung erzeugt einen abspielbaren, mindestens vier Sekunden langen MP4-Clip mit statischem Coin- und `+100 XP`-Overlay.
- Nicht unterstützte, nicht synchronisierbare oder zeitlich nicht passende Eingaben liefern einen klaren Fehler statt eines vermeintlich erfolgreichen Clips.
- Nach höchstens 30 Minuten löscht der Container Uploads, Zwischenartefakte und Ergebnisdatei.

## Erst nach bestandenem POC

1. Der andere GPMF-Streamtyp, weitere GoPro-Modelle und Position-/Fixqualitätsprüfungen.
2. Coin-Animation, mehrere Coins und Highlight-Zusammenfassungen.
3. Object Storage, Datenbank, Queue und getrennte Worker für parallele Jobs.
4. Weitere Eventtypen, Videoquellen und GoPro-Kapiteldateien.
5. Manueller Synchronisationsanker, Admin-Karteneditor, Accounts und Community-Funktionen.
