// Defines immutable folder-batch review state and the local safety rules that derive writable plans.
import type {
  RecommendationConfidence,
  RecommendationType,
  TagRecommendation
} from "../ai/RecommendationSchema";
import type { TagIndex } from "../index/TagIndex";
import { createChangePlan, type ChangePlan } from "../preview/ChangePlan";
import type { TagCuratorSettings } from "../settings/PluginSettings";
import type { NoteTagInventory } from "../tags/NoteTagInventory";
import { findUnsyncedInlineTags } from "../tags/NoteTagInventory";
import type { UiLanguage } from "../ui/labels";
import { normalizeTag } from "../utils/normalizeTag";

export type FolderBatchPlanStatus = "generating" | "ready" | "partial";
export type FolderBatchRisk = "low" | "medium" | "high";
export type FolderBatchSourceStatus = "pending" | "ready" | "failed" | "cancelled";
export type FolderBatchAiStatus = "notStarted" | "pending" | "ready" | "failed" | "cancelled";
export type FolderBatchItemPlanStatus = "pending" | "ready" | "noChange" | "unavailable";
export type FolderBatchConflict = "missing" | "tagsChanged" | "contentChanged";

export interface FolderBatchSettingsSnapshot {
  model: string;
  maxRecommendations: number;
  maxFolderBatchFiles: number;
  allowNewTags: boolean;
  newTagStrictness: TagCuratorSettings["newTagStrictness"];
  uiLanguage: UiLanguage;
}

export interface FolderBatchCandidate {
  id: string;
  tag: string;
  action: "syncInlineTag" | "addTag";
  source: "inline" | "ai";
  type?: RecommendationType;
  confidence?: RecommendationConfidence;
  reason: string;
  risk: FolderBatchRisk;
  selected: boolean;
  executable: boolean;
}

export interface FolderBatchPlanItem {
  notePath: string;
  beforeTags?: string[];
  sourceContentHash?: string;
  inventory?: NoteTagInventory;
  sourceStatus: FolderBatchSourceStatus;
  aiStatus: FolderBatchAiStatus;
  planStatus: FolderBatchItemPlanStatus;
  candidates: FolderBatchCandidate[];
  sourceError?: string;
  aiError?: string;
  conflict?: FolderBatchConflict;
}

export interface FolderBatchPlan {
  id: string;
  folderPath: string;
  includeSubfolders: boolean;
  filePaths: string[];
  indexUpdatedAt: string;
  settings: FolderBatchSettingsSnapshot;
  createdAt: string;
  status: FolderBatchPlanStatus;
  items: FolderBatchPlanItem[];
}

export interface CreateFolderBatchPlanInput {
  folderPath: string;
  includeSubfolders: boolean;
  filePaths: string[];
  index: TagIndex;
  settings: TagCuratorSettings;
  uiLanguage: UiLanguage;
  now?: Date;
  randomId?: string;
}

/** Copies only the non-sensitive settings that must remain stable for the lifetime of one batch. */
export function createFolderBatchSettingsSnapshot(
  settings: TagCuratorSettings,
  uiLanguage: UiLanguage
): FolderBatchSettingsSnapshot {
  return {
    model: settings.model,
    maxRecommendations: settings.maxRecommendations,
    maxFolderBatchFiles: settings.maxFolderBatchFiles,
    allowNewTags: settings.allowNewTags,
    newTagStrictness: settings.newTagStrictness,
    uiLanguage
  };
}

/** Freezes the confirmed scope, index version, and settings before any per-note generation begins. */
export function createFolderBatchPlan(input: CreateFolderBatchPlanInput): FolderBatchPlan {
  const createdAt = (input.now ?? new Date()).toISOString();
  const filePaths = stableFilePaths(input.filePaths);

  return {
    id: input.randomId ?? `${createdAt}-${Math.random().toString(36).slice(2)}`,
    folderPath: normalizeFolderPath(input.folderPath),
    includeSubfolders: input.includeSubfolders,
    filePaths,
    indexUpdatedAt: input.index.updatedAt,
    settings: createFolderBatchSettingsSnapshot(input.settings, input.uiLanguage),
    createdAt,
    status: "generating",
    items: filePaths.map(createPendingFolderBatchItem)
  };
}

export function stableFilePaths(filePaths: string[]): string[] {
  return Array.from(new Set(filePaths)).sort((left, right) => left.localeCompare(right));
}

export function createPendingFolderBatchItem(notePath: string): FolderBatchPlanItem {
  return {
    notePath,
    sourceStatus: "pending",
    aiStatus: "notStarted",
    planStatus: "pending",
    candidates: []
  };
}

export function createInlineSyncCandidates(
  notePath: string,
  inventory: NoteTagInventory,
  reason: string
): FolderBatchCandidate[] {
  return findUnsyncedInlineTags(inventory).map((tag) => ({
    id: candidateId(notePath, "inline", tag),
    tag,
    action: "syncInlineTag",
    source: "inline",
    reason,
    risk: "low",
    selected: true,
    executable: true
  }));
}

