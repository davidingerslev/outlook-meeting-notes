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

## Task 3 – Auswahl-Popup (`OccurrencePickerModal`) `[x]`

**Ziel:** `SuggestModal`-basiertes Popup zur Terminauswahl.

- [x] Klasse `OccurrencePickerModal extends SuggestModal<OccurrenceChoice>`
- [x] `getSuggestions` (mit optionaler Textfilterung)
- [x] `renderSuggestion` inkl. „Next occurrence"-Markierung (`omn-next-hint`) + „Past" (`omn-past-hint`)
- [x] `onChooseSuggestion` → Callback
- [x] Placeholder-Text + Tastatur-Instruktionen gesetzt
- [x] Abbruch (Popup ohne Auswahl geschlossen) → `onCancel`-Callback, keine Notiz

**Abhängigkeiten:** Task 2
**Verifikation:** `npm run build`; manueller Test in Obsidian (Popup öffnet, Liste korrekt).

---

## Task 4 – Umbau `createMeetingNote` auf Callback-Ablauf `[x]`

**Ziel:** Trennung von Datenaufbereitung, Auswahl und Dateierzeugung.

- [x] Datenaufbereitung (`dataType`/`messageClass`-Check, `addHelperFunctions`,
      `helper_currentDT`) wie bisher
- [x] Weiche: kein `apptRecur` → direkt; mit `apptRecur` → Popup
- [x] Dateierzeugung in `finalizeMeetingNote(fileData, selected)` ausgelagert
- [x] Felder setzen: `apptSelectedStartWhole`, `apptSelectedEndWhole`, `apptIsRecurring`,
      `apptBestStart`, `apptBestEnd`
- [x] Fehler-/`Notice`-Pfad im asynchronen Callback erhalten (in `finalizeMeetingNote`)
- [x] Bestehende Felder (`apptStartWhole` etc.) unverändert lassen (keine Breaking Changes)
- [x] Fallback: keine berechenbaren Instanzen → Notiz aus Originalstart erzeugen
- [x] `formatOccurrenceLabel` via `moment` (locale-aware) als Label-Formatter

**Abhängigkeiten:** Task 3
**Verifikation:** `npm run build`; manueller Test für Einzel- und Serientermin.

---

## Task 5 – Template-/Dateinamen-Integration `[x]`

**Ziel:** Gewählte Instanz standardmäßig in Dateiname/Template nutzbar machen.

- [x] `apptBestStart`/`apptBestEnd` als bevorzugte Felder bereitstellen (Fallback = Original)
- [x] Standard-Dateinamenmuster auf `apptBestStart` umgestellt (abwärtskompatibel)
- [x] Standard-Template-`date` auf `apptBestStart` umgestellt
- [x] Mustache-Helper (`helper_dateFormat`) mit den neuen Feldern verifiziert

**Abhängigkeiten:** Task 4
**Verifikation:** `npm run build`; erzeugte Notiz zeigt gewähltes Datum.

---

## Task 6 – Styles `[x]`

**Ziel:** Vorauswahl sichtbar machen.

- [x] CSS-Regeln für `omn-next-hint` (Akzentfarbe) und `omn-past-hint` (gedämpft) in `styles.css`

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
- **Task 3 abgeschlossen** – `OccurrencePickerModal` (extends `SuggestModal<OccurrenceChoice>`)
  in `main.ts` ergänzt, `SuggestModal` + `OccurrenceChoice` importiert. Zeigt die Choice-Liste
  (nächste Instanz zuerst → Enter-Vorauswahl), markiert „Next occurrence"/„Past", filtert per
  Suchfeld, ruft `onPick` bzw. bei Abbruch genau einmal `onCancel` (via `onClose`, Guard
  `picked`). Tastatur-Instruktionen gesetzt. CSS-Klassen `omn-next-hint`/`omn-past-hint` folgen
  in Task 6. `npm run build` fehlerfrei (`Instruction`-Shape `{command,purpose}` passt).
  Hinweis: Modal-Verhalten wird in Task 8 manuell in Obsidian getestet.
- **Task 4 abgeschlossen** – `createMeetingNote` aufgeteilt: Datenaufbereitung + Weiche
  (Serie → `OccurrencePickerModal` öffnen und `return`; sonst direkt), Dateierzeugung in
  neues `finalizeMeetingNote(fileData, selected)` ausgelagert. Setzt `apptIsRecurring`,
  `apptSelectedStartWhole/End` (bei Auswahl) und `apptBestStart/End` (Fallback auf
  `apptStartWhole/End`). Originalfelder unverändert. Fehler-/Notice-Handling in beiden
  Methoden erhalten (Callback ist fire-and-forget mit eigenem try/catch). Abbruch → Notice,
  keine Notiz. Fallback bei nicht berechenbaren Instanzen → Notiz aus Originalstart.
  `formatOccurrenceLabel` nutzt `moment` (locale-aware) für die Picker-Labels. `npm run build`
  fehlerfrei.
- **Task 5 abgeschlossen** – Standard-Dateinamenmuster und Standard-Template (`date`) auf
  `apptBestStart` umgestellt (statt `apptStartWhole`). Abwärtskompatibel, da bei Einzelterminen
  `apptBestStart === apptStartWhole`. Render-Smoke-Test (Mustache + mustache-validator + moment)
  bestätigt: Serientermin → Dateiname/Datum zeigen die **gewählte** Instanz (Jan 19 statt
  Serienstart Jan 5); Einzeltermin → Fallback auf Originalstart. `helper_dateFormat` arbeitet
  unverändert mit den neuen Feldern. `npm run build` fehlerfrei.
- **Task 6 abgeschlossen** – `styles.css` um `.omn-next-hint` (Akzentfarbe, `--text-accent`)
  und `.omn-past-hint` (gedämpft, `--text-muted`) ergänzt, beide mit `--font-smaller`. Nutzt
  Theme-Variablen → passt sich Light/Dark an. styles.css wird nicht gebündelt, sondern direkt
  ausgeliefert; optische Prüfung erfolgt in Task 8.
