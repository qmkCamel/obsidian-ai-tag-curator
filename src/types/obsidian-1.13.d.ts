import "obsidian";

declare module "obsidian" {
  interface PluginSettingTab {
    /** Available at runtime only when requireApiVersion("1.13.0") is true. */
    update(): void;
  }
}
