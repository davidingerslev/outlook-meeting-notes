# Tasks: Terminauswahl bei Serienterminen

Umsetzung des in `PLAN.md` beschriebenen Features: Bei Serienterminen immer ein Auswahl-Popup
anzeigen, mit der nächsten anstehenden Instanz als Vorauswahl.

## Fortschritt (Legende)

- `[ ]` offen
- `[~]` in Arbeit
- `[x]` abgeschlossen

Nach Abschluss eines Tasks wird die Checkbox auf `[x]` gesetzt und unter „Status-Notizen" ein
kurzer Eintrag ergänzt.

---

## Task 1 – Datums-/Serienmuster-Grundlagen `[x]`

**Ziel:** Fundament zum Umrechnen und Expandieren von Serienmustern, ohne Obsidian-Abhängigkeit.

- [x] Hilfskonstante `EPOCH_1601_MS` und `minutesToDate(m)` ergänzen
- [x] Typ `OccurrenceChoice` / Instanz-Typ (`{ start: Date; end: Date }`) definieren
- [x] `recurFrequency`/`patternType`-Enums aus `@kenjiuno/msgreader` importieren/verwenden
- [x] Funktion `expandOccurrences(apptRecur, now)` implementieren:
  - [x] Daily (`period` in Minuten → Tage)
  - [x] Weekly (`period` in Wochen + `dayOfWeekBits`)
  - [x] Monthly / Yearly (`patternTypeMonth.day`, `patternTypeMonthNth`)
  - [x] Grenzen: `startDate`/`endDate`, `occurrenceCount`, `endType`
  - [x] `deletedInstanceDates` überspringen
  - [x] `modifiedInstanceDates`/`exceptionInfo` einsetzen
  - [x] Tageszeit aus `startTimeOffset`/`endTimeOffset`
  - [x] Fenster-Begrenzung bei unendlichen Serien (`MAX_OCCURRENCES`)

**Abhängigkeiten:** keine
**Verifikation:** `npm run build` fehlerfrei; Logik isoliert testbar gehalten.

---

## Task 2 – Fenster- und Vorauswahl-Logik `[x]`

**Ziel:** Aus der vollen Instanzliste das Anzeigefenster und die vorausgewählte Instanz bilden.

- [x] Funktion `buildChoiceList(occurrences, now)`:
  - [x] einige vergangene Instanzen (Default 3) einbeziehen
  - [x] nächste ~10 kommende Instanzen einbeziehen (Default 10)
  - [x] nächste anstehende Instanz (`end >= now`) bestimmen
  - [x] Fallback auf letzte Instanz, wenn Serie abgelaufen
  - [x] Liste so sortieren, dass die nächste Instanz **erster Eintrag** ist (= Enter-Vorauswahl)
  - [x] `isNext`-Flag, `isPast`-Flag und lesbares `label` (injizierbarer Formatter) setzen

**Abhängigkeiten:** Task 1
**Verifikation:** `npm run build`; manuelle Prüfung der Reihenfolge/Labels.

---

## Task 3 – Auswahl-Popup (`OccurrencePickerModal`)

**Ziel:** `SuggestModal`-basiertes Popup zur Terminauswahl.

- [ ] Klasse `OccurrencePickerModal extends SuggestModal<OccurrenceChoice>`
- [ ] `getSuggestions` (mit optionaler Textfilterung)
- [ ] `renderSuggestion` inkl. „Nächster Termin"-Markierung (`omn-next-hint`)
- [ ] `onChooseSuggestion` → Callback
- [ ] Placeholder-Text setzen
- [ ] Verhalten bei Abbruch (Popup ohne Auswahl geschlossen) definieren – keine Notiz erzeugen

**Abhängigkeiten:** Task 2
**Verifikation:** `npm run build`; manueller Test in Obsidian (Popup öffnet, Liste korrekt).

---

## Task 4 – Umbau `createMeetingNote` auf Callback-Ablauf

**Ziel:** Trennung von Datenaufbereitung, Auswahl und Dateierzeugung.

- [ ] Datenaufbereitung (`dataType`/`messageClass`-Check, `addHelperFunctions`,
      `helper_currentDT`) wie bisher
- [ ] Weiche: kein `apptRecur` → direkt; mit `apptRecur` → Popup
- [ ] Dateierzeugung in `finalizeMeetingNote(fileData, chosenStart, chosenEnd)` auslagern
- [ ] Felder setzen: `apptSelectedStartWhole`, `apptSelectedEndWhole`, `apptIsRecurring`,
      `apptBestStart`, `apptBestEnd`
