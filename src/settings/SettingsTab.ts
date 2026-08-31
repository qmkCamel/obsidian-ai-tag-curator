// Renders the Obsidian settings tab for provider and recommendation behavior.
import { Notice, PluginSettingTab, requireApiVersion, Setting } from "obsidian";
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
const DEFAULT_API_BASE_URL = "https://api.openai.com/v1";

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

interface SearchableSettingBase {
  name: string;
  desc?: string;
  visible?: boolean | (() => boolean);
}

type SearchableSettingItem = SearchableSettingBase &
  ({ render: (setting: Setting) => void } | { render?: never });

interface SearchableSettingGroup {
  type: "group";
  heading: string;
  items: SearchableSettingItem[];
}

export class TagCuratorSettingsTab extends PluginSettingTab {
  plugin: TagCuratorPlugin;
  private providerTestJob: ProviderTestJob | null = null;
  private providerTestOutcome: ProviderTestOutcome | null = null;
  private providerTestStatusEl: HTMLElement | null = null;
  private providerTestElapsedTimer: number | null = null;

  constructor(plugin: TagCuratorPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.renderLegacySettings();
  }

  private renderLegacySettings(): void {
    const { containerEl } = this;
    const labels = this.plugin.labels;
    containerEl.empty();
    containerEl.addClass("tag-curator-settings");

    new Setting(containerEl).setName(labels.settings.heading).setHeading();
    this.renderLegacyDefinitions(containerEl, this.getSettingDefinitions());
  }

