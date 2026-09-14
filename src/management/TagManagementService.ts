import type { TagIndexSnapshot } from "../index/TagIndexService";
import { rawTagValues } from "../obsidian/TagValuePatch";
import { projectOperationHistory } from "../operations/OperationHistory";
import { isProtectedTag, pathExcluded, type TagMutationPolicy } from "../policy/TagMutationPolicy";
import type { TagScope } from "./TagScope";
import type { ManagementHistoryEntry, TagManagementAdapter, TagManagementState } from "./TagManagementView";

export interface TagManagementDependencies {
  index(): TagIndexSnapshot;
  scope(): TagScope;
  policy(): TagMutationPolicy;
  records(): unknown;
  receipts(): unknown;
  historyRevision(): number;
  markdownPaths(): string[];
  folders(): string[];
  busy(): boolean;
  error(): string | null;
  historyError(): string | null;
  subscribe(listener: () => void): () => void;
  commands: TagManagementAdapter["commands"];
}

/** Shared read model; commands remain owned by the plugin's existing transaction services. */
export class TagManagementService implements TagManagementAdapter {
  private history?: ManagementHistoryEntry[];
  private historyPolicyRevision = -1;
  private historyRevision = -1;
  readonly commands: TagManagementAdapter["commands"];

  constructor(private readonly dependencies: TagManagementDependencies) {
    this.commands = dependencies.commands;
  }

  subscribe(listener: () => void): () => void { return this.dependencies.subscribe(listener); }
  invalidateHistory(): void { this.history = undefined; }

  getState(): TagManagementState {
    const d = this.dependencies;
    const snapshot = d.index();
    const scope = d.scope();
    const policy = d.policy();
    const history = this.getHistory(policy);
    const paths = new Set(d.markdownPaths());
    const folders = d.folders();
    return {
      index: snapshot.index ?? null, freshness: snapshot.state, indexRevision: snapshot.revision,
      scope: structuredClone(scope), policy: structuredClone(policy), history,
      historyError: d.historyError() ?? undefined, error: d.error() ?? snapshot.error ?? undefined,
      busy: d.busy(), recoveryRequired: history.some(row => row.unresolved),
      failedPaths: snapshot.failedPaths, progress: snapshot.state === "refreshing" ? snapshot.progress : undefined,
      folders,
      invalidFolders: [...new Set([...scope.include.map(rule => rule.path), ...policy.excludedFolders])]
        .filter(path => path !== "" && !folders.includes(path)),
      missingPaths: [...new Set(history.flatMap(row => row.files.map(file => file.path)).concat(
        Object.values(snapshot.index?.tags ?? {}).flatMap(tag => tag.files.map(file => file.path))))].filter(path => !paths.has(path))
    };
  }

  private getHistory(policy: TagMutationPolicy): ManagementHistoryEntry[] {
    const revision = this.dependencies.historyRevision();
    if (this.history && this.historyPolicyRevision === policy.revision && this.historyRevision === revision) return this.history;
    const rows = projectOperationHistory(this.dependencies.records(), this.dependencies.receipts());
    this.historyRevision = revision;
    this.historyPolicyRevision = policy.revision;
    this.history = rows.map(row => ({
      id: row.operationId, createdAt: row.createdAt, origin: row.origin, action: row.action, status: row.status, model: row.model,
      files: row.files.map(file => ({ path: file.notePath,
        beforeTags: file.tagValuePatch ? rawTagValues(file.tagValuePatch.before) : file.beforeTags,
        afterTags: file.tagValuePatch ? rawTagValues(file.tagValuePatch.after) : file.afterTags, inlineChanges: file.inlineChanges })),
      canUndo: row.canUndo, canRecover: row.canRecover, legacy: row.legacy,
      unresolved: ["applying", "undoing", "recoveryRequired"].includes(row.status), readOnlyReason: row.unavailableReason,
      policyExceptions: row.files.filter(file => pathExcluded(file.notePath, policy) ||
        [...file.beforeTags, ...file.afterTags].some(tag => isProtectedTag(tag, policy))).map(file => file.notePath)
    }));
    return this.history;
  }
}
