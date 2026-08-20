// Renders the Obsidian settings tab for provider and recommendation behavior.
import { Notice, PluginSettingTab, Setting } from "obsidian";
import { describeProviderEndpoint, testProviderConnection, type ProviderTestResult } from "../ai/AiProviderFactory";
import type TagCuratorPlugin from "../main";
import {
  applyProviderPresetSettings,
  type AiPromptProfile,
  type AiProviderPreset,
  type AiProviderType,
  type ProviderConcurrency
} from "./PluginSettings";
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
      .setName(labels.settings.providerTypeName)
      .setDesc(labels.settings.providerTypeDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("openai-compatible", labels.settings.providerTypeRemote)
          .addOption("local-openai-compatible", labels.settings.providerTypeLocal)
          .setValue(this.plugin.settings.providerType)
          .onChange(async (value) => {
            this.plugin.settings.providerType = value as AiProviderType;
            this.plugin.settings.providerPreset = "custom";
            if (this.plugin.settings.providerType === "local-openai-compatible") {
              this.plugin.settings.supportsJsonMode = false;
              this.plugin.settings.providerConcurrency = 1;
              this.plugin.settings.promptProfile = "edge-small";
            } else {
              this.plugin.settings.supportsJsonMode = true;
              this.plugin.settings.providerConcurrency = 2;
              this.plugin.settings.promptProfile = "default";
            }
            await this.plugin.savePluginData();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName(labels.settings.providerPresetName)
      .setDesc(labels.settings.providerPresetDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("openai", labels.settings.providerPresetOpenAI)
          .addOption("deepseek", labels.settings.providerPresetDeepSeek)
          .addOption("litert-lm", labels.settings.providerPresetLiteRT)
          .addOption("ollama", labels.settings.providerPresetOllama)
          .addOption("lm-studio", labels.settings.providerPresetLMStudio)
          .addOption("custom", labels.settings.providerPresetCustom)
          .setValue(this.plugin.settings.providerPreset)
          .onChange(async (value) => {
            this.plugin.settings = applyProviderPresetSettings(this.plugin.settings, value as AiProviderPreset);
            await this.plugin.savePluginData();
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
            this.plugin.settings.providerPreset = "custom";
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
          this.plugin.settings.providerPreset = "custom";
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName(labels.settings.supportsJsonModeName)
      .setDesc(labels.settings.supportsJsonModeDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.supportsJsonMode).onChange(async (value) => {
          this.plugin.settings.supportsJsonMode = value;
          this.plugin.settings.providerPreset = "custom";
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName(labels.settings.providerConcurrencyName)
      .setDesc(labels.settings.providerConcurrencyDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("1", "1")
          .addOption("2", "2")
          .setValue(String(this.plugin.settings.providerConcurrency))
          .onChange(async (value) => {
            this.plugin.settings.providerConcurrency = Number(value) as ProviderConcurrency;
            this.plugin.settings.providerPreset = "custom";
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName(labels.settings.promptProfileName)
      .setDesc(labels.settings.promptProfileDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("default", labels.settings.promptProfileDefault)
          .addOption("edge-small", labels.settings.promptProfileEdgeSmall)
          .setValue(this.plugin.settings.promptProfile)
          .onChange(async (value) => {
            this.plugin.settings.promptProfile = value as AiPromptProfile;
            this.plugin.settings.providerPreset = "custom";
            await this.plugin.savePluginData();
          })
      );

    const endpoint = describeProviderEndpoint(this.plugin.settings);
    new Setting(containerEl)
      .setName(labels.settings.providerPrivacyName)
      .setDesc(`${labels.settings.providerPrivacyDesc} ${providerBoundaryText(labels, endpoint.boundary, endpoint.host)}`);

    new Setting(containerEl)
      .setName(labels.settings.providerTestName)
      .setDesc(labels.settings.providerTestDesc)
      .addButton((button) => {
        button.setButtonText(labels.settings.providerTestButton).onClick(async () => {
          button.setButtonText(labels.settings.providerTestRunning).setDisabled(true);
          const result = await testProviderConnection(this.plugin.settings);
          if (result.ok) {
            new Notice(
              labels.notices.providerTestSucceeded(result.model, result.supportsJsonMode ? "enabled" : "disabled")
            );
          } else {
            new Notice(labels.notices.providerTestFailed(formatProviderTestFailure(result)));
          }
          button.setButtonText(labels.settings.providerTestButton).setDisabled(false);
        });
      });

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

function providerBoundaryText(
  labels: TagCuratorPlugin["labels"],
  boundary: "loopback" | "custom" | "remote",
  host: string
): string {
  if (boundary === "loopback") {
    return labels.settings.providerBoundaryLoopback(host);
  }
  if (boundary === "remote") {
    return labels.settings.providerBoundaryRemote(host);
  }
  return labels.settings.providerBoundaryCustom(host);
}

function formatProviderTestFailure(result: ProviderTestResult): string {
  const errorKind = result.errorKind ?? "provider-error";
  return `${errorKind}: ${result.message} (${result.providerType}, ${result.baseUrl || "no base URL"}, ${
    result.model || "no model"
  })`;
}