/** Reclassifies AI additions against the frozen vault index before assigning risk and defaults. */
export function createAiCandidates(
  notePath: string,
  recommendations: TagRecommendation[],
  allowNewTags: boolean,
  existingVaultTags: Iterable<string>
): FolderBatchCandidate[] {
  // Model-provided existing/new labels are advisory; the frozen vault index is the risk authority.
  const existing = new Set(Array.from(existingVaultTags, normalizeTag).filter(Boolean));
  return recommendations
    .map((recommendation) => {
      const tag = normalizeTag(recommendation.tag);
      const localType: RecommendationType = existing.has(tag) ? "existing" : "new";
      const risk = classifyFolderBatchCandidate("addTag", localType);
      return {
        id: candidateId(notePath, "ai", recommendation.tag),
        tag,
        action: "addTag" as const,
        source: "ai" as const,
        type: localType,
        confidence: recommendation.confidence,
        reason: recommendation.reason,
        risk,
        selected: defaultCandidateSelection(risk),
        executable: risk !== "high"
      };
    })
    .filter((candidate) => candidate.tag.length > 0 && (allowNewTags || candidate.type !== "new"));
}

/** Maps an action shape to local risk without trusting model confidence or safety claims. */
export function classifyFolderBatchCandidate(action: string, type?: RecommendationType): FolderBatchRisk {
  if (action === "syncInlineTag") {
    return "low";
  }
  if (action === "addTag") {
    return type === "new" ? "medium" : "low";
  }
  return "high";
}

export function defaultCandidateSelection(risk: FolderBatchRisk): boolean {
  return risk === "low";
}

export function updateCandidateSelection(
  plan: FolderBatchPlan,
  candidateIdValue: string,
  selected: boolean
): FolderBatchPlan {
  return mapCandidates(plan, (candidate) =>
    candidate.id === candidateIdValue && candidate.executable ? { ...candidate, selected } : candidate
  );
}

export function selectAllLowRisk(plan: FolderBatchPlan): FolderBatchPlan {
  return mapCandidates(plan, (candidate) => ({
    ...candidate,
    selected: !candidate.executable ? false : candidate.risk === "low" ? true : candidate.selected
  }));
}

export function clearAllCandidates(plan: FolderBatchPlan): FolderBatchPlan {
  return mapCandidates(plan, (candidate) => ({ ...candidate, selected: false }));
}

/** Keeps source, AI, and writable-plan state orthogonal so partial local results remain reviewable. */
export function deriveFolderBatchItemPlanStatus(item: FolderBatchPlanItem): FolderBatchItemPlanStatus {
  if (item.sourceStatus === "pending" || item.aiStatus === "pending") {
    return "pending";
  }
  if (item.sourceStatus === "failed" || item.sourceStatus === "cancelled") {
    return "unavailable";
  }
  if (item.candidates.length > 0) {
    return "ready";
  }
  if (item.aiStatus === "ready") {
    return "noChange";
  }
  return "unavailable";
}

export function deriveFolderBatchStatus(items: FolderBatchPlanItem[]): FolderBatchPlanStatus {
  if (items.some((item) => item.sourceStatus === "pending" || item.aiStatus === "pending")) {
    return "generating";
  }

  return items.some(
    (item) =>
      item.sourceStatus === "failed" ||
      item.sourceStatus === "cancelled" ||
      item.aiStatus === "failed" ||
      item.aiStatus === "cancelled"
  )
    ? "partial"
    : "ready";
}

/** Converts only explicitly selected executable candidates into additive frontmatter plans. */
export function deriveChangePlans(plan: FolderBatchPlan): ChangePlan[] {
  return plan.items.flatMap((item) => {
    if (!item.beforeTags || !item.sourceContentHash || item.planStatus !== "ready") {
      return [];
    }

    const selected = item.candidates.filter((candidate) => candidate.selected && candidate.executable);
    const changePlan = createChangePlan({
      notePath: item.notePath,
      beforeTags: item.beforeTags,
      sourceContentHash: item.sourceContentHash,
      selectedInlineTags: selected.filter((candidate) => candidate.source === "inline").map((candidate) => candidate.tag),
      selectedAiTags: selected.filter((candidate) => candidate.source === "ai").map((candidate) => candidate.tag)
    });
    return changePlan.addedTags.length > 0 ? [changePlan] : [];
  });
}

export function withDerivedPlanState(plan: FolderBatchPlan): FolderBatchPlan {
  const items = plan.items.map((item) => ({ ...item, planStatus: deriveFolderBatchItemPlanStatus(item) }));
  return { ...plan, items, status: deriveFolderBatchStatus(items) };
}

function mapCandidates(
  plan: FolderBatchPlan,
  update: (candidate: FolderBatchCandidate) => FolderBatchCandidate
): FolderBatchPlan {
  return {
    ...plan,
    items: plan.items.map((item) => ({ ...item, candidates: item.candidates.map(update) }))
  };
}

function candidateId(notePath: string, source: FolderBatchCandidate["source"], tag: string): string {
  return `${notePath}::${source}::${normalizeTag(tag)}`;
}

function normalizeFolderPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}
