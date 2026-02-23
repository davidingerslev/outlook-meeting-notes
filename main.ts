import { App, displayTooltip, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TooltipPlacement, EventRef } from 'obsidian';
import MsgReader from '@kenjiuno/msgreader';
import proxyData from 'mustache-validator';
import Mustache from 'mustache';
import moment from 'moment';

const OutlookMeetingNotesDefaultFilenamePattern =
	'{{#helper_dateFormat}}{{apptStartWhole}}|YYYY-MM-DD HH.mm{{/helper_dateFormat}} {{subject}}';

const OutlookMeetingNotesDefaultTemplate = `---
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
`;

interface OutlookMeetingNotesSettings {
	notesFolder: string;
	invalidFilenameCharReplacement: string;
	fileNamePattern: string;
	notesTemplate: string;
	recipientsAsWikiLinks: boolean;
}

const DEFAULT_SETTINGS: OutlookMeetingNotesSettings = {
	notesFolder: '',
	invalidFilenameCharReplacement: '',
	fileNamePattern: OutlookMeetingNotesDefaultFilenamePattern,
	notesTemplate: OutlookMeetingNotesDefaultTemplate,
	recipientsAsWikiLinks: false
}

export default class OutlookMeetingNotes extends Plugin {
	settings: OutlookMeetingNotesSettings;

	//TODO: Add functionality to export meeting notes nicely

