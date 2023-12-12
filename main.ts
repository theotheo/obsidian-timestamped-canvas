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
	isHide: boolean = false;


	async onload() {
		await this.loadSettings();

		this.patchCanvas();
		this.patchCanvasNode();
		this.patchCanvasEdge();
		
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

			const plugin = this;
			const canvasUninstaller = around(canvas.constructor.prototype, {
				addNode(oldMethod) {
					return function (...args) {
						const node = args[0]
						if (node['unknownData'] === undefined) {
							node['unknownData'] = {}
						}
						node['unknownData'] = {'timestamp': createTimestamp()};
						const result = oldMethod && oldMethod.apply(this, args);
						return result;
					}
				},
				addEdge(oldMethod) {
					return function (...args) {
						const edge = args[0]
						if (edge['unknownData'] === undefined) {
							edge['unknownData'] = {}
						}
						edge['unknownData'] = {'timestamp': createTimestamp()};
						const result = oldMethod && oldMethod.apply(this, args);
						return result;
					}
				},
				showQuickSettingsMenu(oldMethod) {
					return function (...args) {
						const e = args[0]
						e.addItem((e) => {
							return e.setSection("canvas").setTitle("Hide/show timestamps").setIcon("lucide-eye-off").onClick( () => {
								plugin.isHide = !plugin.isHide
								
								this.nodes.forEach(node => {
									if (plugin.isHide) {
										node?.timestampEl.addClass('canvas-node-timestamp-hide')
									} else {
										node?.timestampEl.removeClass('canvas-node-timestamp-hide')
									}
								})

								this.edges.forEach(edge => {
									if (plugin.isHide) {
										edge?.timestampEl.addClass('canvas-edge-timestamp-hide')
									} else {
										edge?.timestampEl.removeClass('canvas-edge-timestamp-hide')
									}
								})
							})
						})

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

	patchCanvasEdge() {
		const createTimestamp = () => {
			return moment().format(this.settings.dateFormat)
		}

		const patchEdge = () => {
			const canvasView = app.workspace.getLeavesOfType("canvas").first()?.view;
			// @ts-ignore
			const canvas = canvasView?.canvas;
			if(!canvas) return false;

			const edge = Array.from(canvas.edges).first();
			if (!edge) return false;


			// @ts-ignore
			const edgeInstance = edge[1];

			const edgeUninstaller = around(edgeInstance.constructor.prototype, {
				render(oldMethod) {
					return function (...args) {
						const result = oldMethod && oldMethod.apply(this, args);
						const coords = this.getCenter();

						const div = this.timestampEl || this.canvas.canvasEl.createDiv("canvas-edge-timestamp");
						div.style.transform = "translate(".concat(coords.x, "px, ").concat(coords.y, "px)")

						this.timestampEl = div;
						div.setText(this?.unknownData?.timestamp);	

						return 
					}
				},
				destroy(oldMethod) {
					return function (...args) {
						if (this.timestampEl) {
							this.timestampEl.remove()
						}
						const result = oldMethod && oldMethod.apply(this, args);

					}
				}
			})

			this.register(edgeUninstaller);

			console.log("timestamped-canvas: canvas edge patched");
			return true;
		}

		this.app.workspace.onLayoutReady(() => {
				if (!patchEdge()) {
					const evt = app.workspace.on("layout-change", () => {
						patchEdge() && app.workspace.offref(evt);
					});
					this.registerEvent(evt);
				}
			});
		}

	patchCanvasNode() {
		const createTimestamp = () => {
			return moment().format(this.settings.dateFormat)
		}

		const patchNode = () => {
			const canvasView = app.workspace.getLeavesOfType("canvas").first()?.view;
			// @ts-ignore
			const canvas = canvasView?.canvas;
			if(!canvas) return false;

			const node = Array.from(canvas.nodes).first();
			if (!node) return false;


			// @ts-ignore
			const nodeInstance = node[1];
			const plugin = this;


			const uninstaller = around(nodeInstance.constructor.prototype, {
				render(oldMethod) {
					return function (...args) {
						const result = oldMethod && oldMethod.apply(this, args);

						const div = this.timestampEl || this.nodeEl.createDiv("canvas-node-timestamp");
						this.timestampEl = div;
						div.setText(this?.unknownData?.timestamp);	

						return 
					}
				},
				showMenu(oldMethod) {
					return function (...args) {
						const e = args[0];

						e.addItem(e => {
							return e.setSection("canvas").setTitle('Clear timestamp').setIcon("lucide-alarm-minus").onClick(() => {
								if (this?.unknownData?.timestamp) {
									this['unknownData']['timestamp'] = ''
								}
							})
						})
						e.addItem(e => {
							return e.setSection("canvas").setTitle('Update timestamp').setIcon("lucide-alarm-plus").onClick(() => {
								this['unknownData']['timestamp'] = createTimestamp()
							})
						})
						
						return oldMethod && oldMethod.apply(this, args);

					}
				}
			});
			this.register(uninstaller);

			console.log("timestamped-canvas: canvas node patched");
			return true;
		}
		this.app.workspace.onLayoutReady(() => {
			if (!patchNode()) {
				const evt = app.workspace.on("layout-change", () => {
					patchNode() && app.workspace.offref(evt);
				});
				this.registerEvent(evt);
			}
		});
	}

	

}
