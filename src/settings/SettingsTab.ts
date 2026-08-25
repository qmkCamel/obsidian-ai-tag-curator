// Renders the Obsidian settings tab for provider and recommendation behavior.
import { Notice, PluginSettingTab, Setting } from "obsidian";
import {
  describeProviderEndpoint,
  testProviderConnection,
  type ProviderTestResult,
  type ProviderTestStage
} from "../ai/AiProviderFactory";
import type TagCuratorPlugin from "../main";
import {
  applyProviderPresetSettings,
  type AiPromptProfile,
  type AiProviderPreset,
  type AiProviderType,
  type ProviderConcurrency,
  type TagCuratorSettings
} from "./PluginSettings";
import type { UiLanguagePreference } from "../ui/labels";

const FEEDBACK_URL = "https://github.com/qmkCamel/obsidian-ai-tag-curator/issues/new";

interface ProviderTestJob {
  token: symbol;
  settings: TagCuratorSettings;
  startedAt: number;
  stage: ProviderTestStage;
  cancelRequested: boolean;
}

interface ProviderTestOutcome {
  status: "success" | "failed" | "cancelled";
  result: ProviderTestResult;
  completedAt: number;
}

export class TagCuratorSettingsTab extends PluginSettingTab {
  plugin: TagCuratorPlugin;
  private providerTestJob: ProviderTestJob | null = null;
  private providerTestOutcome: ProviderTestOutcome | null = null;
  private providerTestStatusEl: HTMLElement | null = null;
  private providerTestElapsedTimer: ReturnType<typeof globalThis.setInterval> | null = null;

  constructor(plugin: TagCuratorPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const labels = this.plugin.labels;
    containerEl.empty();
    containerEl.addClass("tag-curator-settings");

    new Setting(containerEl).setName(labels.settings.heading).setHeading();

    this.addSectionHeading(containerEl, labels.settings.sectionGeneral);
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

    this.addSectionHeading(containerEl, labels.settings.sectionProvider);
    this.renderProviderConnection(containerEl);
    this.renderProviderAdvancedSettings(containerEl);

    this.addSectionHeading(containerEl, labels.settings.sectionRecommendations);
    this.renderRecommendationSettings(containerEl);

    this.addSectionHeading(containerEl, labels.settings.sectionIndexing);
    this.renderIndexingSettings(containerEl);

    this.addSectionHeading(containerEl, labels.settings.sectionDiagnostics);
    this.renderDiagnosticsSettings(containerEl);
  }

