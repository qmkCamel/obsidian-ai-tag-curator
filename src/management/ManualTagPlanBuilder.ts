import type { DeterministicCleanupInput } from "../cleanup/CleanupReviewPlan";
import type { TagIndexSnapshot } from "../index/TagIndexService";
import { isProtectedTag, pathExcluded, type TagMutationPolicy } from "../policy/TagMutationPolicy";
import { normalizeTag } from "../utils/normalizeTag";
import { validateManualIntent, type ManualTagIntent, type ReviewContext } from "./ManualTagIntent";
import { pathInScope } from "./TagScope";

/** Freezes source-only candidates without reading notes or depending on health diagnoses. */
export class ManualTagPlanBuilder {
  constructor(private readonly snapshot: TagIndexSnapshot, private readonly policy: TagMutationPolicy) {}

  prepare(intent: ManualTagIntent): { input: DeterministicCleanupInput; context: ReviewContext; outsideFiles: number } {
    const validated = validateManualIntent(intent);
    if ([...validated.sourceTags, validated.targetTag].some(tag => isProtectedTag(tag, this.policy))) {
      throw new Error("Protected tags cannot be changed.");
    }
    if (this.snapshot.state !== "ready" || !this.snapshot.index || this.snapshot.policyRevision !== this.policy.revision) {
      throw new Error("Refresh the index before reviewing changes.");
    }
    const sources = new Set(validated.sourceTags);
    const sourcePaths = [...new Set(Object.values(this.snapshot.index.tags)
      .filter(tag => sources.has(normalizeTag(tag.normalized || tag.tag)))
      .flatMap(tag => tag.files.map(file => file.path)))];
    const candidatePaths = sourcePaths.filter(path => pathInScope(path, validated.scope) && !pathExcluded(path, this.policy)).sort();
    if (!candidatePaths.length || candidatePaths.length > 200) {
      throw new Error("Choose a scope containing between 1 and 200 related files.");
    }
    const context: ReviewContext = {
      origin: "manual", indexRevision: this.snapshot.revision, vaultRevision: this.snapshot.vaultRevision,
      policyRevision: this.policy.revision, scope: validated.scope, candidatePaths
    };
    return {
      input: { id: `manual-${Date.now()}`, title: `${validated.sourceTags.join(", ")} -> ${validated.targetTag}`,
        action: validated.action, sourceTags: validated.sourceTags, targetTag: validated.targetTag, candidatePaths, context },
      context, outsideFiles: sourcePaths.length - candidatePaths.length
    };
  }
}