	async createMeetingNote(msg: MsgReader) {
		try {
			const { vault } = this.app;

			// Get the file data from MsgReader
			const origFileData = msg.getFileData();

			// Check if we got a suitable meeting
			if (origFileData.dataType != 'msg') {
				throw new TypeError('Outlook Meeting Notes cannot process the file. '
					+ 'MsgReader did not parse the file as valid msg format.');
			} else if (origFileData.messageClass != 'IPM.Appointment') {
				throw new TypeError('Outlook Meeting Notes cannot process the file. '
					+ 'It is a valid msg file but not an appointment or meeting.');
			}

			this.addHelperFunctions(origFileData);

			// Add helper field for the current date and time
			let fileData = origFileData as any;
			fileData.helper_currentDT = moment().format();

			if (this.settings.recipientsAsWikiLinks && fileData.recipients) {
				fileData.recipients = fileData.recipients.map((r: any) => ({
					...r,
					name: r.name ? '[[' + r.name + ']]' : r.name
				}));
			}

			let folderPath = this.settings.notesFolder;
			if (folderPath == '') { folderPath = '/'; }
			const fileNameEscape = {
				escape: (str: string): string => {
					return str.replaceAll('/', this.settings.invalidFilenameCharReplacement);
				}
			}
			const fileNameMustache = Mustache.render(
				this.settings.fileNamePattern,
				proxyData(fileData),
				undefined,
				fileNameEscape)
				.replaceAll(/[*"\\<>:|?]/g, this.settings.invalidFilenameCharReplacement);
			const filePath = folderPath + '/' + fileNameMustache + '.md';
			const newFolderPath = filePath.replace(/\/[^/]*$/, '');
			let meetingNoteFile = vault.getFileByPath(filePath);
			if (meetingNoteFile) {
				// File already exists
				new Notice(meetingNoteFile.basename + ' already exists: opening it');
			}
			else {
				if (vault.getFolderByPath(newFolderPath) == null) {
					vault.createFolder(newFolderPath);
				}
				const mustacheOutput = this.renderTemplate(
					this.settings.notesTemplate,
					fileData);
				meetingNoteFile = await vault.create(filePath, mustacheOutput);
				new Notice('New file created: ' + meetingNoteFile.basename);
			}
			const openInNewTab = false;
			this.app.workspace.getLeaf(openInNewTab).openFile(meetingNoteFile);
			// @ts-ignore: Property 'internalPlugins' does not exist on type 'App'.
			const fe = this.app.internalPlugins.getEnabledPluginById("file-explorer");
			if (fe) { fe.revealInFolder(meetingNoteFile); }
		} catch (ee: unknown) {
			// TODO: Handle errors reasonably -- differently between msg missing elements and errors creating file
			if (ee instanceof Error) { new Notice('Error (' + ee.name + '):\n' + ee.message); }
			throw ee;
		}
	}

	// Custom funciton to handle a file being dropped onto the ribbon icon.
	async handleDropEvent(dropevt: DragEvent) {
		if (dropevt.dataTransfer == null) {
			throw new ReferenceError('Outlook Meeting Notes cannot handle the DragEvent. The event had a null '
				+ 'dataTransfer property, which should never happen when dispatched by the browser, according '
				+ 'to https://developer.mozilla.org/en-US/docs/Web/API/DragEvent/dataTransfer');
		} else {
			const droppedFiles = dropevt.dataTransfer.files
			if (droppedFiles.length != 1) {
				new Notice('Outlook Meeting Notes can only handle one meeting being dropped onto the ribbon icon');
			}
			else {
				// One file was dropped, hand it over to createMeetingNote
				const droppedFile = droppedFiles[0];

				const fr = new FileReader();
				fr.onload = () => {
					if (fr.result == null) {
						throw new ReferenceError('Outlook Meeting Notes cannot handle the DragEvent. The FileReader had '
							+ 'a null result property, which should not be possible.');
					} else if (!(fr.result instanceof ArrayBuffer)) {
						throw new TypeError('Outlook Meeting Notes cannot handle the DragEvent. The FileReader result '
							+ 'property was not an ArrayBuffer, which should be impossible.');
					} else {
						// As readAsArrayBuffer is being used, below, fr.result will be an ArrayBuffer.
						const msgRdr = new MsgReader(fr.result);
						this.createMeetingNote(msgRdr);
					}
				}
				fr.readAsArrayBuffer(droppedFile)
			}
		}
	}

	private ribbonIconEl: HTMLElement;

	async onload() {
		await this.loadSettings();

		const tooltipMessage = 'Outlook Meeting Notes: Drag and drop a meeting onto this icon from Outlook (or a .msg file) to create a meeting note.';

		// This creates an icon in the left ribbon.
		// Create an icon that does nothing when clicked, as the effect is from 
		this.ribbonIconEl = this.addRibbonIcon('calendar-clock', tooltipMessage, () => { });

		// These respond to something being dragged over the ribbon icon and dropped onto it
		this.ribbonIconEl.addEventListener('dragenter', () => {
			// Style for is-being-dragged-over is defined in the CSS file.
			this.ribbonIconEl.toggleClass('is-being-dragged-over', true);
			// Display a tooltip.
			const ttPosition = this.ribbonIconEl.getAttribute('data-tooltip-position') as TooltipPlacement;
			const ttDelay = this.ribbonIconEl.getAttribute('data-tooltip-delay');
			if (ttPosition != null && ttDelay != null) {
				displayTooltip(this.ribbonIconEl, tooltipMessage, { placement: ttPosition, delay: Number(ttDelay) });
			} else {
				displayTooltip(this.ribbonIconEl, tooltipMessage);
			}
		});
		this.ribbonIconEl.addEventListener('dragleave', () => {
			this.ribbonIconEl.toggleClass('is-being-dragged-over', false);
			// Remove the tooltip when the user leaves the ribbon icon while still dragging.
			const tooltip = document.getElementsByClassName('tooltip')[0]
			if (tooltip) { tooltip.remove(); }
		});
		this.ribbonIconEl.addEventListener('dragover', (dragevt) => {
			// User is dragging something over the icon

			// Prevent the default behaviour of not allowing the drop event
			dragevt.preventDefault();
			// The dropEffect changes the cursor. Options are 'none', 'move', 'copy', and 'link'.
			if (dragevt.dataTransfer != null) { dragevt.dataTransfer.dropEffect = 'copy'; }
		});
		this.ribbonIconEl.addEventListener('drop', (dropevt) => {
			// User has dropped something on the icon

			// If the user drops something, dragleave doesn't get called.
			this.ribbonIconEl.toggleClass('is-being-dragged-over', false);

			// Prevent the default behaviour because we're handling it.
			dropevt.preventDefault();
			// Call the custom function defined above.
			this.handleDropEvent(dropevt);
		});
		this.ribbonIconEl.addClass('outlook-meeting-notes-icon');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('Status Bar Text');

		//TODO: Add commands to create meeting notes.

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new OutlookMeetingNotesSettingTab(this.app, this));
	}

	onunload() {
		//Don't need to remove event listeners because the icon will be gone.
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	addHelperFunctions(hash: any): any {
		const helperFunctions = {
			firstWord: () => {
				return function (words: string, render: any) {
					return render(words).replace(/\W.*$/, '');
				}
			},
			dateFormat: () => {
				return function (datetime_format: string, render: any) {
					const parts = datetime_format.split('|')
					return moment(render(parts[0]).trim()).format(parts[1]);
				}
			}
		};
		let func: 'firstWord' | 'dateFormat';
		for (func in helperFunctions) {
			hash['helper_' + func] = helperFunctions[func];
		}
		// Add helper functions to all objects in arrays so that the helper 
		// functions work inside mustache sections
		for (let property in hash) {
			if (hash[property] instanceof Array) {
				for (let subproperty in hash[property]) {
					if (hash[property][subproperty] instanceof Object) {
						for (func in helperFunctions) {
							hash[property][subproperty]['helper_' + func] = helperFunctions[func];
						}
					}
				}
			}
		}

		return hash;
	}

	//////////////////////
	// renderTemplate() //
	//////////////////////
	// Parse template into YAML and markdown sections to use different escaping for each
	renderTemplate(template: string, hash: any): string {
		// Regex /^---(\r\n?|\n).*?(\r\n?|\n)---($|\r\n?|\n)/s matches '---' at the start of the string,
		// then a platform-independent new-line, followed by a non-greedy match (because of *?) of any
		// character including newlines (because of /s at end), followed by another --- on its own line
		// with either another platform-independent new-line afterwards or the end of the string.
		const templateYAMLMatch = template.match(/^---(\r\n?|\n).*?(\r\n?|\n)---($|\r\n?|\n)/s);
		// If there was a match, then make notesTemplateMD everything after it, otherwise it's the whole thing.
		const templateMD = templateYAMLMatch ? template.substring(templateYAMLMatch[0].length) : template;

		let output = ''

		if (templateYAMLMatch) {
			const mustacheYAMLOptions = {
				escape: (str: string): string => {
					// Escape YAML
					const found = str.match(/\r\n?|\n/);
					if (found) {
						return '|\n' + '  ' + str.replaceAll(/\r\n?|\n/g, '\n  ');
					} else if (str.match(/[:#\[\]\{\},]/)) {
						return '"' + str.replaceAll(/["\\]/g, '\\$&') + '"';
					}
					else return str;
				}
			}

			output = output + Mustache.render(
				templateYAMLMatch[0],
				proxyData(hash),
				undefined,
				mustacheYAMLOptions);
		}

		if (templateMD) {
			const mustacheMDOptions = {
				escape: (str: string): string => {
					return str.replaceAll(/[\\\`\*\_\[\]\{\}\<\>\(\)\#\!\|\^]/g, '\\$&')
						.replaceAll('%%', '\\%\\%')
						.replaceAll('~~', '\\~\\~')
						.replaceAll('==', '\\=\\=');
				}
			}

			output = output + Mustache.render(
				templateMD,
				proxyData(hash),
				undefined,
				mustacheMDOptions);
		}

		return output;
	}

}

class OutlookMeetingNotesSettingTab extends PluginSettingTab {
	plugin: OutlookMeetingNotes;

	constructor(app: App, plugin: OutlookMeetingNotes) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Folder location')
			.setDesc('Notes will be created in this folder.')
			.addText(text => text
				.setPlaceholder('Example: folder 1/subfolder 2')
				.setValue(this.plugin.settings.notesFolder)
				.onChange(async (value) => {
					this.plugin.settings.notesFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Filename pattern')
			.setDesc('This pattern will be used to name new notes.')
			.addText(text => text
				.setPlaceholder('Default: ' + OutlookMeetingNotesDefaultFilenamePattern)
				.setValue(this.plugin.settings.fileNamePattern)
				.onChange(async (value) => {
					if (value == '') {
						this.plugin.settings.fileNamePattern = OutlookMeetingNotesDefaultFilenamePattern;
					} else {
						this.plugin.settings.fileNamePattern = value;
					}
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Invalid character substitute')
			.setDesc('This character (or string) will be used in place of any invalid characters for new note filenames.')
			.addText(text => text
				.setPlaceholder('Example: _')
				.setValue(this.plugin.settings.invalidFilenameCharReplacement)
				.onChange(async (value) => {
					this.plugin.settings.invalidFilenameCharReplacement = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Template')
			.setDesc('This template will be used for new notes.')
			.addTextArea(text => text
				.setPlaceholder('Default: ' + OutlookMeetingNotesDefaultFilenamePattern)
				.setValue(this.plugin.settings.notesTemplate)
				.onChange(async (value) => {
					this.plugin.settings.notesTemplate = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Recipients as wiki links')
			.setDesc('When enabled, recipient names are wrapped in [[]] to create Obsidian wiki links.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.recipientsAsWikiLinks)
				.onChange(async (value) => {
					this.plugin.settings.recipientsAsWikiLinks = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setDesc((() => {
				const df = document.createDocumentFragment();
				df.appendChild(document.createTextNode(
					'For more information about filename patterns and the syntax for templates, see the '
				));
				const link = document.createElement('a');
				link.href = 'https://www.github.com/davidingerslev/outlook-meeting-notes/#outlook-meeting-notes';
				link.target = '_blank';
				link.rel = 'noopener';
				link.textContent = 'documentation';
				df.appendChild(link);
				df.appendChild(document.createTextNode('.'))
				return df;
			})())

	}
}

/*
 * Notes from the sample plugin README.md

## Releasing new releases

- Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`

## Adding your plugin to the community plugin list

- Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
- Publish an initial version.
- Make sure you have a `README.md` file in the root of your repo.
- Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin.
 */
