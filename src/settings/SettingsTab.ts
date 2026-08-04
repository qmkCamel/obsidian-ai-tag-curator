// Renders the Obsidian settings tab for provider and recommendation behavior.
import { Notice, PluginSettingTab, Setting } from "obsidian";
import type TagCuratorPlugin from "../main";
import type { UiLanguagePreference } from "../ui/labels";

const FEEDBACK_URL = "https://github.com/qmkCamel/obsidian-ai-tag-curator/issues/new";

export class TagCuratorSettingsTab extends PluginSettingTab {
  plugin: TagCuratorPlugin;

  constructor(plugin: TagCuratorPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const labels = this.plugin.labels;
    containerEl.empty();

    new Setting(containerEl).setName(labels.settings.heading).setHeading();

    new Setting(containerEl)
      .setName(labels.settings.languageName)
      .setDesc(labels.settings.languageDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", labels.settings.languageAuto)
          .addOption("zh-CN", labels.settings.languageZh)
          .addOption("en", labels.settings.languageEn)
          .setValue(this.plugin.settings.uiLanguage)
          .onChange(async (value) => {
            this.plugin.settings.uiLanguage = value as UiLanguagePreference;
            this.plugin.refreshLabels();
            await this.plugin.savePluginData();
            new Notice(this.plugin.labels.notices.languageChanged);
            this.display();
          })
      );

    new Setting(containerEl)
      .setName(labels.settings.apiBaseUrlName)
      .setDesc(labels.settings.apiBaseUrlDesc)
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com/v1")
          .setValue(this.plugin.settings.apiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiBaseUrl = value.trim();
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName(labels.settings.apiKeyName)
      .setDesc(labels.settings.apiKeyDesc)
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName(labels.settings.modelName)
      .setDesc(labels.settings.modelDesc)
      .addText((text) =>
        text.setValue(this.plugin.settings.model).onChange(async (value) => {
          this.plugin.settings.model = value.trim();
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName(labels.settings.maxRecommendationsName)
      .setDesc(labels.settings.maxRecommendationsDesc)
      .addSlider((slider) =>
        slider
          .setLimits(1, 10, 1)
          .setValue(this.plugin.settings.maxRecommendations)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxRecommendations = value;
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName(labels.settings.maxFolderBatchFilesName)
      .setDesc(labels.settings.maxFolderBatchFilesDesc)
      .addSlider((slider) =>
        slider
          .setLimits(1, 200, 1)
          .setValue(this.plugin.settings.maxFolderBatchFiles)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxFolderBatchFiles = value;
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName(labels.settings.allowNewTagsName)
      .setDesc(labels.settings.allowNewTagsDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.allowNewTags).onChange(async (value) => {
          this.plugin.settings.allowNewTags = value;
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName(labels.settings.newTagStrictnessName)
      .setDesc(labels.settings.newTagStrictnessDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("strict", labels.settings.strictnessStrict)
          .addOption("balanced", labels.settings.strictnessBalanced)
          .addOption("exploratory", labels.settings.strictnessExploratory)
          .setValue(this.plugin.settings.newTagStrictness)
          .onChange(async (value) => {
            this.plugin.settings.newTagStrictness = value as typeof this.plugin.settings.newTagStrictness;
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName(labels.settings.readInlineTagsName)
      .setDesc(labels.settings.readInlineTagsDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.readInlineTags).onChange(async (value) => {
          this.plugin.settings.readInlineTags = value;
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName(labels.settings.refreshIndexOnLoadName)
      .setDesc(labels.settings.refreshIndexOnLoadDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.refreshIndexOnLoad).onChange(async (value) => {
          this.plugin.settings.refreshIndexOnLoad = value;
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName(labels.settings.devModeName)
      .setDesc(labels.settings.devModeDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.devMode).onChange(async (value) => {
          this.plugin.settings.devMode = value;
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName(labels.settings.feedbackName)
      .setDesc(labels.settings.feedbackDesc)
      .addButton((button) => {
        button
          .setIcon("message-circle")
          .setTooltip(labels.settings.feedbackButton)
          .onClick(() => {
            window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer");
          });
        button.buttonEl.createSpan({ text: labels.settings.feedbackButton });
      });
  }
}
