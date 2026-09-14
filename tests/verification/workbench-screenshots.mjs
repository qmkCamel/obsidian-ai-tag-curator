import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const runtime = process.env.CODEX_BROWSER_PACKAGES ?? path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules");
const requireRuntime = createRequire(path.join(runtime, "package.json"));
const { chromium } = requireRuntime("playwright");
const baseline = process.argv.includes("--baseline");
const startedAt = new Date().toISOString();
const runId = `${baseline ? "baseline" : "ui"}-${startedAt.replace(/[:.]/g, "-")}`;
const assets = path.join(root, "docs/verification/assets");
await fs.mkdir(assets, { recursive: true });

// Read only installed application assets. Never inspect or open any vault or host profile.
const archive = await fs.readFile(process.env.OBSIDIAN_ASAR ?? "/Applications/Obsidian.app/Contents/Resources/obsidian.asar");
const header = JSON.parse(archive.subarray(16, 16 + archive.readUInt32LE(12)).toString());
const archiveFile = name => {
  const entry = name.split("/").reduce((dir, part) => dir.files[part], header);
  const start = 8 + archive.readUInt32LE(4) + Number(entry.offset);
  return archive.subarray(start, start + entry.size).toString();
};
const appVersion = JSON.parse(archiveFile("package.json")).version;
const bundle = await build({ absWorkingDir: root, entryPoints: ["tests/verification/workbench-browser-fixture.mjs"], bundle: true, write: false, format: "esm", target: "es2022",
  alias: { obsidian: path.join(root, "tests/verification/workbench-browser-host.mjs"), lucide: requireRuntime.resolve("lucide") } });
const css = await fs.readFile(path.join(root, "styles.css"), "utf8");
const shell = `<!doctype html><html><head><meta charset="utf-8"><style>${archiveFile("app.css")}</style><style>
html,body,#preview{margin:0;width:100%;height:100%;}body{display:block;overflow:hidden;font-family:var(--font-interface),sans-serif}#preview{position:relative;display:flex;flex-direction:column}.view-content{flex:1;height:100%;width:100%;}
</style><style>${css}</style></head><body class="theme-light"><main id="preview"></main></body></html>`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const report = { startedAt, runId,
  boundary: "Synthetic DOM preview using production UI/CSS, a public-API shim and installed Obsidian base CSS. Not an Obsidian host, mobile device or vault integration test. Commands are in-memory fakes; conflicts are injected, not real preflight evidence.",
  measurement: "Control overlaps use viewport/ancestor-clipped painted rectangles, excluding content outside scrollports. Horizontal overflow includes laid-out offscreen content. Vertical scrolling is allowed. Screenshots still require review.",
  browser: browser.version(), obsidianCssVersion: appVersion, node: process.version, platform: `${process.platform}/${process.arch}`,
  externalRequests: [], pageErrors: [], sourceHashes: {}, cases: [], interactions: [], performance: [], passed: false };
