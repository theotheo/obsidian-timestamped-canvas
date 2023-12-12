import { App, PluginSettingTab, Setting, Plugin } from "obsidian";
import { around } from "monkey-around";
import type moment from "moment";

declare global {
  interface Window {
    moment: typeof moment;
  }
}

interface TimestampedCanvasSetting {
	dateFormat: string;
}

const DEFAULT_SETTINGS: Partial<TimestampedCanvasSetting> = {
	dateFormat: "YYYY-MM-DD HH:mm",
};

export class TimestampedCanvasSettingTab extends PluginSettingTab {
	plugin: TimestampedCanvas;

	constructor(app: App, plugin: TimestampedCanvas) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Date format")
			.setDesc("Default date format")
			.addText((text) =>
				text
					.setPlaceholder("YYYY-MM-DD HH:mm")
					.setValue(this.plugin.settings.dateFormat)
					.onChange(async (value) => {
						this.plugin.settings.dateFormat = value;
						await this.plugin.saveSettings();
					})
			);
	}
}

export default class TimestampedCanvas extends Plugin {
	settings: TimestampedCanvasSetting;


	async onload() {
		await this.loadSettings();

		this.patchCanvas();
		
		this.addSettingTab(new TimestampedCanvasSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}


	onunload() {
	}

	patchCanvas() {

		const createTimestamp = () => {
			return moment().format(this.settings.dateFormat)
		}

		const patchCanvas = () => {
			const canvasView = app.workspace.getLeavesOfType("canvas").first()?.view;
			// @ts-ignore
			const canvas = canvasView?.canvas;
			if (!canvasView) return false;

			const canvasUninstaller = around(canvas.constructor.prototype, {
				createTextNode(oldMethod) {
					return function (...args) {
						args[0]['text'] = createTimestamp();
						const result = oldMethod && oldMethod.apply(this, args);
						console.log("wrapper 1 after someMethod", result);
						return result;
					}
				},
				addEdge(oldMethod) {
					return function (...args) {
						args[0]['label'] = createTimestamp();
						const result = oldMethod && oldMethod.apply(this, args);
						return result;
					}
				}
			})


			this.register(canvasUninstaller);

			canvas?.view.leaf.rebuildView();
			console.log("obsidian-timestamped-canvas: canvas view patched");
			return true;
		}

		this.app.workspace.onLayoutReady(() => {
			if (!patchCanvas()) {
				const evt = app.workspace.on("layout-change", () => {
					patchCanvas() && app.workspace.offref(evt);
				});
				this.registerEvent(evt);
			}
		});
	}


}