- [ ] Fehler-/`Notice`-Pfad im asynchronen Callback erhalten
- [ ] Bestehende Felder (`apptStartWhole` etc.) unverändert lassen (keine Breaking Changes)

**Abhängigkeiten:** Task 3
**Verifikation:** `npm run build`; manueller Test für Einzel- und Serientermin.

---

## Task 5 – Template-/Dateinamen-Integration

**Ziel:** Gewählte Instanz standardmäßig in Dateiname/Template nutzbar machen.

- [ ] `apptBestStart`/`apptBestEnd` als bevorzugte Felder bereitstellen (Fallback = Original)
- [ ] Standard-Dateinamenmuster optional auf `apptBestStart` umstellen (abwärtskompatibel)
- [ ] Prüfen, dass Mustache-Helper (`helper_dateFormat`) mit den neuen Feldern funktionieren

**Abhängigkeiten:** Task 4
**Verifikation:** `npm run build`; erzeugte Notiz zeigt gewähltes Datum.

---

## Task 6 – Styles

**Ziel:** Vorauswahl sichtbar machen.

- [ ] CSS-Regel für `omn-next-hint` in `styles.css` (dezent, Akzentfarbe)

**Abhängigkeiten:** Task 3
**Verifikation:** optische Prüfung in Obsidian.

---

## Task 7 – Dokumentation (README)

**Ziel:** Nutzerdoku aktualisieren.

- [ ] „Note about recurring meetings"-Absatz aktualisieren (Popup + Vorauswahl)
- [ ] Neue Felder dokumentieren (`apptSelectedStartWhole`/`End`, `apptBestStart`/`End`,
      `apptIsRecurring`)
- [ ] Empfehlung `apptBestStart` im Dateinamenmuster
- [ ] Bekannte Grenzen (Zeitzonen, unendliche Serien, Ausnahmen) ergänzen

**Abhängigkeiten:** Task 5
**Verifikation:** README liest sich konsistent zum Verhalten.

---

## Task 8 – Verifikation & manueller Abschlusstest

**Ziel:** Gesamtfunktion sicherstellen.

- [ ] `npm run build` fehlerfrei
- [ ] Optional: isoliertes Testsetup (z. B. Vitest) für `expandOccurrences` mit Fixtures
- [ ] Manueller Test: Serientermin → Popup, nächste Instanz oben & markiert, Enter erzeugt
      korrekte Notiz
- [ ] Manueller Test: Einzeltermin → kein Popup, Verhalten unverändert
- [ ] Temporäre Dateien/Testartefakte aufräumen

**Abhängigkeiten:** Tasks 1–7

---

## Status-Notizen

- **Task 1 abgeschlossen** – `recurrence.ts` neu angelegt (Obsidian-frei, damit testbar).
  Enthält `EPOCH_1601_MS`, `minutesToDate`, Typ `Occurrence` und `expandOccurrences` mit
  Unterstützung für Daily/Weekly/Monthly/Yearly, `patternTypeMonthNth` (n-ter Wochentag,
  inkl. „letzter"), Ende-Bedingungen, gelöschte Instanzen, Ausnahmen (`exceptionInfo`) und
  einem harten Cap (`MAX_OCCURRENCES = 1000`) gegen unendliche Serien. `tsc -noEmit`
  fehlerfrei. Logik mit 5 Fällen (weekly, daily step2, monthly day15, deleted instance,
  monthly 2nd Tuesday) manuell verifiziert – alle korrekt. Bekannte Grenze: Zeitzonen werden
  als lokale Zeit behandelt (siehe PLAN.md).
- **Task 2 abgeschlossen** – `buildChoiceList` in `recurrence.ts` ergänzt, plus Typen
  `OccurrenceChoice`/`OccurrenceLabelFormatter`. Bildet aus den expandierten Instanzen ein
  Fenster (Default 3 vergangene + 10 kommende), bestimmt die nächste anstehende Instanz
  (`end >= now`, Fallback letzte Instanz bei abgelaufener Serie) und stellt sie als ersten
  Listeneintrag mit `isNext` voran, damit Enter sie wählt. `isPast` markiert vergangene
  Instanzen. Label-Formatierung über injizierbaren Formatter (Default ohne Fremdabhängigkeit),
  sodass `main.ts` später `moment` einsetzen kann, das Modul aber testbar bleibt. `tsc`
  fehlerfrei; 4 Fälle (vor/mitten/nach Serie, leer) manuell verifiziert – korrekt.
