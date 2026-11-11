# Outlook Meeting Notes

This is a plugin for [Obsidian](https://obsidian.md) that allows you to create notes from
Microsoft Outlook meetings, including the meeting details (date/time,
subject, recipients, invite message, etc), using a customisable template.
The plugin processes .msg files that are dragged-and-dropped from the 
Outlook desktop app onto the plugin icon in the ribbon in Obsidian

This makes it easy to take notes of meetings in Obsidian.

By processing .msg files, the plugin does not depend on having to run code within
Outlook or on Microsoft 365 administrators authorising an app to connect to the
Microsoft Graph API.

Note about recurring meetings or appointments: Microsoft Outlook does not include
any fields that indicate which of the recurring appointments has been dragged-and-dropped.
To handle this, when you drop a recurring meeting the plugin reads the recurrence
pattern from the .msg file, works out the individual occurrences, and shows a picker
so you can choose which occurrence the note is for. The **next upcoming occurrence is
pre-selected**, so you can just press <kbd>Enter</kbd> to create a note for it. A few
recent past occurrences are also offered in case you are back-filling notes. The chosen
occurrence's date/time is made available to the filename pattern and template via the
[apptBestStart](#apptbeststart--apptbestend) field (used by the default pattern), as well
as [apptSelectedStartWhole/apptSelectedEndWhole](#apptselectedstartwhole--apptselectedendwhole).

Non-recurring appointments are created directly, without a picker, exactly as before.

Known limitations for recurring meetings:
- Occurrence times are computed in the current machine's local time; around daylight-saving
  changes a computed time may be off by an hour.
- For a series with no end date, only a limited window of upcoming occurrences is offered.
- Cancelled occurrences are omitted and rescheduled (exception) occurrences are shown at
  their new time, based on the recurrence data stored in the .msg file.

The plugin relies on the wonderful [msgreader](https://github.com/HiraokaHyperTools/msgreader),
[mustache.js](https://github.com/janl/mustache.js), and
[mustache-validator](https://github.com/eliasm307/mustache-validator) libraries.

## Installation

Search for Outlook Meeting Notes in Community Plugins, either in the Obsidian app or
on the [Obsidian website](https://obsidian.md/plugins?search=outlook+meeting+notes).

## Usage
Drag and drop a meeting from a calendar in the Outlook Classic desktop app onto the
plugin ribbon icon in Obsidian. The plugin will create a note and open it in the
current tab.

Outlook Classic creates a .msg file when you drag and drop an appointment or meeting.
You can also save a meeting as a .msg file (or save one you have received as an email
attachment) and drag and drop the file onto the plugin icon.

The plugin includes a default template that adds the meeting details
into the frontmatter (properties) of the created note. It sets the filename of the note
to the date, time and subject of the meeting, and creates the note in the root folder of
the vault. This can all be customised: see [Settings](#settings).

## Settings
### Folder location
The folder in which new notes will be created. If the folder doesn't already exist, it
will be created (including any parent folders, if you set it as a subfolder like `a/b/c`)

### Filename pattern
The pattern that will be used to create filenames, using [mustache syntax](https://mustache.github.io/mustache.5.html).
The default pattern is:
```
{{#helper_dateFormat}}{{apptBestStart}}|YYYY-MM-DD HH.mm{{/helper_dateFormat}} {{subject}}
```
This will produce filenames like `2025-03-09 10.31 Discuss documentation`.
(`apptBestStart` is the start of the occurrence you chose for a recurring meeting,
or the appointment start for a non-recurring meeting — see
[apptBestStart](#apptbeststart--apptbestend).)

The filename pattern can be used to create folders by using the `/` character. For example:
```
{{#helper_dateFormat}}{{apptBestStart}}|YYYY/MM MMMM/YYYY-MM-DD HH.mm{{/helper_dateFormat}} {{subject}}
```
This would create a folder for the year, a sub-folder for the month and then a file in that sub-folder:
`2025/03 March/2025-03-09 10.31 Discuss documentation`

If `/` characters appear in any of the fields from the Outlook meeting, they are replaced.

### Invalid character substitute
When using Outlook fields as part of the filename, they may contain invalid characters.
This setting allows you to specify what invalid characters should be replaced with. If
blank, then invalid characters will be removed. If you specify a space, then any spaces
at the end of the filename will be removed.

Note - the invalid characters are: `/` `*` `"` `\` `<` `>` `:` `|` `?`

### Template
The default template can be customised, or you can write a new
template using mustache syntax (see [the manual](https://mustache.github.io/mustache.5.html)).
All .msg [fields](https://hiraokahypertools.github.io/msgreader/typedoc/interfaces/MsgReader.FieldsData.html)
can be used in a template, and there are also some additional helper fields and 
functions you can use to format fields.

### Default template
The default template for notes is:
```
---
title: {{subject}}
subtitle: meeting notes
date: {{#helper_dateFormat}}{{apptBestStart}}|L LT{{/helper_dateFormat}}
meeting: 'true'
meeting-location: {{apptLocation}}
meeting-recipients:
{{#recipients}}
  - {{name}}
{{/recipients}}
meeting-invite: {{body}}
---
```

### Helper fields for templates
In addition to all the standard .msg fields, the plugin adds some extra fields.

#### apptBestStart / apptBestEnd
The start and end of the appointment that the note is for, as an ISO date/time.

For a recurring meeting this is the occurrence you selected in the picker; for a
non-recurring meeting it is the same as `apptStartWhole` / `apptEndWhole`. The default
filename pattern and template use `apptBestStart`, so recurring-meeting notes are named
and dated for the occurrence you chose rather than the first occurrence in the series.

Use [helper_dateFormat](#helper_dateformat) to format it:
```
{{#helper_dateFormat}}{{apptBestStart}}|YYYY-MM-DD HH.mm{{/helper_dateFormat}}
```

#### apptSelectedStartWhole / apptSelectedEndWhole
For recurring meetings only, the start and end of the occurrence you selected in the
picker (ISO date/time). These are not set for non-recurring meetings — if you need a
field that is always present, use [apptBestStart / apptBestEnd](#apptbeststart--apptbestend).

#### apptIsRecurring
`true` when the dropped meeting is part of a recurring series, otherwise `false`. This can
be used in a section to include extra content only for recurring meetings:
```
{{#apptIsRecurring}}recurring: 'true'{{/apptIsRecurring}}
```

#### helper_currentDT
The date and time at which the meeting was dragged-and-dropped onto the icon, 
in ISO format (like *2025-04-02T09:31:12+01:00*). 

You will probably want to use the [helper_dateFormat](#helper_dateFormat) function
to format it:
```
{{#helper_dateFormat}}{{helper_currentDT}}|YYYY-MM-DD HH.mm.ss{{/helper_dateFormat}}
```

### Helper functions for templates
To use a helper function in a template, include a section for the function, e.g.:
```
{{#helper_firstWord}}{{name}}{{/helper_firstWord}}
```

#### helper_dateFormat
Formats a date, using [moment.js](https://momentjs.com/). The format is delimited by a `|`
character.

Examples:
```
{{#helper_dateFormat}}{{apptStartWhole}}|YYYY-MM-DD HH.mm{{/helper_dateFormat}}
```
This is like *2025-03-09 16.14*.
```
{{#helper_dateFormat}}{{apptStartWhole}}|L LT{{/helper_dateFormat}}
```
A date in short format with a time in short format, using the Obsidian application's 
display language as a basis for the locale to use for the date format (you can change
this setting in Settings > General > Language).

In *English (GB)* display language, this is like *09/03/2025 03:19*, but in
*English* display language (which means US), it would be like *03/09/2025 3:19 AM*.

#### helper_firstWord
Returns just the first word. This allows the option of recording just the first names of
people who were invited to a meeting:
```
meeting-recipients:
{{#recipients}}
  - {{#helper_firstWord}}{{name}}{{/helper_firstWord}}
{{/recipients}}
```