  /** Obsidian 1.13+ uses these definitions for rendering and global settings search. */
  getSettingDefinitions(): SearchableSettingGroup[] {
    const labels = this.plugin.labels;
    const customEndpoint = this.plugin.settings.providerPreset === "custom";
    const endpoint = describeProviderEndpoint(this.plugin.settings);

    return [
      {
        type: "group",
        heading: labels.settings.sectionGeneral,
        items: [
          {
            name: labels.settings.languageName,
            desc: labels.settings.languageDesc,
            render: (setting) => {
              setting.addDropdown((dropdown) =>
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
                    this.refreshSettings();
                  })
              );
            }
          }
        ]
      },
      {
        type: "group",
        heading: labels.settings.sectionProvider,
        items: [
          {
            name: labels.settings.providerPresetName,
            desc: labels.settings.providerPresetDesc,
            render: (setting) => {
              setting.addDropdown((dropdown) =>
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
                    this.plugin.settings = applyProviderPresetSettings(
                      this.plugin.settings,
                      value as AiProviderPreset
                    );
                    await this.plugin.savePluginData();
                    this.refreshSettings();
                  })
              );
            }
          },
          {
            name: labels.settings.providerTypeName,
            desc: labels.settings.providerTypeDesc,
            visible: () => this.plugin.settings.providerPreset === "custom",
            render: (setting) => {
              setting.addDropdown((dropdown) =>
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
                    this.refreshSettings();
                  })
              );
            }
          },
          {
            name: labels.settings.apiBaseUrlName,
            desc: customEndpoint ? labels.settings.apiBaseUrlDesc : labels.settings.apiBaseUrlPresetDesc,
            render: (setting) => {
              setting.addText((text) => {
                text
                  .setPlaceholder(DEFAULT_API_BASE_URL)
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
            }
          },
          {
            name: labels.settings.modelName,
            desc: labels.settings.modelDesc,
            render: (setting) => {
              setting.addText((text) =>
                text.setValue(this.plugin.settings.model).onChange(async (value) => {
                  this.invalidateProviderTest();
                  this.plugin.settings.model = value.trim();
                  await this.plugin.savePluginData();
                })
              );
            }
          },
          {
            name: labels.settings.apiKeyName,
            desc:
              this.plugin.settings.providerType === "openai-compatible"
                ? labels.settings.apiKeyRemoteDesc
                : labels.settings.apiKeyLocalDesc,
            render: (setting) => {
              setting.addText((text) => {
                text.inputEl.type = "password";
                text
                  .setPlaceholder(
                    this.plugin.settings.providerType === "openai-compatible"
                      ? "sk-..."
                      : labels.settings.apiKeyLocalDesc
                  )
                  .setValue(this.plugin.settings.apiKey)
                  .onChange(async (value) => {
                    this.invalidateProviderTest();
                    this.plugin.settings.apiKey = value.trim();
                    await this.plugin.savePluginData();
                  });
              });
            }
          },
          {
            name: labels.settings.providerPrivacyName,
            desc: `${labels.settings.providerPrivacyDesc} ${providerBoundaryText(
              labels,
              endpoint.boundary,
              endpoint.host
            )}`
          },
          {
            name: labels.settings.providerTestName,
            desc: labels.settings.providerTestDesc,
            render: (setting) => this.renderProviderTestSetting(setting)
          }
        ]
      },
      {
        type: "group",
        heading: labels.settings.sectionProviderAdvanced,
        items: [
          {
            name: labels.settings.supportsJsonModeName,
            desc: labels.settings.supportsJsonModeDesc,
            render: (setting) => {
              setting.addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.supportsJsonMode).onChange(async (value) => {
                  this.invalidateProviderTest();
                  this.plugin.settings.supportsJsonMode = value;
                  await this.plugin.savePluginData();
                })
              );
            }
          },
          {
            name: labels.settings.promptProfileName,
            desc: labels.settings.promptProfileDesc,
            render: (setting) => {
              setting.addDropdown((dropdown) =>
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
            }
          },
          {
            name: labels.settings.providerConcurrencyName,
            desc: labels.settings.providerConcurrencyDesc,
            render: (setting) => {
              setting.addDropdown((dropdown) =>
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
          }
        ]
      },
      {
        type: "group",
        heading: labels.settings.sectionRecommendations,
        items: [
          {
            name: labels.settings.maxRecommendationsName,
            desc: labels.settings.maxRecommendationsDesc,
            render: (setting) => {
              setting.addSlider((slider) =>
                slider
                  .setLimits(1, 10, 1)
                  .setValue(this.plugin.settings.maxRecommendations)
                  .setDynamicTooltip()
                  .onChange(async (value) => {
                    this.plugin.settings.maxRecommendations = value;
                    await this.plugin.savePluginData();
                  })
              );
            }
          },
          {
            name: labels.settings.allowNewTagsName,
            desc: labels.settings.allowNewTagsDesc,
            render: (setting) => {
              setting.addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.allowNewTags).onChange(async (value) => {
                  this.plugin.settings.allowNewTags = value;
                  await this.plugin.savePluginData();
                  this.refreshSettings();
                })
              );
            }
          },
          {
            name: labels.settings.newTagStrictnessName,
            desc: labels.settings.newTagStrictnessDesc,
            visible: () => this.plugin.settings.allowNewTags,
            render: (setting) => {
              setting.addDropdown((dropdown) =>
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
        ]
      },
      {
        type: "group",
        heading: labels.settings.sectionIndexing,
        items: [
          {
            name: labels.settings.maxFolderBatchFilesName,
            desc: labels.settings.maxFolderBatchFilesDesc,
            render: (setting) => {
              setting.addSlider((slider) =>
                slider
                  .setLimits(1, 200, 1)
                  .setValue(this.plugin.settings.maxFolderBatchFiles)
                  .setDynamicTooltip()
                  .onChange(async (value) => {
                    this.plugin.settings.maxFolderBatchFiles = value;
                    await this.plugin.savePluginData();
                  })
              );
            }
          },
          {
            name: labels.settings.readInlineTagsName,
            desc: labels.settings.readInlineTagsDesc,
            render: (setting) => {
              setting.addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.readInlineTags).onChange(async (value) => {
                  this.plugin.settings.readInlineTags = value;
                  await this.plugin.savePluginData();
                })
              );
            }
          },
          {
            name: labels.settings.refreshIndexOnLoadName,
            desc: labels.settings.refreshIndexOnLoadDesc,
            render: (setting) => {
              setting.addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.refreshIndexOnLoad).onChange(async (value) => {
                  this.plugin.settings.refreshIndexOnLoad = value;
                  await this.plugin.savePluginData();
                })
              );
            }
          }
        ]
      },
      {
        type: "group",
        heading: labels.settings.sectionDiagnostics,
        items: [
          {
            name: labels.settings.devModeName,
            desc: labels.settings.devModeDesc,
            render: (setting) => {
              setting.addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.devMode).onChange(async (value) => {
                  this.plugin.settings.devMode = value;
                  await this.plugin.savePluginData();
                })
              );
            }
          },
          {
            name: labels.settings.feedbackName,
            desc: labels.settings.feedbackDesc,
            render: (setting) => {
              setting.addButton((button) => {
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
        ]
      }
    ];
  }

  private renderLegacyDefinitions(containerEl: HTMLElement, groups: SearchableSettingGroup[]): void {
    groups.forEach((group, groupIndex) => {
      let groupContainer = containerEl;
      if (groupIndex === 2) {
        const labels = this.plugin.labels;
        const details = containerEl.createEl("details", { cls: "tag-curator-settings__advanced" });
        details.createEl("summary", {
          text: `${group.heading} — ${labels.settings.sectionProviderAdvancedSummary(
            this.plugin.settings.promptProfile,
            this.plugin.settings.providerConcurrency,
            this.plugin.settings.supportsJsonMode
          )}`
        });
        groupContainer = details;
      } else {
        this.addSectionHeading(containerEl, group.heading);
      }

      for (const item of group.items) {
        if (!isSettingVisible(item.visible)) {
          continue;
        }
        const setting = new Setting(groupContainer).setName(item.name);
        if (item.desc) {
          setting.setDesc(item.desc);
        }
        item.render?.(setting);
      }
    });
  }

  private renderProviderTestSetting(setting: Setting): void {
    const labels = this.plugin.labels;
    setting.setClass("tag-curator-settings__provider-test").addButton((button) => {
      button
        .setButtonText(this.providerTestJob ? labels.settings.providerTestRunning : labels.settings.providerTestButton)
        .setDisabled(this.providerTestJob !== null)
        .onClick(() => {
          void this.startProviderTest();
        });
    });

    if (this.providerTestJob) {
      setting.addButton((button) => {
        button
          .setButtonText(labels.settings.providerTestCancelButton)
          .setWarning()
          .setDisabled(this.providerTestJob?.cancelRequested ?? false)
          .onClick(() => this.cancelProviderTest());
      });
    }

    const parentEl = setting.settingEl.parentElement;
    this.providerTestStatusEl = parentEl?.createDiv({ cls: "tag-curator-provider-test-status" }) ?? null;
    this.renderProviderTestStatus();
  }

  private refreshSettings(): void {
    if (requireApiVersion("1.13.0")) {
      this.update();
      return;
    }
    this.renderLegacySettings();
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
    this.refreshSettings();

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
        this.refreshSettings();
      }
    }
  }

  private cancelProviderTest(): void {
    if (!this.providerTestJob || this.providerTestJob.cancelRequested) {
      return;
    }
    this.providerTestJob.cancelRequested = true;
    this.renderProviderTestStatus();
    this.refreshSettings();
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
    this.providerTestElapsedTimer = window.setInterval(() => this.renderProviderTestStatus(), 1000);
  }

  private stopProviderTestTimer(): void {
    if (this.providerTestElapsedTimer !== null) {
      window.clearInterval(this.providerTestElapsedTimer);
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

function isSettingVisible(visible: SearchableSettingItem["visible"]): boolean {
  return typeof visible === "function" ? visible() : visible !== false;
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
