# Plan: Terminauswahl bei Serienterminen

## Ziel

Beim Ziehen eines Serientermins aus Outlook auf das Ribbon-Icon soll **immer ein
Auswahl-Popup** erscheinen, in dem der Nutzer die konkrete Termininstanz auswählt. Die
**nächste anstehende Instanz** ist dabei **vorausgewählt/hervorgehoben**, sodass ein einfaches
Enter den sinnvollsten Termin erzeugt.

Einzeltermine (ohne Serienmuster) verhalten sich unverändert – ohne Popup.

## Analyse des Repos

Das Plugin ist ein einzelnes TypeScript-File (`main.ts`, kompiliert via esbuild/tsc nach
`main.js`). Relevanter Ablauf:

1. **Ribbon-Drop** → `handleDropEvent` liest die gedroppte `.msg`-Datei als `ArrayBuffer`.
2. Daraus wird ein `MsgReader` erzeugt und an `createMeetingNote(msg)` übergeben.
3. `createMeetingNote` ruft `msg.getFileData()` auf → liefert `fileData` (Betreff, Ort,
   Empfänger, `apptStartWhole`, `apptEndWhole`, …).
4. Dateiname und Notizinhalt werden per Mustache aus `fileData` gerendert. Der
   Standard-Dateiname nutzt `apptStartWhole`.

### Ursache des Serientermin-Problems

Bei einer Serie enthält `apptStartWhole` den Start des **ersten** Termins der Serie – nicht
des nächsten anstehenden. Das README dokumentiert das als bekannte Einschränkung mit der
Begründung, Outlook liefere kein Feld, das angibt, welche Instanz gezogen wurde.

### Entscheidender Fund

Die Einschränkung stimmt nur halb. Die verwendete Bibliothek `@kenjiuno/msgreader` parst das
Serienmuster **bereits automatisch**:

- In `node_modules/@kenjiuno/msgreader/lib/const.js` ist Tag `0x00008216`
  (`PidLidAppointmentRecur`) auf das Feld `apptRecur` gemappt.
- In `MsgReader.js` wird dafür `AppointmentRecurParser.parse()` aufgerufen.

Das heißt: `fileData.apptRecur` ist **bereits vorhanden** und enthält die volle
`RecurrencePattern`-Struktur:

- `recurFrequency` (Daily/Weekly/Monthly/Yearly), `period` (Intervall)
- `patternType` + `patternTypeWeek.dayOfWeekBits` / `patternTypeMonth.day` /
  `patternTypeMonthNth`
- `startDate`, `endDate`, `occurrenceCount`, `endType`
- `deletedInstanceDates[]`, `modifiedInstanceDates[]`
- `startTimeOffset`, `endTimeOffset` (Minuten ab Mitternacht)

Alle Datumswerte sind „Minuten seit Mitternacht 1. Jan 1601" und per Formel
`new Date(-11644473600000 + wert * 60000)` in JS-Dates konvertierbar.

**Fazit:** Aus dem Serienmuster lässt sich die vollständige Liste der Instanzen berechnen –
und daraus die nächste anstehende als Vorauswahl bestimmen.

### Popup ist mit Obsidian möglich

Die Obsidian-API (`node_modules/obsidian/obsidian.d.ts`) stellt dafür fertige Klassen bereit:

- `Modal` – generisches Popup.
- `SuggestModal<T>` – Popup mit Liste und optionalem Suchfeld (von Obsidian selbst für
  Befehlspalette/Schnell-Wechsler genutzt).
- `FuzzySuggestModal<T>` – wie oben, mit Fuzzy-Suche.

Funktioniert auf Desktop und Mobile. Für die Terminauswahl ist eine listenbasierte Auswahl
ideal.

## Implementierungsplan

### 1. Serieninstanzen berechnen

In `main.ts` eine Funktion `expandOccurrences(apptRecur, now = new Date())` ergänzen, die eine
Liste von Instanzen `{ start: Date; end: Date }` liefert:

- Die Serie anhand `recurFrequency` + `period` expandiert:
  - **Daily:** `period` ist in Minuten gespeichert → Tage = `period / 1440`.
  - **Weekly:** `period` in Wochen, plus `patternTypeWeek.dayOfWeekBits` (Bitmaske So..Sa)
    für mehrere Wochentage.
  - **Monthly/Yearly:** `patternTypeMonth.day` bzw. `patternTypeMonthNth` (n-ter Wochentag).
