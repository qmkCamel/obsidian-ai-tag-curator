// Browser-only public-API shim. No vault, plugin data, providers or host window are opened.
import { createElement, Tags, X, RefreshCw, SlidersHorizontal, Activity, ChevronLeft, ChevronRight, ArrowLeft, Undo2, RotateCcw, Trash2, FolderPlus, ShieldPlus } from "lucide";
const icons = { tags: Tags, x: X, "refresh-cw": RefreshCw, "sliders-horizontal": SlidersHorizontal, activity: Activity,
  "chevron-left": ChevronLeft, "chevron-right": ChevronRight, "arrow-left": ArrowLeft, "undo-2": Undo2,
  "rotate-ccw": RotateCcw, "trash-2": Trash2, "folder-plus": FolderPlus, "shield-plus": ShieldPlus };
export function setIcon(element, name) {
  if (!icons[name]) throw new Error(`Unmapped fixture icon: ${name}`);
  element.replaceChildren(createElement(icons[name], { class: "svg-icon", "aria-hidden": "true" }));
}
Object.assign(HTMLElement.prototype, {
  empty() { this.replaceChildren(); }, addClass(...classes) { this.classList.add(...classes); },
  createEl(tag, options = {}) {
    const el = this.ownerDocument.createElement(tag);
    if (options.cls) el.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
    if (options.text !== undefined) el.textContent = options.text;
    for (const [name, value] of Object.entries(options.attr ?? {})) el.setAttribute(name, value);
    this.append(el); return el;
  },
  createDiv(options) { return this.createEl("div", options); }, createSpan(options) { return this.createEl("span", options); },
});
export class ItemView {
  constructor(leaf) { this.app = leaf.app; this.contentEl = document.querySelector("#preview").createDiv({ cls: "view-content" }); }
}
export class Modal {
  constructor(app) {
    this.app = app; this.containerEl = document.createElement("div"); this.containerEl.className = "modal-container mod-dim";
    this.containerEl.createDiv({ cls: "modal-bg" });
    this.modalEl = this.containerEl.createDiv({ cls: "modal", attr: { role: "dialog", "aria-modal": "true" } });
    this.contentEl = this.modalEl.createDiv({ cls: "modal-content" });
    this.containerEl.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); this.close(); }
      if (event.key !== "Tab") return;
      const focusable = Array.from(this.contentEl.querySelectorAll("input,button,select,textarea")).filter(el => !el.disabled);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
  }
  open() { document.body.append(this.containerEl); this.onOpen(); }
  close() { this.onClose(); this.containerEl.remove(); }
}
