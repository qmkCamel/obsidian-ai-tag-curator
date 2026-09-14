import { TagManagementView } from "../../src/management/TagManagementView.ts";
import { TagManagementManualModal, TagManagementHistoryModal } from "../../src/management/TagManagementModals.ts";
import { getManagementLabels } from "../../src/ui/managementLabels.ts";

const listeners = new Set();
const calls = [];
const longPath = "Project/知识管理与研究/跨领域知识整理工作记录/2026-09-10-超长笔记文件名称-with-long-English-components.md";
const usage = (tag, count, offset = 0) => ({ tag, normalized: tag, count: 9999, examples: [], namingSignals: { depth: 1, hasHierarchy: false },
  files: Array.from({ length: count }, (_, i) => ({ path: i === 0 ? longPath : `Project/研究笔记-${String(i + offset).padStart(3, "0")}.md`, count: 88,
    sources: i % 3 === 0 ? ["frontmatter", "inline"] : i % 3 === 1 ? ["inline"] : ["frontmatter"] })) });
const tags = { "knowledge/研究方法": usage("knowledge/研究方法", 53), "项目/很长的中英文标签名称-with-long-English-components": usage("项目/很长的中英文标签名称-with-long-English-components", 12),
  "status/active": usage("status/active", 8), "legacy": { ...usage("legacy", 5), files: [{ path: longPath, count: 99, sources: ["metadata"] }] },
  "knowledge/研究方法/实验": usage("knowledge/研究方法/实验", 2), "only-body": { ...usage("only-body", 1), files: [{ path: "Project/body.md", sources: ["inline"], count: 1 }] } };
for (let i = 0; i < 105; i++) tags[`topic-${String(i).padStart(3, "0")}`] = usage(`topic-${String(i).padStart(3, "0")}`, 1, i);
const performanceTags = count => Object.fromEntries(Array.from({ length: count }, (_, i) => {
  const tag = `tag-${String(i).padStart(5, "0")}`;
  return [tag, { tag, normalized: tag, count: 9999, examples: [], namingSignals: { depth: 1, hasHierarchy: false },
    files: Array.from({ length: i === 0 ? 53 : 1 }, (_, j) => ({ path: `Project/performance/tag-${String(i).padStart(5, "0")}/note-${j}.md`, count: 88, sources: ["frontmatter", "inline"] })) }];
}));
const normalHistory = [
  { id: "latest", origin: "manual", action: "rename", status: "applied", createdAt: "2026-09-10T13:30:00.000Z", canUndo: true, canRecover: false,
    files: [{ path: longPath, beforeTags: ["研究", "KeepCase"], afterTags: ["knowledge/研究方法", "KeepCase"], inlineChanges: [{ before: "#研究", after: "#knowledge/研究方法", line: 8 }] }], policyExceptions: ["Project/Archive"] },
  { id: "older", origin: "recommendation", action: "addTags", status: "applied", model: "recorded-local-model-with-a-long-version-name/2026-09", createdAt: "2026-09-09T03:30:00.000Z", canUndo: false, canRecover: false, readOnlyReason: "notLatest", files: [{ path: "Project/推荐笔记.md", beforeTags: [], afterTags: ["研究"] }] },
  { id: "legacy", origin: "health", action: "merge", status: "applied", createdAt: undefined, canUndo: false, canRecover: false, readOnlyReason: "legacyReadOnly", legacy: true, files: [{ path: "Project/旧记录.md", beforeTags: ["Old"], afterTags: ["研究"] }] },
  { id: "receipt", origin: "batch", action: "addTags", status: "undone", createdAt: "2026-09-08T03:30:00.000Z", canUndo: false, canRecover: false, readOnlyReason: "completed", files: [] },
];
let state;
let view;
let language;
const adapter = { getState: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, commands: {
  refresh: async () => update({ freshness: "refreshing", progress: { completed: 18, total: 120 } }),
  cancelRefresh: () => update({ freshness: "stale", progress: undefined }),
  openFile: async path => { calls.push(["openFile", path]); },
  saveScopeAndPolicy: async (scope, policy) => { calls.push(["save", scope, policy]); update({ scope, policy: { ...policy, revision: policy.revision + 1 } }); },
  startManual: async intent => { calls.push(["startManual", intent]); },
  undo: async id => { calls.push(["undo", id]); throw new Error(language === "zh-CN" ? "文件存在后续编辑：本次预检零写入。" : "Files changed: preflight made zero writes."); },
  recover: async id => { calls.push(["recover", id]); throw new Error(language === "zh-CN" ? "恢复冲突：请检查原记录文件。" : "Recovery conflict: inspect the recorded files."); },
  openHealth: () => { calls.push(["health"]); },
} };
function update(patch) { state = { ...state, ...patch }; for (const listener of listeners) listener(); }
async function mount(options = {}) {
  if (view) await view.onClose(); document.querySelectorAll(".modal-container").forEach(el => el.remove()); document.querySelector("#preview").replaceChildren();
  language = options.language ?? "zh-CN"; document.body.className = options.dark ? "theme-dark" : "theme-light";
  document.documentElement.lang = language;
  state = { index: { updatedAt: "2026-09-10T13:30:00.000Z", tags: options.tagCount ? performanceTags(options.tagCount) : tags }, indexRevision: 1, freshness: "ready", scope: { include: [{ path: "", recursive: true }] },
    policy: { schemaVersion: 1, revision: 1, excludedFolders: ["Project/Archive"], protectedTags: [{ tag: "status", mode: "subtree" }] },
    history: normalHistory, folders: ["Project", "Project/Archive", "Project/知识管理与研究/跨领域知识整理工作记录"], missingPaths: ["Project/研究笔记-001.md"] };
  view = new TagManagementView({ app: {} }, { adapter, language }); await view.onOpen();
}
function recovery() { update({ recoveryRequired: true, history: [{ ...normalHistory[0], id: "recovery", origin: "batch", action: "addTags", status: "recoveryRequired", canUndo: false, canRecover: true, unresolved: true }, ...normalHistory.slice(1)] }); }
window.workbenchFixture = { mount, update, recovery, calls, manual: () => new TagManagementManualModal({}, adapter, getManagementLabels(language), ["knowledge/研究方法"], "rename").open(),
  state: () => state,
  confirmation: action => new TagManagementHistoryModal({}, adapter, getManagementLabels(language), action === "recover" ? "recovery" : "latest", action).open() };
await mount();