- `startDate`/`endDate`, `occurrenceCount` und `endType` als Grenzen/Abbruch berücksichtigt.
- `deletedInstanceDates` überspringt und `modifiedInstanceDates`/`exceptionInfo` (verschobene
  Instanzen) korrekt einsetzt.
- Tageszeit aus `startTimeOffset`/`endTimeOffset` setzt.
- Bei unendlichen Serien ein begrenztes Fenster liefert (siehe unten).

Hilfskonstante für die Datumskonversion:

```typescript
const EPOCH_1601_MS = -11644473600000;
const minutesToDate = (m: number) => new Date(EPOCH_1601_MS + m * 60000);
```

### 2. Auswahlfenster und Vorauswahl bestimmen

Aus der Instanzliste ein sinnvolles Fenster für die Anzeige bilden, z. B.:

- einige vergangene Instanzen (z. B. letzte 2–3) für den Fall, dass eine Notiz nachgetragen
  wird,
- die nächsten ~10 kommenden Instanzen,
- bei unendlichen Serien hart auf dieses Fenster begrenzen.

**Vorauswahl:** die erste Instanz mit `end >= now` (= nächster anstehender/laufender Termin).
Gibt es keine kommende Instanz mehr (Serie abgelaufen), auf die letzte Instanz zurückfallen.

### 3. Auswahl-Popup (`OccurrencePickerModal`)

Eine `SuggestModal<OccurrenceChoice>`-Unterklasse, die die Instanzen als Liste zeigt. Jede
Zeile formatiert als lesbares Datum/Uhrzeit (via `moment`, inkl. Wochentag), die nächste
Instanz optisch als „nächster Termin" markiert.

```typescript
interface OccurrenceChoice {
    start: Date;
    end: Date;
    isNext: boolean;   // true für die vorausgewählte nächste Instanz
    label: string;
}

class OccurrencePickerModal extends SuggestModal<OccurrenceChoice> {
    constructor(
        app: App,
        private choices: OccurrenceChoice[],
        private preselectIndex: number,
        private onPick: (c: OccurrenceChoice) => void,
    ) {
        super(app);
        this.setPlaceholder('Welchen Termin der Serie als Notiz anlegen?');
    }

    getSuggestions(query: string): OccurrenceChoice[] {
        const q = query.toLowerCase();
        return q ? this.choices.filter(c => c.label.toLowerCase().includes(q)) : this.choices;
    }

    renderSuggestion(c: OccurrenceChoice, el: HTMLElement) {
        el.createDiv({ text: c.label });
        if (c.isNext) { el.createDiv({ cls: 'omn-next-hint', text: 'Nächster Termin' }); }
    }

    onChooseSuggestion(c: OccurrenceChoice) { this.onPick(c); }
}
```

**Vorauswahl-Verhalten:** `SuggestModal` hebt standardmäßig den ersten Eintrag hervor und löst
ihn bei Enter aus. Damit „die nächste Instanz" die Enter-Auswahl ist, wird die Liste so
sortiert/aufgebaut, dass die nächste anstehende Instanz als erster Eintrag erscheint
(vergangene Instanzen darunter oder am Ende). So ist bei leerem Suchfeld Enter = nächster
Termin, ohne auf interne Hervorhebungs-APIs angewiesen zu sein. Die `isNext`-Markierung macht
die Vorauswahl zusätzlich sichtbar.

### 4. Ablauf in `createMeetingNote` umbauen

Derzeit nutzt die Notizerzeugung direkt `apptStartWhole`. Umbau:

1. Datenaufbereitung (Prüfung `dataType`/`messageClass`, `addHelperFunctions`,
   `helper_currentDT`) wie bisher.
2. **Weiche:**
   - Kein `apptRecur` → wie bisher direkt mit `apptStartWhole`/`apptEndWhole` fortfahren.
   - `apptRecur` vorhanden → `expandOccurrences` + Fenster/Vorauswahl berechnen,
     `OccurrencePickerModal` öffnen.
3. Da die Auswahl asynchron per Callback erfolgt, die eigentliche Dateierzeugung in eine
   Funktion `finalizeMeetingNote(fileData, chosenStart, chosenEnd)` auslagern, die aus dem
   Callback (bzw. direkt bei Einzelterminen) aufgerufen wird.
