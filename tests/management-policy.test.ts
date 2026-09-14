import { describe, expect, it } from "vitest";
import { defaultTagScope, normalizeScope, normalizeScopePath, pathInScope } from "../src/management/TagScope";
import { validateManualIntent } from "../src/management/ManualTagIntent";
import { assertTagChangesAllowed, defaultTagPolicy, isProtectedTag, parsePolicy, pathExcluded } from "../src/policy/TagMutationPolicy";
import { MutationCoordinator } from "../src/policy/MutationCoordinator";

describe("management scope and intent", () => {
  it("matches path segments, deduplicates and rejects traversal", () => {
    const scope = normalizeScope({ include: [{ path: "Project", recursive: true }, { path: "Project/", recursive: true }] });
    expect(scope.include).toHaveLength(1);
    expect(pathInScope("Project/A.md", scope)).toBe(true);
    expect(pathInScope("Project/Sub/A.md", scope)).toBe(true);
    expect(pathInScope("Project-Old/A.md", scope)).toBe(false);
    for (const path of ["/", "/home/x", "../x", "a/../b", "C:\\x", "a//b", "a\u0000b"]) expect(() => normalizeScopePath(path)).toThrow();
    expect(pathInScope("A.md", defaultTagScope())).toBe(true);
  });
  it("preserves target spelling, uses exact source and rejects invalid targets", () => {
    expect(validateManualIntent({ kind: "merge", sources: ["old", "#NEW"], target: "#New", scope: defaultTagScope() }))
      .toMatchObject({ sourceTags: ["old"], targetTag: "New" });
    for (const target of ["old", "OLD", "123", "123/456", "a//b", "a b", "#", "a/"]) {
      expect(() => validateManualIntent({ kind: "rename", source: "old", target, scope: defaultTagScope() })).toThrow();
    }
  });
});

describe("shared tag protection", () => {
  const policy = parsePolicy({ schemaVersion: 1, revision: 1, excludedFolders: ["Project/Archive"], protectedTags: [{ tag: "Status", mode: "subtree" }] });
  it("protects exact subtree boundaries", () => {
    expect(isProtectedTag("status", policy)).toBe(true);
    expect(isProtectedTag("STATUS/active", policy)).toBe(true);
    expect(isProtectedTag("status-old", policy)).toBe(false);
    expect(pathExcluded("Project/Archive/A.md", policy)).toBe(true);
    expect(pathExcluded("Project/Archive-old/A.md", policy)).toBe(false);
  });
  it("protects raw values and multiplicity while allowing unrelated changes", () => {
    expect(() => assertTagChangesAllowed("A.md", ["Status", "old"], ["Status", "new"], policy)).not.toThrow();
    for (const after of [["status"], [], ["Status", "Status"]]) expect(() => assertTagChangesAllowed("A.md", ["Status"], after, policy)).toThrow();
    expect(() => assertTagChangesAllowed("A.md", [], ["status/active"], policy)).toThrow();
    expect(() => assertTagChangesAllowed("Project/Archive/A.md", [], ["new"], policy)).toThrow();
    expect(parsePolicy(undefined)).toEqual(defaultTagPolicy());
    expect(() => parsePolicy({ schemaVersion: 2 })).toThrow();
  });
});

it("rejects simultaneous work without queuing and preserves recovery identity", async () => {
  const coordinator = new MutationCoordinator();
  let release!: () => void;
  const first = coordinator.run(() => new Promise<void>((resolve) => { release = resolve; }), "operation-a");
  expect(coordinator.recoveryId).toBe("operation-a");
  await expect(coordinator.run(async () => {})).rejects.toThrow("already running");
  release();
  await first;
  expect(coordinator.busy).toBe(false);
  coordinator.block("Persistence failed");
  await expect(coordinator.run(async () => {})).rejects.toThrow("Persistence failed");
});

it("does not leave a lease held or replace an outcome when an observer throws", async () => {
  const coordinator = new MutationCoordinator(() => { throw new Error("View disposed"); });
  await expect(coordinator.run(async () => 42)).resolves.toBe(42);
  expect(coordinator.busy).toBe(false);
  await expect(coordinator.run(async () => { throw new Error("Write failed"); })).rejects.toThrow("Write failed");
  expect(coordinator.busy).toBe(false);
  coordinator.block("Reload required");
  expect(coordinator.error).toBe("Reload required");
});
