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
any fields that indicate which of the recurring appointments has been dragged-and-dropped,
so it is not possible to differentiate between them. This means that the start date/time 
of the first appointment in the recurring series will be used by default. You may wish
to change the filename template to include the current date/time instead (or as well)
using the helper field [helper_currentDT](#helper_currentDT).

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
{{#helper_dateFormat}}{{apptStartWhole}}|YYYY-MM-DD HH.mm{{/helper_dateFormat}} {{subject}}
```
This will produce filenames like `2025-03-09 10.31 Discuss documentation`.

The filename pattern can be used to create folders by using the `/` character. For example:
```
{{#helper_dateFormat}}{{apptStartWhole}}|YYYY/MM MMMM/YYYY-MM-DD HH.mm{{/helper_dateFormat}} {{subject}}
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
date: {{#helper_dateFormat}}{{apptStartWhole}}|L LT{{/helper_dateFormat}}
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
There is currently only one helper field available:

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

### Recipients as wiki links
Toggle to wrap the name of the recipient(s) in wiki link style square brackets. 
Can be usefull for people who manage their contacts in obsidian.