for (const file of ["src/management/TagManagementView.ts", "src/management/TagManagementModals.ts", "src/ui/managementLabels.ts", "styles.css", "tests/verification/workbench-browser-fixture.mjs", "tests/verification/workbench-browser-host.mjs", "tests/verification/workbench-screenshots.mjs"]) {
  report.sourceHashes[file] = createHash("sha256").update(await fs.readFile(path.join(root, file))).digest("hex");
}
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", serviceWorkers: "block" });
  await page.route("**/*", route => { report.externalRequests.push(route.request().url()); return route.abort(); });
  page.on("pageerror", error => report.pageErrors.push(error.message));
  await page.setContent(shell); await page.addScriptTag({ type: "module", content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => window.workbenchFixture);
  const capture = async (name, pane = "list") => {
    await page.evaluate(() => document.fonts.ready);
    const checks = await page.evaluate(() => {
      const root = document.querySelector(".modal-content") ?? document.querySelector(".tag-curator-workbench");
      const visible = el => !!el?.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
      const bounds = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      // Intersect with scrollport clipping before comparing painted controls to fixed actions.
      const paintedRect = el => {
        const r = el.getBoundingClientRect();
        const rect = { left: Math.max(0, r.left), right: Math.min(innerWidth, r.right), top: Math.max(0, r.top), bottom: Math.min(innerHeight, r.bottom) };
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent), b = parent.getBoundingClientRect();
          if (/auto|scroll|hidden|clip/.test(style.overflowX)) { rect.left = Math.max(rect.left, b.left + parent.clientLeft); rect.right = Math.min(rect.right, b.left + parent.clientLeft + parent.clientWidth); }
          if (/auto|scroll|hidden|clip/.test(style.overflowY)) { rect.top = Math.max(rect.top, b.top + parent.clientTop); rect.bottom = Math.min(rect.bottom, b.top + parent.clientTop + parent.clientHeight); }
        }
        return rect;
      };
      const controls = Array.from(root.querySelectorAll("button,input,select,textarea")).filter(visible);
      const overlaps = [];
      for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
        const a = paintedRect(controls[i]), b = paintedRect(controls[j]);
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push([controls[i].getAttribute("aria-label"), controls[j].getAttribute("aria-label")]);
      }
      const clipped = controls.filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2 && !["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName); }).map(el => el.getAttribute("aria-label"));
      const overflowingText = Array.from(root.querySelectorAll("p,h2,h3,h4,span,button,dt,dd,label")).filter(visible).filter(el => el.clientWidth && el.scrollWidth > el.clientWidth + 2).map(el => el.textContent.slice(0, 90));
      const undersizedFilters = controls.filter(el => el.closest(".tag-curator-workbench__filters") && ["INPUT", "SELECT"].includes(el.tagName) && el.getBoundingClientRect().height < 28).map(el => el.getAttribute("aria-label"));
      const list = document.querySelector(".tag-curator-workbench__list"), detail = document.querySelector(".tag-curator-workbench__detail");
      const scrollports = Array.from(root.querySelectorAll(".tag-curator-workbench__list,.tag-curator-workbench__detail")).filter(visible).map(el => ({ className: el.className, ...bounds(el), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }));
      return { width: innerWidth, height: innerHeight, theme: document.body.className, language: document.documentElement.lang, controls: controls.length, overlaps, clipped, overflowingText, undersizedFilters, rootHorizontalOverflow: root.scrollWidth > root.clientWidth + 1,
        scrollports, rootBounds: bounds(root), domElements: root.querySelectorAll("*").length,
        tagRows: document.querySelectorAll("[data-tag]").length, historyRows: document.querySelectorAll(".tag-curator-workbench__history-row").length, fileRows: document.querySelectorAll(".tag-curator-workbench__file-row").length,
        listVisible: visible(list), detailVisible: visible(detail), listBounds: bounds(list), detailBounds: bounds(detail), focused: document.activeElement?.getAttribute("aria-label") };
    });
    checks.paneCorrect = checks.listVisible === (checks.width >= 900 || pane === "list") && checks.detailVisible === (checks.width >= 900 || pane === "detail");
    checks.passed = !checks.overlaps.length && !checks.clipped.length && !checks.overflowingText.length && !checks.undersizedFilters.length && !checks.rootHorizontalOverflow && checks.paneCorrect && checks.controls > 0 &&
      checks.scrollports.every(port => port.scrollWidth <= port.clientWidth + 1 && port.height > 0) && checks.tagRows <= 100 && checks.historyRows <= 50 && checks.fileRows <= 50;
    const filename = `workbench-${runId}-${name}.png`;
    await page.screenshot({ path: path.join(assets, filename), fullPage: false });
    report.cases.push({ name, screenshot: filename, ...checks });
    console.log(name, JSON.stringify({ passed: checks.passed, overlaps: checks.overlaps, clipped: checks.clipped, overflowingText: checks.overflowingText, paneCorrect: checks.paneCorrect }));
  };
  for (const width of [900, 360]) for (const dark of baseline ? [false] : [false, true]) {
    await page.setViewportSize({ width, height: 900 });
    const prefix = `${width}-${dark ? "dark" : "light"}`;
    await page.evaluate(options => window.workbenchFixture.mount(options), { dark });
    await capture(`${prefix}-tags`);
    await page.locator('[data-focus="tag-knowledge/研究方法"]').click();
    await capture(`${prefix}-long-path`, "detail");
    await page.locator('[data-focus="files-next"]').click();
    assert.equal(await page.locator(".tag-curator-workbench__file-row").count(), 3);
    await page.locator('[data-focus="detail-back"]').click();
    assert.equal(await page.locator('[data-focus="tag-knowledge/研究方法"]').evaluate(el => el === document.activeElement), true);
    await page.locator('[data-focus="tab-history"]').click();
    await capture(`${prefix}-history`);
    await page.locator('[data-focus="history-latest"]').click();
    await capture(`${prefix}-history-long-path`, "detail");
    await page.locator('[data-focus="history-search"]').fill("推荐笔记");
    await page.locator('[data-focus="history-origin-filter"]').selectOption("recommendation");
    await page.locator('[data-focus="history-status-filter"]').selectOption("applied");
    assert.equal(await page.locator(".tag-curator-workbench__history-row").count(), 1);
    await capture(`${prefix}-history-filtered`);
    await page.locator('[data-focus="history-older"]').click();
    assert.equal(await page.locator('[data-focus="undo"]').count(), 0);
    await capture(`${prefix}-history-readonly`, "detail");
    await page.locator('[data-focus="history-search"]').fill("absent-history-term");
    await capture(`${prefix}-history-empty`);
    await page.locator('[data-focus="history-clear-filters"]').click();
    assert.equal(await page.locator('[data-focus="history-search"]').evaluate(el => el === document.activeElement), true);
    await page.locator('[data-focus="history-legacy"]').click(); await capture(`${prefix}-history-legacy`, "detail");
    report.interactions.push(`${prefix}: file pagination, detail/back focus, history filter intersection, readonly undo gate, empty/clear focus passed`);
    if (baseline) continue;
    await page.evaluate(options => window.workbenchFixture.mount(options), { dark });
    await page.locator('[data-focus="settings"]').click();
    await page.getByRole("textbox", { name: "包含目录", exact: true }).fill("Project/知识管理与研究/跨领域知识整理工作记录");
    await page.getByRole("textbox", { name: "标签", exact: true }).fill("项目/很长的中英文保护标签名称-with-long-English-components");
    await capture(`${prefix}-policy`);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".modal-content"));
    assert.equal(await page.locator('[data-focus="settings"]').evaluate(el => el === document.activeElement), true);
    report.interactions.push(`${prefix}: synthetic scope/protection save and return focus passed (in-memory only)`);
    await page.evaluate(() => window.workbenchFixture.update({ invalidFolders: ["Project/知识管理与研究/已重命名的很长目录-with-English-components", "Project/Archive"] }));
    await capture(`${prefix}-invalid-folders`);
    await page.locator('[data-focus="settings"]').click(); await capture(`${prefix}-policy-invalid-folders`); await page.keyboard.press("Escape");
    await page.evaluate(options => window.workbenchFixture.mount(options), { dark });
    await page.evaluate(() => window.workbenchFixture.recovery());
    await page.locator('[data-focus="tab-history"]').click(); await page.locator('[data-focus="history-recovery"]').click();
    await capture(`${prefix}-recovery`, "detail");
    await page.locator('[data-focus="recover"]').click(); await page.getByRole("button", { name: "确认恢复", exact: true }).click();
    await capture(`${prefix}-recovery-conflict`, "detail");
    await page.keyboard.press("Escape");
    await page.evaluate(options => window.workbenchFixture.mount(options), { dark, language: "en" });
    await page.locator('[data-focus="settings"]').click(); await capture(`${prefix}-policy-en`); await page.keyboard.press("Escape");
    await page.evaluate(() => window.workbenchFixture.manual());
    await page.getByRole("textbox", { name: "Target tag", exact: true }).fill("knowledge/New/123");
    await page.getByRole("checkbox", { name: "Confirm these included folders and exclusions for this review" }).check();
    await capture(`${prefix}-manual-en`); await page.keyboard.press("Escape");
    await page.locator('[data-focus="tab-tags"]').focus(); await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator('[data-focus="tab-history"]').getAttribute("aria-selected"), "true");
    await capture(`${prefix}-history-keyboard-en`);
    await page.evaluate(() => window.workbenchFixture.update({ freshness: "error", error: "2 files could not be read. Previous results are read-only.", failedPaths: ["Project/a.md", "Project/b.md"] }));
    await page.locator('[data-focus="tab-tags"]').click(); await capture(`${prefix}-index-error-en`);
  }
  if (!baseline) for (const width of [900, 360]) for (const dark of [false, true]) for (const tagCount of [1000, 10000]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(options => window.workbenchFixture.mount(options), { dark, tagCount });
    const result = await page.evaluate(({ tagCount, width, dark }) => {
      const state = window.workbenchFixture.state();
      const rows = Object.values(state.index.tags);
      if (rows.length !== tagCount) throw new Error("Incorrect performance fixture size");
      const fileCount = new Set(rows.flatMap(row => row.files.map(file => file.path))).size;
      if (fileCount !== tagCount + 52) throw new Error("Incorrect performance fixture file count");
      const samplesMs = [], observedTagRows = [];
      document.querySelector('[data-focus="search"]').focus();
      for (let i = 0; i < 35; i++) {
        const input = document.querySelector('[data-focus="search"]');
        const started = performance.now();
        input.value = i % 2 ? "tag-0" : "TAG-0";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        const elapsed = performance.now() - started;
        // Assertions/counts are outside timing; rendering is synchronous in the production view.
        const visibleRows = document.querySelectorAll("[data-tag]").length;
        if (visibleRows !== 100 || document.querySelector('[data-focus="search"]').value !== input.value ||
            !document.querySelector(".tag-curator-workbench__result-count").textContent.startsWith(`${tagCount} / ${tagCount}`)) throw new Error("DOM did not synchronously update to the full matching first page");
        if (i >= 5) { samplesMs.push(elapsed); observedTagRows.push(visibleRows); }
      }
      const sorted = [...samplesMs].sort((a, b) => a - b), p95Ms = sorted[Math.ceil(samplesMs.length * 0.95) - 1];
      return { tagCount, distinctFiles: fileCount, associations: tagCount + 52, width, theme: dark ? "dark" : "light", warmups: 5, sampleCount: 30,
        query: "Alternating tag-0 / TAG-0; all tags match each time", samplesMs, minMs: sorted[0], p95Ms, maxMs: sorted.at(-1),
        observedTagRows, maxTagRows: Math.max(...observedTagRows), domElements: document.querySelector(".tag-curator-workbench").querySelectorAll("*").length,
        thresholdMs: tagCount === 1000 ? 150 : 300,
        measurement: "Browser performance.now around setting the existing search input value and dispatching its input event through production TagManagementView, including query, full synchronous DOM rebuild, icons and focus/caret restoration. Input lookup and assertions/counting excluded. Five warmups and thirty samples in one browser task; no animation frame/paint wait. Not physical typing latency, service refresh, provider, vault I/O, persistence or Obsidian host performance.",
        fixture: "In-memory index constructed before timing: tag-00000 through tag-(N-1), each with one unique file, first tag with 52 extra unique files (53 total). Every association has both frontmatter/inline sources; legacy count values deliberately ignored. Initial mount/cold query excluded. No debounce." };
    }, { tagCount, width, dark });
    const prefix = `${width}-${dark ? "dark" : "light"}-performance-${tagCount}`;
    await capture(`${prefix}-tags`);
    await page.locator('[data-focus="tag-tag-00000"]').click();
    result.relatedFileRows = await page.locator(".tag-curator-workbench__file-row").count();
    assert.equal(result.relatedFileRows, 50);
    await capture(`${prefix}-files`, "detail");
    await page.locator('[data-focus="files-next"]').click();
    result.relatedFileRowsSecondPage = await page.locator(".tag-curator-workbench__file-row").count();
    assert.equal(result.relatedFileRowsSecondPage, 3);
    result.passed = result.p95Ms < result.thresholdMs && result.maxTagRows <= 100 && result.relatedFileRows <= 50;
    report.performance.push(result);
    console.log("performance", JSON.stringify({ tagCount, width, dark, p95Ms: result.p95Ms, tagRows: result.maxTagRows, fileRows: result.relatedFileRows, passed: result.passed }));
  }
  report.passed = !report.pageErrors.length && !report.externalRequests.length && report.cases.every(c => c.passed) && report.performance.every(p => p.passed);
} catch (error) {
  report.failure = error.stack ?? String(error); console.error(report.failure);
} finally {
  report.finishedAt = new Date().toISOString();
  const reportPath = path.join(assets, `workbench-${runId}-layout-report.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ reportPath, cases: report.cases.length, passed: report.passed }));
  await browser.close();
}
if (!baseline && !report.passed) process.exitCode = 1;
