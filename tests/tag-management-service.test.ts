import { describe, expect, it, vi } from "vitest";
import { TagManagementService } from "../src/management/TagManagementService";
import { defaultTagScope } from "../src/management/TagScope";
import { defaultTagPolicy } from "../src/policy/TagMutationPolicy";
import type { TagIndexSnapshot } from "../src/index/TagIndexService";

describe("shared management read service", () => {
  function fixture(records: unknown = []) {
    let policy = defaultTagPolicy();
    const readRecords = vi.fn(() => records);
    const index: TagIndexSnapshot = { state: "missing", revision: 0, vaultRevision: 0, policyRevision: 0,
      generation: 0, index: undefined, failedPaths: [], progress: { completed: 0, total: 0 }, error: null };
    const service = new TagManagementService({ index: () => index, scope: defaultTagScope, policy: () => policy,
      records: readRecords, receipts: () => [], historyRevision: () => 0, markdownPaths: () => [], folders: () => [], busy: () => false,
      error: () => null, historyError: () => null, subscribe: () => () => {},
      commands: { refresh: vi.fn(), cancelRefresh: vi.fn(), saveScopeAndPolicy: vi.fn(), startManual: vi.fn(),
        openFile: vi.fn(), undo: vi.fn(), recover: vi.fn() } });
    return { service, readRecords, setPolicy: (next: typeof policy) => { policy = next; } };
  }

  it("does not re-clone history on every view query and refreshes it after persistence or policy changes", () => {
    const f = fixture();
    const first = f.service.getState();
    expect(f.service.getState().history).toBe(first.history);
    expect(f.readRecords).toHaveBeenCalledTimes(1);
    f.service.invalidateHistory();
    expect(f.service.getState().history).not.toBe(first.history);
    expect(f.readRecords).toHaveBeenCalledTimes(2);
    f.setPolicy({ ...defaultTagPolicy(), revision: 1 });
    f.service.getState();
    expect(f.readRecords).toHaveBeenCalledTimes(3);
  });

  it("keeps unknown historical data visible as read-only instead of an empty valid history", () => {
    const f = fixture({ future: "preserve" });
    const state = f.service.getState();
    expect(state.freshness).toBe("missing");
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({ canUndo: false, canRecover: false, readOnlyReason: "invalidHistory" });
  });

  it("lists invalid policy folders without guessing renamed targets and returns detached settings", () => {
    const f = fixture();
    f.setPolicy({ ...defaultTagPolicy(), excludedFolders: ["Deleted"] });
    const state = f.service.getState();
    expect(state.invalidFolders).toEqual(["Deleted"]);
    state.policy.excludedFolders.push("Other");
    state.scope.include[0].path = "Other";
    expect(f.service.getState().policy.excludedFolders).toEqual(["Deleted"]);
    expect(f.service.getState().scope).toEqual(defaultTagScope());
  });
});