4. In `finalizeMeetingNote` die gewählte Instanz als zusätzliche Felder setzen, damit Dateiname
   und Template sie nutzen können:
   ```typescript
   fileData.apptSelectedStartWhole = chosenStart.toISOString();
   fileData.apptSelectedEndWhole = chosenEnd.toISOString();
   fileData.apptIsRecurring = Boolean(fileData.apptRecur);
   // apptBestStart = gewählte Instanz, sonst Originalstart (siehe Schritt 5)
   fileData.apptBestStart = fileData.apptSelectedStartWhole ?? fileData.apptStartWhole;
   fileData.apptBestEnd = fileData.apptSelectedEndWhole ?? fileData.apptEndWhole;
   ```

Bestehende Felder (`apptStartWhole` etc.) bleiben unverändert erhalten – keine Breaking
Changes für vorhandene Templates.

### 5. Template-/Dateinamen-Integration

Damit der gewählte Termin standardmäßig im Dateinamen landet, ohne bestehende Setups zu
brechen:

- Neue Felder bereitstellen: `apptSelectedStartWhole`, `apptSelectedEndWhole`,
  `apptBestStart`, `apptBestEnd`, `apptIsRecurring`.
- `apptBestStart`/`apptBestEnd` = gewählte Instanz, bei Einzelterminen = Originalwerte.
- README empfiehlt, im Dateinamen-/Template-Muster `apptBestStart` statt `apptStartWhole` zu
  verwenden. Das Standardmuster kann auf `apptBestStart` umgestellt werden (abwärtskompatibel,
  da bei Einzelterminen identisch zu `apptStartWhole`).

### 6. Styles

Kleine CSS-Regel in `styles.css` für die `omn-next-hint`-Markierung (dezenter, kleinerer Text
in Akzentfarbe), damit die Vorauswahl klar erkennbar ist.

### 7. Dokumentation (README)

- „Note about recurring meetings"-Absatz aktualisieren: Bei Serienterminen erscheint jetzt ein
  Auswahl-Popup mit Vorauswahl der nächsten Instanz.
- Neue Felder dokumentieren: `apptSelectedStartWhole`, `apptSelectedEndWhole`, `apptBestStart`,
  `apptBestEnd`, `apptIsRecurring`.
- Empfehlung, `apptBestStart` im Dateinamen-Muster zu nutzen.
- Bekannte Grenzen nennen (Zeitzonen, unendliche Serien → Fenstergröße, komplexe
  Monats-/Jahresmuster, Ausnahmen).

### 8. Verifikation

- `npm run build` (führt `tsc -noEmit` + esbuild aus) muss fehlerfrei durchlaufen.
- Da kein Testframework existiert und das Plugin stark auf Browser-/Obsidian-APIs setzt, die
  reine Berechnungslogik `expandOccurrences` so isolieren, dass sie ohne Obsidian testbar ist.
  Optional ein leichtes Testsetup (z. B. Vitest) nur für diese Funktion mit echten
  Serienmuster-Fixtures.
- Manueller Test in Obsidian: Serientermin droppen → Popup erscheint, nächste Instanz oben und
  markiert, Enter erzeugt Notiz mit korrektem Datum; Einzeltermin droppen → kein Popup.

## Risiken / offene Punkte

- **Zeitzonen:** Recurrence-Dates stehen in der Serien-Zeitzone (`timeZoneStruct`). Ignoriert
  man das, kann der Zeitpunkt bei Sommer-/Winterzeit um eine Stunde abweichen. Für v1
  akzeptabel und dokumentierbar; saubere Lösung nutzt `timeZoneStruct`/`apptTZDefRecur`.
- **Ausnahmen:** Verschobene/gelöschte Einzeltermine (`exceptionInfo`,
  `modifiedInstanceDates`, `deletedInstanceDates`) müssen berücksichtigt werden, sonst
  erscheinen abgesagte oder falsch terminierte Instanzen im Popup.
- **Unendliche Serien:** Es wird nur ein endliches Fenster an Instanzen angeboten; die
  Fenstergröße ist eine Designentscheidung (ggf. später als Einstellung).
- **Asynchroner Ablauf:** `createMeetingNote` wird durch das Callback-Modell asynchron – der
  bestehende Fehler-/`Notice`-Pfad muss im Callback erhalten bleiben.

## Kernaussage

Es ist **keine neue Abhängigkeit** nötig – `msgreader` liefert `apptRecur` schon fertig
geparst, und Obsidian bringt mit `SuggestModal` das Popup mit. Die Arbeit liegt in
`expandOccurrences` (Serienexpansion), dem `OccurrencePickerModal` und dem Umbau von
`createMeetingNote` auf einen Callback-basierten Ablauf mit ausgelagertem
`finalizeMeetingNote`.