  private renderProviderConnection(containerEl: HTMLElement): void {
    const labels = this.plugin.labels;

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
            this.invalidateProviderTest();
            this.plugin.settings = applyProviderPresetSettings(this.plugin.settings, value as AiProviderPreset);
            await this.plugin.savePluginData();
            this.display();
          })
      );

    if (this.plugin.settings.providerPreset === "custom") {
      new Setting(containerEl)
        .setName(labels.settings.providerTypeName)
        .setDesc(labels.settings.providerTypeDesc)
        .addDropdown((dropdown) =>
          dropdown
            .addOption("openai-compatible", labels.settings.providerTypeRemote)
            .addOption("local-openai-compatible", labels.settings.providerTypeLocal)
            .setValue(this.plugin.settings.providerType)
            .onChange(async (value) => {
              this.invalidateProviderTest();
              this.plugin.settings.providerType = value as AiProviderType;
              this.plugin.settings.apiKey = "";
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
    }

    const customEndpoint = this.plugin.settings.providerPreset === "custom";
    new Setting(containerEl)
      .setName(labels.settings.apiBaseUrlName)
      .setDesc(customEndpoint ? labels.settings.apiBaseUrlDesc : labels.settings.apiBaseUrlPresetDesc)
      .addText((text) => {
        text
          .setPlaceholder("https://api.openai.com/v1")
          .setValue(this.plugin.settings.apiBaseUrl)
          .setDisabled(!customEndpoint);
        if (customEndpoint) {
          text.onChange(async (value) => {
            this.invalidateProviderTest();
            this.plugin.settings.apiBaseUrl = value.trim();
            await this.plugin.savePluginData();
          });
        }
      });

    new Setting(containerEl)
      .setName(labels.settings.modelName)
      .setDesc(labels.settings.modelDesc)
      .addText((text) =>
        text.setValue(this.plugin.settings.model).onChange(async (value) => {
          this.invalidateProviderTest();
          this.plugin.settings.model = value.trim();
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName(labels.settings.apiKeyName)
      .setDesc(
        this.plugin.settings.providerType === "openai-compatible"
          ? labels.settings.apiKeyRemoteDesc
          : labels.settings.apiKeyLocalDesc
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder(this.plugin.settings.providerType === "openai-compatible" ? "sk-..." : labels.settings.apiKeyLocalDesc)
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.invalidateProviderTest();
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.savePluginData();
          });
      });

    const endpoint = describeProviderEndpoint(this.plugin.settings);
    new Setting(containerEl)
      .setName(labels.settings.providerPrivacyName)
      .setDesc(`${labels.settings.providerPrivacyDesc} ${providerBoundaryText(labels, endpoint.boundary, endpoint.host)}`);

    const testSetting = new Setting(containerEl)
      .setName(labels.settings.providerTestName)
      .setDesc(labels.settings.providerTestDesc)
      .setClass("tag-curator-settings__provider-test")
      .addButton((button) => {
        button
          .setButtonText(this.providerTestJob ? labels.settings.providerTestRunning : labels.settings.providerTestButton)
          .setDisabled(this.providerTestJob !== null)
          .onClick(() => {
            void this.startProviderTest();
          });
      });

    if (this.providerTestJob) {
      testSetting.addButton((button) => {
        button
          .setButtonText(labels.settings.providerTestCancelButton)
          .setWarning()
          .setDisabled(this.providerTestJob?.cancelRequested ?? false)
          .onClick(() => this.cancelProviderTest());
      });
    }

    this.providerTestStatusEl = containerEl.createDiv({ cls: "tag-curator-provider-test-status" });
    this.renderProviderTestStatus();
  }

  private renderProviderAdvancedSettings(containerEl: HTMLElement): void {
    const labels = this.plugin.labels;
    const details = containerEl.createEl("details", { cls: "tag-curator-settings__advanced" });
    details.createEl("summary", {
      text: `${labels.settings.sectionProviderAdvanced} — ${labels.settings.sectionProviderAdvancedSummary(
        this.plugin.settings.promptProfile,
        this.plugin.settings.providerConcurrency,
        this.plugin.settings.supportsJsonMode
      )}`
    });

    new Setting(details)
      .setName(labels.settings.supportsJsonModeName)
      .setDesc(labels.settings.supportsJsonModeDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.supportsJsonMode).onChange(async (value) => {
          this.invalidateProviderTest();
          this.plugin.settings.supportsJsonMode = value;
          await this.plugin.savePluginData();
        })
      );

    new Setting(details)
      .setName(labels.settings.promptProfileName)
      .setDesc(labels.settings.promptProfileDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("default", labels.settings.promptProfileDefault)
          .addOption("edge-small", labels.settings.promptProfileEdgeSmall)
          .setValue(this.plugin.settings.promptProfile)
          .onChange(async (value) => {
            this.invalidateProviderTest();
            this.plugin.settings.promptProfile = value as AiPromptProfile;
            await this.plugin.savePluginData();
          })
      );

    new Setting(details)
      .setName(labels.settings.providerConcurrencyName)
      .setDesc(labels.settings.providerConcurrencyDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("1", "1")
          .addOption("2", "2")
          .setValue(String(this.plugin.settings.providerConcurrency))
          .onChange(async (value) => {
            this.invalidateProviderTest();
            this.plugin.settings.providerConcurrency = Number(value) as ProviderConcurrency;
            await this.plugin.savePluginData();
          })
      );
  }

  private renderRecommendationSettings(containerEl: HTMLElement): void {
    const labels = this.plugin.labels;
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
      .setName(labels.settings.allowNewTagsName)
      .setDesc(labels.settings.allowNewTagsDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.allowNewTags).onChange(async (value) => {
          this.plugin.settings.allowNewTags = value;
          await this.plugin.savePluginData();
          this.display();
        })
      );

    if (this.plugin.settings.allowNewTags) {
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
    }
  }

  private renderIndexingSettings(containerEl: HTMLElement): void {
    const labels = this.plugin.labels;
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
  }

  private renderDiagnosticsSettings(containerEl: HTMLElement): void {
    const labels = this.plugin.labels;
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

  private addSectionHeading(containerEl: HTMLElement, name: string): void {
    new Setting(containerEl)
      .setName(name)
      .setHeading()
      .setClass("tag-curator-settings__section-heading");
  }

  private async startProviderTest(): Promise<void> {
    if (this.providerTestJob) {
      return;
    }

    const job: ProviderTestJob = {
      token: Symbol("provider-test"),
      settings: { ...this.plugin.settings },
      startedAt: Date.now(),
      stage: "validating",
      cancelRequested: false
    };
    this.providerTestJob = job;
    this.providerTestOutcome = null;
    this.startProviderTestTimer();
    this.display();

    try {
      const result = await testProviderConnection(job.settings, {
        onStage: (stage) => {
          if (this.providerTestJob?.token !== job.token) {
            return;
          }
          job.stage = stage;
          this.renderProviderTestStatus();
        },
        isCancelled: () => job.cancelRequested
      });

      if (this.providerTestJob?.token !== job.token) {
        return;
      }

      const cancelled = job.cancelRequested || result.errorKind === "cancelled";
      this.providerTestOutcome = {
        status: cancelled ? "cancelled" : result.ok ? "success" : "failed",
        result,
        completedAt: Date.now()
      };

      if (!cancelled) {
        if (result.ok) {
          new Notice(
            this.plugin.labels.notices.providerTestSucceeded(
              result.model,
              result.supportsJsonMode ? "enabled" : "disabled"
            )
          );
        } else {
          new Notice(this.plugin.labels.notices.providerTestFailed(formatProviderTestFailure(result)));
        }
      }
    } finally {
      if (this.providerTestJob?.token === job.token) {
        this.providerTestJob = null;
        this.stopProviderTestTimer();
        this.display();
      }
    }
  }

  private cancelProviderTest(): void {
    if (!this.providerTestJob || this.providerTestJob.cancelRequested) {
      return;
    }
    this.providerTestJob.cancelRequested = true;
    this.renderProviderTestStatus();
    this.display();
  }

  private invalidateProviderTest(): void {
    this.providerTestOutcome = null;
    if (this.providerTestJob) {
      this.providerTestJob.cancelRequested = true;
    }
    this.renderProviderTestStatus();
  }

  private startProviderTestTimer(): void {
    this.stopProviderTestTimer();
    this.providerTestElapsedTimer = globalThis.setInterval(() => this.renderProviderTestStatus(), 1000);
  }

  private stopProviderTestTimer(): void {
    if (this.providerTestElapsedTimer !== null) {
      globalThis.clearInterval(this.providerTestElapsedTimer);
      this.providerTestElapsedTimer = null;
    }
  }

  private renderProviderTestStatus(): void {
    const statusEl = this.providerTestStatusEl;
    if (!statusEl) {
      return;
    }
    const labels = this.plugin.labels;
    statusEl.empty();

    if (this.providerTestJob) {
      statusEl.dataset.state = this.providerTestJob.cancelRequested ? "cancelling" : "running";
      statusEl.createDiv({
        cls: "tag-curator-provider-test-status__title",
        text: this.providerTestJob.cancelRequested
          ? labels.settings.providerTestCancelRequested
          : labels.settings.providerTestRunning
      });
      statusEl.createDiv({
        cls: "tag-curator-provider-test-status__meta",
        text: labels.settings.providerTestProgress(
          this.providerTestJob.settings.model,
          providerTestStageText(labels, this.providerTestJob.stage),
          formatElapsed(Date.now() - this.providerTestJob.startedAt)
        )
      });
      if (this.providerTestJob.cancelRequested) {
        statusEl.createDiv({
          cls: "tag-curator-provider-test-status__boundary",
          text: labels.settings.providerTestCancelBoundary
        });
      }
      return;
    }

    if (!this.providerTestOutcome) {
      statusEl.dataset.state = "idle";
      statusEl.textContent = labels.settings.providerTestIdle;
      return;
    }

    const completedAt = new Date(this.providerTestOutcome.completedAt).toLocaleString();
    statusEl.dataset.state = this.providerTestOutcome.status;
    if (this.providerTestOutcome.status === "success") {
      statusEl.textContent = labels.settings.providerTestSucceededStatus(
          this.providerTestOutcome.result.model,
          this.providerTestOutcome.result.supportsJsonMode ? "enabled" : "disabled",
          completedAt
      );
      return;
    }
    if (this.providerTestOutcome.status === "cancelled") {
      statusEl.createDiv({ text: labels.settings.providerTestCancelledStatus(completedAt) });
      statusEl.createDiv({
        cls: "tag-curator-provider-test-status__boundary",
        text: labels.settings.providerTestCancelBoundary
      });
      return;
    }
    statusEl.textContent = labels.settings.providerTestFailedStatus(
        formatProviderTestFailure(this.providerTestOutcome.result),
        completedAt
    );
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

function providerTestStageText(labels: TagCuratorPlugin["labels"], stage: ProviderTestStage): string {
  switch (stage) {
    case "validating":
      return labels.settings.providerTestStageValidating;
    case "probing-models":
      return labels.settings.providerTestStageModels;
    case "testing-chat":
      return labels.settings.providerTestStageChat;
  }
}

function formatProviderTestFailure(result: ProviderTestResult): string {
  const errorKind = result.errorKind ?? "provider-error";
  return `${errorKind}: ${result.message} (${result.providerType}, ${result.baseUrl || "no base URL"}, ${
    result.model || "no model"
  })`;
}

function formatElapsed(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
