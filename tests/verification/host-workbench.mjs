import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// node tests/verification/host-workbench.mjs              -> read-only codec probe
// node tests/verification/host-workbench.mjs --buildready -> install then accept
// node tests/verification/host-workbench.mjs --installed  -> accept installed build
// --buildready --final-smoke writes only host-final-* evidence and a separate report.
// --undo-outstanding-fixture closes only the latest applied fixture transaction.
// --installed --recovery-prepare persists a controlled failed-write recovery record.
// Quit/restart the isolated app, then --installed --recovery-resume verifies recovery.
// OBSIDIAN_TEST_{VAULT,PORT,VERSION,ASSETS} isolate release runs and their evidence.
// Never point this runner at a personal vault. All host evaluations check this literal.
const VAULT = resolve(process.env.OBSIDIAN_TEST_VAULT ?? '/tmp/tag-curator-workbench-Y7AbTM/vault');
if (process.env.OBSIDIAN_TEST_VAULT) {
  assert(/^\/(?:private\/)?tmp\/tag-curator-release-/.test(await realpath(VAULT)), 'Only isolated release fixtures are allowed');
  assert.equal((await readFile(resolve(VAULT, '../.release-fixture'), 'utf8')).trim(), 'tag-curator-0.5.0');
}
const port = Number(process.env.OBSIDIAN_TEST_PORT ?? 19227);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535);
const targetsUrl = `http://127.0.0.1:${port}/json/list`;
const expectedHost = process.env.OBSIDIAN_TEST_VERSION;
const PLUGIN = 'ai-tag-curator-dev';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ASSETS = resolve(ROOT, process.env.OBSIDIAN_TEST_ASSETS ?? 'docs/verification/assets');
assert(ASSETS === `${ROOT}/docs/verification/assets` || ASSETS.startsWith(`${ROOT}/docs/verification/assets/`), 'Evidence must stay in the verification directory');
const FIXTURE = 'Host Workbench Acceptance';
const install = process.argv.includes('--buildready');
const finalSmoke = process.argv.includes('--final-smoke');
const recoveryPhase = process.argv.includes('--recovery-prepare') ? 'prepare' : process.argv.includes('--recovery-resume') ? 'resume' : null;
const run = install || process.argv.includes('--installed');
const probeOnly = !run;
const guard = `if(app.vault.adapter.basePath!==${JSON.stringify(VAULT)})throw new Error('SYNTHETIC VAULT GUARD FAILED');`;
const report = { startedAt: new Date().toISOString(), mode: install ? 'buildready' : run ? 'installed' : 'probe', vault: VAULT, checks: [], screenshots: [], network: [], unverified: ['Minimum supported Obsidian 1.8.7', 'Real mobile device', 'Full application restart (only dev-plugin reload exercised)', 'Recovery after partial I/O failure and compensation'] };
let cdp;

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.addEventListener('message', e => {
      const msg = JSON.parse(e.data);
      if (msg.id) {
        const p = this.pending.get(msg.id); if (!p) return;
        clearTimeout(p.timer); this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result);
      } else this.listeners.forEach(listener => listener(msg));
    });
  }
  static async connect(target) {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    return new CDP(ws);
  }
  call(method, params = {}, timeout = 25000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer }); this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(code) {
    const r = await this.call('Runtime.evaluate', { expression: `(async()=>{${guard}\n${code}\n})()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  close() { this.ws.close(); }
}

async function waitFor(code, label, timeout = 15000, client = cdp) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) {
    last = await client.eval(`return (${code});`);
    if (last) return last;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timed out: ${label}; last=${JSON.stringify(last)}`);
}

async function screenshot(name, client = cdp) {
  await client.eval(`const win=window.electronWindow??require('@electron/remote').getCurrentWindow();if(win.isMinimized?.())win.restore();win.show();win.focus();`);
  await client.call('Page.bringToFront');
  let data;
  for (let attempt=0;attempt<2;attempt++) {
    await new Promise(r=>setTimeout(r,150));
    try { ({data}=await client.call('Page.captureScreenshot', { format:'png',fromSurface:false,captureBeyondViewport:false },3000)); break; }
    catch(error) {
      if(attempt===1){
        (report.screenshotLimitations??=[]).push({name,error:error.message});
        console.warn(`SCREENSHOT UNAVAILABLE ${name}: ${error.message}`);
        return;
      }
    }
  }
  await mkdir(ASSETS, { recursive: true });
  const path = resolve(ASSETS, `host-${recoveryPhase ? `recovery-${recoveryPhase}-` : finalSmoke ? 'final-' : ''}${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  const relative=path.slice(ROOT.length+1);
  if(!report.screenshots.includes(relative))report.screenshots.push(relative);
}

async function check(name, fn) {
  const started = Date.now();
  try { const details = await fn(); report.checks.push({ name, status: 'passed', durationMs: Date.now() - started, details }); console.log(`PASS ${name}`); return details; }
  catch (error) { report.checks.push({ name, status: 'failed', durationMs: Date.now() - started, error: String(error.stack ?? error) }); console.error(`FAIL ${name}: ${error.message}`); await screenshot(`failure-${report.checks.length}`).catch(() => {}); throw error; }
}

// The renderer's global require cannot import obsidian. Inspect the already-loaded
// plugin's lexical module objects, without recompiling or replacing production code.
async function obsidianModule() {
  const f = await cdp.call('Runtime.evaluate', { expression: `(()=>{${guard}return app.plugins.plugins[${JSON.stringify(PLUGIN)}].onload;})()` });
  const props = await cdp.call('Runtime.getProperties', { objectId: f.result.objectId });
  const scopes = await cdp.call('Runtime.getProperties', { objectId: props.internalProperties.find(x => x.name === '[[Scopes]]').value.objectId });
  for (const scope of scopes.result.slice(0, 2)) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.call('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result.filter(v => v.value?.type === 'object' && v.value.objectId)) {
      const p = await cdp.call('Runtime.getProperties', { objectId: v.value.objectId, ownProperties: true });
      if (p.result.some(p => p.name === 'parseYaml') && p.result.some(p => p.name === 'stringifyYaml')) return v.value.objectId;
    }
  }
  throw new Error('Cannot find real host Obsidian module in plugin scopes');
}

async function useModule(objectId, code) {
  const r = await cdp.call('Runtime.callFunctionOn', { objectId, functionDeclaration: `function(){${guard}\n${code}}`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

const p = `app.plugins.plugins[${JSON.stringify(PLUGIN)}]`;
const state = `${p}.managementAdapter().getState()`;
const scope = { include: [{ path: FIXTURE, recursive: true }] };

async function click(label, root = 'document', client = cdp) {
  await client.eval(`const root=${root};const el=Array.from(root.querySelectorAll('button,[role="tab"]')).find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)});if(!el)throw new Error('Button missing: '+${JSON.stringify(label)});if(el.disabled)throw new Error('Button disabled: '+${JSON.stringify(label)});el.click();`);
}
async function focusClick(key, client = cdp) {
  await client.eval(`const el=Array.from(document.querySelectorAll('[data-focus]')).find(e=>e.dataset.focus===${JSON.stringify(key)});if(!el||el.disabled)throw new Error('Focus target missing/disabled: '+${JSON.stringify(key)});el.focus();el.click();`);
}
async function input(label, value, client = cdp) {
  await client.eval(`const e=Array.from(document.querySelectorAll('input,textarea')).find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)});if(!e)throw new Error('Input missing');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));`);
}
async function dismiss(client = cdp) {
  for (let i = 0; i < 30; i++) {
    if (!await client.eval('return !!document.querySelector(".modal-container");')) return;
    await client.eval(`const modal=Array.from(document.querySelectorAll('.modal')).at(-1);const close=modal?.querySelector('.modal-close-button,.modal-header-button');if(!close)throw new Error('Host modal close control missing');close.click();`);
    await new Promise(r => setTimeout(r, 80));
  }
  throw new Error('Host modals did not close');
}
async function refresh() {
  await focusClick('refresh');
  await waitFor(`${state}.freshness==='ready'&&!${state}.busy`, 'index ready');
  // Real metadata cache changes can arrive after the write event; require a settled index.
  await new Promise(r => setTimeout(r, 700));
  if (await cdp.eval(`return ${state}.freshness!=='ready';`)) {
    await focusClick('refresh'); await waitFor(`${state}.freshness==='ready'`, 'settled index ready');
  }
}
async function open() {
  await cdp.eval(`if(!app.commands.executeCommandById('${PLUGIN}:open-tag-manager'))throw new Error('Command unavailable');`);
  await waitFor(`document.querySelector('.tag-curator-workbench')`, 'workbench DOM');
}
async function reload() {
  await dismiss();
  await cdp.eval(`await app.plugins.disablePlugin('${PLUGIN}');${guard}await app.plugins.enablePlugin('${PLUGIN}');`);
  await waitFor(`${p}&&typeof ${p}.managementAdapter==='function'`, 'plugin reload');
  await open();
}

async function readNotes() {
  return cdp.eval(`const out={};for(const f of app.vault.getMarkdownFiles()){out[f.path]=await app.vault.read(f);}return out;`);
}
async function assertRestored(before, changedPaths) {
  const after = await readNotes(); const reformatted = [];
  for (const [path, text] of Object.entries(before)) {
    if (!changedPaths.includes(path)) { assert.equal(after[path], text); continue; }
    const pair = await cdp.eval(`const o=window.__hostObsidian;return ${JSON.stringify([text, after[path]])}.map(text=>{const info=o.getFrontMatterInfo(text);return {properties:o.parseYaml(info.frontmatter),body:text.slice(info.contentStart)};});`);
    assert.deepEqual(pair[1], pair[0]);
    if (after[path] !== text) reformatted.push(path);
  }
  return { rawTagValuesAndNonTagSemanticsRestored: true, bodyRestoredByteForByte: true, yamlReformatted: reformatted };
}
async function writeFixture(path, content) {
  assert(path.startsWith(`${FIXTURE}/`));
  await cdp.eval(`const path=${JSON.stringify(path)};const f=app.vault.getAbstractFileByPath(path);${guard}if(f)await app.vault.modify(f,${JSON.stringify(content)});else await app.vault.create(path,${JSON.stringify(content)});`);
}
async function prepare(sources, target, kind = 'rename') {
  await dismiss(); await focusClick('tab-tags'); await refresh();
  if (kind === 'rename') { await focusClick(`tag-${sources[0]}`); await click('Rename'); }
  else {
    for (const tag of sources) await focusClick(`select-${tag}`);
    await click('Merge into');
  }
  await input('Target tag', target);
  await cdp.eval(`const e=document.querySelector('input[aria-label="Confirm these included folders and exclusions for this review"]');if(!e)throw new Error('Consent missing');e.click();`);
  await click('Prepare review');
  await waitFor(`document.querySelector('.tag-curator-cleanup-review-modal')`, 'review modal');
}
async function applyReview() {
  await click('Continue to apply', `document.querySelector('.tag-curator-cleanup-review-modal')`);
  await screenshot('manual-confirmation');
  await click('Confirm write', `document.querySelector('.tag-curator-cleanup-review-modal')`);
  await waitFor(`${state}.history.some(h=>h.origin==='manual'&&h.status==='applied')&&!${state}.busy`, 'manual applied');
  const result = await cdp.eval(`return ${state}.history.find(h=>h.origin==='manual'&&h.status==='applied');`);
  await dismiss(); return result;
}
async function undo(id) {
  await dismiss(); await focusClick('tab-history'); await focusClick(`history-${id}`);
  await screenshot('history-before-undo'); await click('Undo'); await click('Confirm undo');
  await waitFor(`${state}.history.some(h=>h.id===${JSON.stringify(id)}&&h.status==='undone')&&!${state}.busy`, 'undo receipt');
  await dismiss();
}

async function installBuild() {
  await cdp.eval('return true;');
  const dir = resolve(VAULT, '.obsidian/plugins', PLUGIN);
  assert((await realpath(dir)).startsWith(`${await realpath(VAULT)}/`));
  const manifestPath = resolve(dir, 'manifest.json');
  const original = await readFile(manifestPath, 'utf8');
  assert.equal(JSON.parse(original).id, PLUGIN);
  report.build = {};
  for (const file of ['main.js', 'styles.css']) {
    await cdp.eval('return true;');
    await copyFile(resolve(ROOT, file), resolve(dir, file));
    const source = await readFile(resolve(ROOT, file));
    const installed = await readFile(resolve(dir, file));
    assert.deepEqual(installed, source); report.build[file] = createHash('sha256').update(installed).digest('hex');
  }
  // Preserve the development manifest byte-for-byte, as requested by the build owner.
  assert.equal(await readFile(manifestPath, 'utf8'), original);
  report.build.manifest = JSON.parse(original);
  await reload();
}

async function networkObserver(moduleId) {
  await cdp.call('Network.enable');
  cdp.listeners.push(msg => {
    if (msg.method !== 'Network.requestWillBeSent' || !/^https?:/.test(msg.params.request.url)) return;
    const plugin = JSON.stringify(msg.params.initiator).includes(`plugin:${PLUGIN}`);
    report.network.push({ source: 'renderer-network', url: msg.params.request.url, pluginAttributed: plugin, initiator: msg.params.initiator });
  });
  await cdp.call('Debugger.enable');
  await cdp.eval('window.__hostRequestUrlCalls=[];');
  const fn = await cdp.call('Runtime.callFunctionOn', { objectId: moduleId, functionDeclaration: `function(){${guard}return this.requestUrl;}` });
  const bp = await cdp.call('Debugger.setBreakpointOnFunctionCall', {
    objectId: fn.result.objectId,
    condition: `(app.vault.adapter.basePath===${JSON.stringify(VAULT)} && window.__hostRequestUrlCalls.push({stack:new Error().stack,time:Date.now()}),false)`,
  });
  report.networkProbe = { requestUrlBreakpoint: bp.breakpointId, filtering: 'Only plugin sourceURL call stacks counted; updater/unattributed renderer requests listed separately, not failures.' };
}

async function auditHostIO() {
  await cdp.eval(`
    window.__hostIO={writes:[],reads:[],restore:[]};
    const audit=window.__hostIO;
    for(const [owner,name,write] of [[app.vault,'process',true],[app.vault,'modify',true],[app.vault,'create',true],[app.vault.adapter,'write',true],[app.vault,'read',false],[app.vault,'cachedRead',false]]){
      const original=owner[name];
      owner[name]=function(...args){
        ${guard}
        const path=typeof args[0]==='string'?args[0]:args[0]?.path;
        const stack=new Error().stack;
        if(write&&path?.endsWith('.md')&&!path.startsWith(${JSON.stringify(`${FIXTURE}/`)}))throw new Error('FIXTURE WRITE GUARD FAILED: '+path);
        (write?audit.writes:audit.reads).push({name,path,plugin:stack.includes('plugin:${PLUGIN}'),time:Date.now()});
        return original.apply(this,args);
      };
      audit.restore.push(()=>{owner[name]=original;});
    }
  `);
}
async function writeCount() { return cdp.eval(`return window.__hostIO.writes.filter(x=>x.path?.endsWith('.md')).length;`); }

async function finalSmokeChecks(moduleId) {
  report.mode='final-smoke';
  report.unverified.push('P1 batch-undo post-write rejection and P2 failed-log rollback: no fault injection in this smoke; full regression owned by main agent');
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const fullReportPath=resolve(ASSETS,'host-workbench-report.json');
  const fullBytes=await readFile(fullReportPath);
  const preserved=new Map([[fullReportPath,sha(fullBytes)]]);
  for(const path of JSON.parse(fullBytes).screenshots)preserved.set(resolve(ROOT,path),sha(await readFile(resolve(ROOT,path))));
  await useModule(moduleId,'window.__hostObsidian=this;return true;');
  await auditHostIO();
  const before=await readNotes();
  const fixturePath=`${FIXTURE}/final-smoke.md`;
  await check('final-fixture-and-ready-view',async()=>{
    assert.equal(await cdp.eval(`return ${p}.operationLog.toJSON().length;`),0,'Do not overwrite evidence of any outstanding transaction');
    await writeFixture(fixturePath,'---\ntags: [HostSmokeOld, KeepCase, KeepCase]\nother: unchanged\n---\nSmoke #HostSmokeOld.\n');
    await new Promise(r=>setTimeout(r,800));
    await open();await refresh();
    const result=await cdp.eval(`return {version:window.__hostObsidian.apiVersion,noKey:!${p}.settings.apiKey,state:${state}.freshness,leaves:app.workspace.getLeavesOfType('tag-curator-management').length};`);
    assert.equal(result.version,'1.13.7');assert.equal(result.noKey,true);assert.equal(result.state,'ready');assert.equal(result.leaves,1);
    await screenshot('reload-ready');return result;
  });
  const baseline=await readNotes();
  await check('throwing-listeners-isolated-during-notification',async()=>{
    const result=await cdp.eval(`
      window.__hostSmokeCounts={management:0,index:0};
      window.__hostSmokeUnsub=[
        ${p}.managementAdapter().subscribe(()=>{throw new Error('Synthetic listener failure');}),
        ${p}.managementAdapter().subscribe(()=>window.__hostSmokeCounts.management++),
        ${p}.indexService.subscribe(()=>{throw new Error('Synthetic index listener failure');}),
        ${p}.indexService.subscribe(()=>window.__hostSmokeCounts.index++)
      ];
      ${p}.notifyManagement();${p}.indexService.markStale();return window.__hostSmokeCounts;
    `);
    assert(result.management>0);assert(result.index>0);return result;
  });
  let operationId;
  await check('manual-write-with-throwing-listeners',async()=>{
    await prepare(['hostsmokeold'],'HostSmokeNew');
    operationId=(await applyReview()).id;
    const content=(await readNotes())[fixturePath];
    assert(content.includes('Smoke #HostSmokeNew.'));assert(!content.includes('HostSmokeOld'));
    const counters=await cdp.eval('return window.__hostSmokeCounts;');
    assert(counters.management>1);assert(counters.index>1);
    await cdp.eval('window.__hostSmokeUnsub.forEach(fn=>fn());delete window.__hostSmokeUnsub;');
    await screenshot('write-listener-safe');return {operationId,counters};
  });
  await check('reload-releases-listeners-and-undo-persists',async()=>{
    await cdp.eval(`window.__hostSmokeOld=${p};`);
    await reload();await open();
    const counts=await cdp.eval(`return {oldManagement:window.__hostSmokeOld.managementListeners.size,oldIndex:window.__hostSmokeOld.indexService.listeners.size,newManagement:${p}.managementListeners.size,newIndex:${p}.indexService.listeners.size,leaves:app.workspace.getLeavesOfType('tag-curator-management').length};`);
    assert.equal(counts.oldManagement,0);assert.equal(counts.oldIndex,0);assert.equal(counts.newManagement,1);assert.equal(counts.newIndex,1);assert.equal(counts.leaves,1);
    await undo(operationId);
    const restored=await assertRestored(baseline,[fixturePath]);
    await reload();
    const status=await cdp.eval(`return ${state}.history.find(h=>h.id===${JSON.stringify(operationId)})?.status;`);
    assert.equal(status,'undone');await screenshot('undo-persisted');
    await cdp.eval('delete window.__hostSmokeOld;delete window.__hostSmokeCounts;');
    return {counts,restored,status};
  });
  await check('popout-modal-and-listener-disposal',async()=>{
    const count=()=>cdp.eval(`return ${p}.managementListeners.size;`);
    const initial=await count();assert.equal(initial,1);
    const targets=new Set((await(await fetch(targetsUrl)).json()).map(t=>t.id));
    await cdp.eval(`window.__hostPopoutLeaf=app.workspace.openPopoutLeaf();await window.__hostPopoutLeaf.setViewState({type:'tag-curator-management',active:true});await app.workspace.revealLeaf(window.__hostPopoutLeaf);`);
    let target;
    for(let i=0;i<50;i++){target=(await(await fetch(targetsUrl)).json()).find(t=>!targets.has(t.id)&&t.type==='page');if(target)break;await new Promise(r=>setTimeout(r,100));}
    assert(target,'Popout target missing');const popout=await CDP.connect(target);
    let opened,modal,closedModal;
    try{
      await waitFor(`document.querySelector('.tag-curator-workbench')`,'popout ready',5000,popout);
      opened=await count();assert.equal(opened,initial+1);
      await focusClick('settings',popout);
      await waitFor(`document.querySelector('.tag-curator-workbench-modal')`,'popout modal ownerDocument',5000,popout);
      modal=await count();assert.equal(modal,opened+1);await screenshot('popout-policy',popout);
      await click('Cancel','document',popout);closedModal=await count();assert.equal(closedModal,opened);
      await focusClick('tab-history',popout);await screenshot('popout-history',popout);
    }finally{
      await cdp.eval(`if(window.__hostPopoutLeaf){${guard}window.__hostPopoutLeaf.detach();delete window.__hostPopoutLeaf;}`);popout.close();
    }
    const closed=await count();assert.equal(closed,initial);return {initial,opened,modal,closedModal,closed};
  });
  await check('final-safety-and-complete-evidence-preserved',async()=>{
    const after=await readNotes();for(const [path,text] of Object.entries(before))if(path!==fixturePath)assert.equal(after[path],text);
    const operations=await cdp.eval(`return ${p}.operationLog.toJSON().length;`);assert.equal(operations,0);
    for(const [path,hash] of preserved)assert.equal(sha(await readFile(path)),hash,`Existing evidence changed: ${path}`);
    const installed=sha(await readFile(resolve(VAULT,'.obsidian/plugins',PLUGIN,'main.js')));
    const current=sha(await readFile(resolve(ROOT,'main.js')));
    assert.equal(installed,report.build['main.js']);assert.equal(installed,current,'Main build changed during smoke; report tested SHA separately');
    report.finalBuildSha256=installed;
    return {unchangedExistingNotes:Object.keys(before).filter(path=>path!==fixturePath).length,outstandingOperations:operations,preservedEvidenceFiles:preserved.size,installedMatchesCurrentBuild:true};
  });
}

async function recoveryChecks(moduleId) {
  assert(run && !install, 'Recovery phases require --installed; do not replace a running recovery build');
  await useModule(moduleId, 'window.__hostObsidian=this;return true;');
  const proofPath = resolve(ASSETS, 'restart-proof.json');
  const pid = await cdp.eval("return require('@electron/remote').process.pid;");
  if (recoveryPhase === 'prepare') {
    await check('host-post-write-rejection-and-failed-compensation', async () => {
      assert.equal(await cdp.eval(`return ${p}.operationLog.toJSON().length;`), 0);
      const paths = ['restart-a.md', 'restart-b.md'].map(name => `${FIXTURE}/${name}`);
      for (const path of paths) await writeFixture(path, '---\ntags: [RestartOld, KeepCase, KeepCase]\nother: unchanged\n---\nBody #RestartOld and #KeepCase.\n');
      await new Promise(r => setTimeout(r, 800));
      const notes = await readNotes();
      await prepare(['restartold'], 'RestartNew');
      await cdp.eval(`const original=app.vault.process;window.__releaseFault={calls:0,postWrite:0,compensationFailures:0};window.__releaseRestore=()=>{app.vault.process=original;};app.vault.process=async function(file,...args){${guard}if(!${JSON.stringify(paths)}.includes(file.path))return original.call(this,file,...args);const fault=window.__releaseFault;fault.calls++;if(fault.postWrite){fault.compensationFailures++;throw new Error('Release fixture: compensation denied');}const result=await original.call(this,file,...args);fault.postWrite++;throw new Error('Release fixture: rejected after real Vault.process write');};`);
      await click('Continue to apply', `document.querySelector('.tag-curator-cleanup-review-modal')`);
      await click('Confirm write', `document.querySelector('.tag-curator-cleanup-review-modal')`);
      await waitFor(`${p}.operationLog.latestUnresolvedCleanup()?.status==='recoveryRequired'&&!${state}.busy`, 'persisted recovery gate');
      await cdp.eval('window.__releaseRestore();delete window.__releaseRestore;');
      const record = await cdp.eval(`return ${p}.operationLog.latestUnresolvedCleanup();`);
      const fault = await cdp.eval('return window.__releaseFault;');
      assert.equal(record.recoveryTarget, 'before'); assert.equal(fault.postWrite, 1); assert(fault.compensationFailures > 0);
      const disk = JSON.parse(await readFile(resolve(VAULT, '.obsidian/plugins', PLUGIN, 'data.json'), 'utf8'));
      assert.equal(disk.operations[0].id, record.id); assert.equal(disk.operations[0].status, 'recoveryRequired');
      await mkdir(ASSETS, { recursive: true });
      await writeFile(proofPath, JSON.stringify({ pid, recordId: record.id, paths, notes, build: report.build, host: report.yaml.apiVersion }, null, 2));
      await screenshot('required');
      return { pid, recordId: record.id, target: record.recoveryTarget, fault, persisted: true };
    });
  } else {
    await check('full-application-restart-and-fixed-target-recovery', async () => {
      const proof = JSON.parse(await readFile(proofPath, 'utf8'));
      assert.notEqual(pid, proof.pid, 'Requires a full host process restart, not a plugin reload');
      assert.deepEqual(report.build, proof.build, 'Restart must use the same plugin assets');
      assert.equal(report.yaml.apiVersion, proof.host);
      const record = await cdp.eval(`return ${p}.operationLog.latestUnresolvedCleanup();`);
      assert.equal(record.id, proof.recordId); assert.equal(record.recoveryTarget, 'before');
      assert.equal(await cdp.eval(`return ${state}.recoveryRequired;`), true);
      await screenshot('before');
      await cdp.eval(`await ${p}.managementAdapter().commands.recover(${JSON.stringify(record.id)});`);
      await waitFor(`!${state}.busy&&!${state}.recoveryRequired`, 'recovery complete');
      const restored = await assertRestored(proof.notes, proof.paths);
      const receipt = await cdp.eval(`return ${p}.operationLog.receiptsToJSON().find(row=>row.operationId===${JSON.stringify(record.id)});`);
      assert.equal(receipt.status, 'rolledBack');
      const disk = JSON.parse(await readFile(resolve(VAULT, '.obsidian/plugins', PLUGIN, 'data.json'), 'utf8'));
      assert.equal(disk.operations.length, 0); assert(disk.receipts.some(row => row.operationId === record.id && row.status === 'rolledBack'));
      await dismiss(); await focusClick('tab-history'); await screenshot('complete');
      report.unverified = report.unverified.filter(item => !item.startsWith('Full application restart') && !item.startsWith('Recovery after partial'));
      return { previousPid: proof.pid, pid, originalRecordId: record.id, restored, persistedReceipt: receipt.status, outstandingOperations: 0 };
    });
  }
}

async function main() {
  const targets = await (await fetch(targetsUrl)).json();
  const target = targets.find(t => t.url === 'app://obsidian.md/index.html');
  assert(target, 'Obsidian page missing'); cdp = await CDP.connect(target);
  await cdp.call('Runtime.enable'); await cdp.call('Page.enable');
  await check('host-path-and-version', async () => {
    const result = await cdp.eval(`return {basePath:app.vault.adapter.basePath,title:document.title,activeFile:app.workspace.getActiveFile()?.path??null,activeEditor:!!app.workspace.activeEditor,pluginIds:Object.keys(app.plugins.plugins),popout:typeof app.workspace.openPopoutLeaf};`);
    assert.equal(result.basePath, VAULT); report.host = result; return result;
  });
  if (install) await check('install-latest-build-preserve-dev-manifest', installBuild);
  if (run && !install) {
    const dir=resolve(VAULT,'.obsidian/plugins',PLUGIN); report.build={};
    for(const file of ['main.js','styles.css']) report.build[file]=createHash('sha256').update(await readFile(resolve(dir,file))).digest('hex');
    await dismiss(); await open();
  }
  const moduleId = await obsidianModule();
  if(finalSmoke){assert(run,'--final-smoke requires --buildready or --installed');await finalSmokeChecks(moduleId);return;}
  await check('real-host-yaml-codec-probes', async () => {
    const values = await useModule(moduleId, `const samples={array:'tags: [Old, KeepCase, KeepCase]\\n',multiline:'description: |\\n  line one\\n  line two\\ntags: [Old]\\n',nested:'nested: {enabled: true, count: 2}\\ntags: [Old]\\n',anchor:'defaults: &defaults {enabled: true}\\ncopy: *defaults\\ntags: [Old]\\n',nonTags:'date: 2026-09-14\\nnullValue: null\\ntruth: true\\ntags: [Old]\\n'};return {apiVersion:this.apiVersion,functions:Object.fromEntries(['parseYaml','stringifyYaml','getFrontMatterInfo','MarkdownView','ItemView'].map(k=>[k,typeof this[k]])),samples:Object.fromEntries(Object.entries(samples).map(([key,yaml])=>{try{const before=this.parseYaml(yaml),encoded=this.stringifyYaml(before),after=this.parseYaml(encoded);return [key,{before,encoded,after,equal:JSON.stringify(before)===JSON.stringify(after)}]}catch(e){return [key,{error:e.message}]}}))};`);
    assert.equal(values.functions.parseYaml, 'function'); assert.equal(values.functions.stringifyYaml, 'function');
    if (expectedHost) assert.equal(values.apiVersion, expectedHost, 'Unexpected Obsidian host version');
    for (const v of Object.values(values.samples)) assert.equal(v.equal, true);
    report.yaml = values; return values;
  });
  await screenshot('probe');
  if (probeOnly) { report.unverified.push('Full write acceptance: requires --buildready'); return; }
  if (recoveryPhase) { await recoveryChecks(moduleId); return; }
  await useModule(moduleId, 'window.__hostObsidian=this;return true;');
  if(process.argv.includes('--undo-outstanding-fixture')) {
    await check('finish-outstanding-fixture-with-normal-undo',async()=>{
      const latest=await cdp.eval(`return ${p}.operationLog.toJSON()[0];`);
      assert.equal(latest?.status,'applied');
      assert(latest.files?.length&&latest.files.every(f=>f.notePath.startsWith(`${FIXTURE}/`)));
      await undo(latest.id);
      return {id:latest.id,status:'undone'};
    });
  }
  await networkObserver(moduleId);
  await auditHostIO();
  const originalNotes = await readNotes();
  await check('prepare-synthetic-fixtures-and-guards', async () => {
    const outstanding=await cdp.eval(`return ${p}.operationLog.toJSON().filter(record=>JSON.stringify(record).includes(${JSON.stringify(`${FIXTURE}/`)})).map(record=>({id:record.id,status:record.status}));`);
    assert.deepEqual(outstanding, [], 'Undo/recover outstanding fixture operations before rerunning; never reset their recovery evidence');
    await cdp.eval(`for(const path of [${JSON.stringify(FIXTURE)},${JSON.stringify(`${FIXTURE}/Excluded`)}]){${guard}if(!app.vault.getAbstractFileByPath(path))await app.vault.createFolder(path);}`);
    const fixtures = {
      'mixed.md': '---\ntags: [HostOld, KeepCase, KeepCase]\nnested: {enabled: true, count: 2}\ndescription: |\n  line one\n  line two\n---\n\nBody #HostOld and #KeepCase. Repeat #HostOld.\n`#HostOld` must remain.\n',
      'merge.md': '---\ntags: [HostA, HOSTTarget, KeepCase, KeepCase, HostB]\nother: untouched\n---\n\nMerge #HostA and #HostB, existing #HOSTTarget.\n',
      'protected.md': '---\ntags: [HostProtected, HostProtected/Child]\n---\n#HostProtected and #HostProtected/Child\n',
      'active.md': '---\ntags: [HostActive, KeepCase, KeepCase]\n---\nEditor body #HostActive.\n',
      'Excluded/private.md': '---\ntags: [HostOld, HostSecret]\n---\nExcluded #HostOld.\n',
    };
    for (const [path, content] of Object.entries(fixtures)) await writeFixture(`${FIXTURE}/${path}`, content);
    await cdp.eval(`${p}.settings.uiLanguage='en';${p}.settings.apiKey='';${p}.settings.refreshIndexOnLoad=false;${p}.settings.readInlineTags=true;await ${p}.savePluginData();`);
    await reload();
    await cdp.eval(`await ${p}.managementAdapter().commands.saveScopeAndPolicy(${JSON.stringify(scope)},{...${state}.policy,excludedFolders:[${JSON.stringify(`${FIXTURE}/Excluded`)}],protectedTags:[{tag:'HostProtected',mode:'subtree'}]});`);
    await new Promise(r => setTimeout(r, 1000)); return { fixtureRoot: FIXTURE, files: Object.keys(fixtures) };
  });
  await check('no-key-no-active-open-and-reuse', async () => {
    await cdp.eval(`for(const leaf of app.workspace.getLeavesOfType('markdown')){${guard}leaf.detach();}`);
    await open(); await open();
    const result = await cdp.eval(`return {noKey:!${p}.settings.apiKey,activeFile:app.workspace.getActiveFile()?.path??null,leaves:app.workspace.getLeavesOfType('tag-curator-management').length};`);
    assert.equal(result.noKey, true); assert.equal(result.activeFile, null); assert.equal(result.leaves, 1);
    await screenshot('no-key-no-active'); return result;
  });
  await check('refresh-and-policy-exclusions', async () => {
    const start = await cdp.eval('return window.__hostIO.reads.length;');
    await refresh();
    const result = await cdp.eval(`return {state:${state}.freshness,tags:Object.keys(${state}.index.tags),scope:${state}.scope,policy:${state}.policy};`);
    const excludedReads = await cdp.eval(`return window.__hostIO.reads.slice(${start}).filter(x=>x.plugin&&x.path?.startsWith(${JSON.stringify(`${FIXTURE}/Excluded/`)}));`);
    assert.deepEqual(excludedReads, []);
    assert(!result.tags.includes('hostsecret')); assert(result.tags.includes('hostold')); await screenshot('refreshed'); return { ...result, excludedReads };
  });
  await check('scope-only-policy-revision-stable', async () => {
    const before=await cdp.eval(`return {revision:${state}.policy.revision,indexRevision:${state}.indexRevision,freshness:${state}.freshness};`);
    await focusClick('settings');
    await cdp.eval(`const e=document.querySelector('.tag-curator-workbench__scope input[type="checkbox"]');if(!e)throw new Error('Recursive scope control missing');e.click();`);
    await click('Save');
    await waitFor(`!document.querySelector('.tag-curator-workbench-modal')`, 'scope modal saved');
    const after=await cdp.eval(`return {revision:${state}.policy.revision,indexRevision:${state}.indexRevision,freshness:${state}.freshness,scope:${state}.scope};`);
    assert.equal(after.revision,before.revision); assert.equal(after.scope.include[0].recursive,false);
    await focusClick('settings');
    await cdp.eval(`document.querySelector('.tag-curator-workbench__scope input[type="checkbox"]').click();`);
    await click('Save');
    await waitFor(`!document.querySelector('.tag-curator-workbench-modal')`, 'scope restored');
    return {before,after};
  });
  let baseline = await readNotes();
  let renameId;
  await check('manual-rename-mixed-raw-values-and-body', async () => {
    await prepare(['hostold'], 'HostNew/Name'); await screenshot('rename-review');
    assert.deepEqual(await readNotes(), baseline);
    renameId = (await applyReview()).id;
    const notes = await readNotes();
    const parsed = await cdp.eval(`const o=window.__hostObsidian;const text=await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(`${FIXTURE}/mixed.md`)}));const info=o.getFrontMatterInfo(text);return {properties:o.parseYaml(info.frontmatter),body:text.slice(info.contentStart)};`);
    assert.deepEqual(parsed.properties.tags, ['HostNew/Name', 'KeepCase', 'KeepCase']);
    assert.deepEqual(parsed.properties.nested, { enabled: true, count: 2 });
    assert.equal(parsed.properties.description, 'line one\nline two\n');
    assert.equal(parsed.body, '\nBody #HostNew/Name and #KeepCase. Repeat #HostNew/Name.\n`#HostOld` must remain.\n');
    for (const [path, text] of Object.entries(baseline)) if (path !== `${FIXTURE}/mixed.md`) assert.equal(notes[path], text);
    await screenshot('rename-applied'); return { renameId, ...parsed };
  });
  await check('history-and-undo-after-plugin-reload', async () => {
    await reload(); await focusClick('tab-history'); await screenshot('history-after-reload');
    await undo(renameId);
    const restored = await assertRestored(baseline, [`${FIXTURE}/mixed.md`]);
    baseline = await readNotes();
    await reload();
    const receipt = await cdp.eval(`return ${state}.history.find(h=>h.id===${JSON.stringify(renameId)});`);
    assert.equal(receipt.status, 'undone'); await screenshot('undo-persisted'); return { receipt, restored };
  });
  await check('manual-merge-existing-target-and-undo', async () => {
    await prepare(['hosta', 'hostb'], 'HostTarget', 'merge'); await screenshot('merge-review');
    const id = (await applyReview()).id;
    const parsed = await cdp.eval(`const o=window.__hostObsidian;const text=await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(`${FIXTURE}/merge.md`)}));const info=o.getFrontMatterInfo(text);return {tags:o.parseYaml(info.frontmatter).tags,body:text.slice(info.contentStart)};`);
    assert.deepEqual(parsed.tags, ['HOSTTarget', 'KeepCase', 'KeepCase']);
    assert.equal(parsed.body, '\nMerge #HostTarget and #HostTarget, existing #HOSTTarget.\n');
    await undo(id); const restored = await assertRestored(baseline, [`${FIXTURE}/merge.md`]); baseline = await readNotes(); return { id, ...parsed, restored };
  });
  await check('protected-source-and-target-zero-writes', async () => {
    const writesBefore = await writeCount();
    await focusClick('tab-tags'); await refresh(); await focusClick('tag-hostprotected');
    assert.equal(await cdp.eval(`return Array.from(document.querySelectorAll('button')).find(e=>e.getAttribute('aria-label')==='Rename')?.disabled;`), true);
    for (const [source, target] of [['hostprotected/child', 'Changed'], ['hostold', 'HostProtected/Child']]) {
      const error = await cdp.eval(`try{await ${p}.managementAdapter().commands.startManual({kind:'rename',source:${JSON.stringify(source)},target:${JSON.stringify(target)},scope:${JSON.stringify(scope)}},new AbortController().signal);return null;}catch(e){return e.message;}`);
      assert.match(error ?? '', /Protected/);
    }
    assert.deepEqual(await readNotes(), baseline); assert.equal(await writeCount(), writesBefore); await screenshot('policy-protected');
    return { markdownWriteCalls: 0 };
  });
  await check('stale-confirmation-conflict-zero-plugin-writes', async () => {
    await prepare(['hostold'], 'HostConflict');
    const path = `${FIXTURE}/mixed.md`;
    await writeFixture(path, `${baseline[path]}External synthetic conflict\n`);
    const expected = await readNotes();
    const operationsBefore = await cdp.eval(`return ${p}.operationLog.toJSON();`);
    const writesBefore = await writeCount();
    await click('Continue to apply'); await click('Confirm write');
    await waitFor(`document.querySelector('.tag-curator-cleanup-review__warning')?.textContent.includes('changed')`, 'stale conflict warning');
    assert.deepEqual(await readNotes(), expected);
    assert.deepEqual(await cdp.eval(`return ${p}.operationLog.toJSON();`), operationsBefore);
    assert.equal(await writeCount(), writesBefore);
    await screenshot('conflict-zero-writes'); await dismiss(); await writeFixture(path, baseline[path]);
    return { markdownWritesByPlugin: 0, operationIntentCreated: false };
  });
  await check('active-editor-edit-mixed-rename-and-undo', async () => {
    const path = `${FIXTURE}/active.md`;
    await cdp.eval(`const file=app.vault.getAbstractFileByPath(${JSON.stringify(path)});window.__hostEditorLeaf=app.workspace.getLeaf('split');await window.__hostEditorLeaf.openFile(file,{state:{mode:'source'}});app.workspace.setActiveLeaf(window.__hostEditorLeaf,{focus:true});`);
    await waitFor(`app.workspace.activeEditor?.file?.path===${JSON.stringify(path)}`, 'active editor file');
    await cdp.eval(`const leaf=window.__hostEditorLeaf;if(leaf.view.file.path!==${JSON.stringify(path)})throw new Error('Editor fixture mismatch');${guard}leaf.view.editor.replaceRange('Typed #HostActive line.\\n',{line:leaf.view.editor.lastLine(),ch:0});`);
    await waitFor(`(await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(path)}))).includes('Typed #HostActive line.')`, 'editor autosave');
    const before = await readNotes();
    await prepare(['hostactive'], 'HostEdited');
    const activePathAfterWorkbenchFocus = await cdp.eval('return app.workspace.activeEditor?.file?.path??null;');
    await cdp.eval('app.workspace.setActiveLeaf(window.__hostEditorLeaf,{focus:true});');
    const activePathAtReview = await cdp.eval('return app.workspace.activeEditor?.file?.path??null;');
    assert.equal(activePathAtReview, path);
    await screenshot('active-editor-review');
    const id = (await applyReview()).id;
    await waitFor(`window.__hostEditorLeaf.view.editor.getValue().includes('Typed #HostEdited line.')`, 'editor reflects plugin write');
    const after = await cdp.eval(`return {editor:window.__hostEditorLeaf.view.editor.getValue(),disk:await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(path)}))};`);
    assert.equal(after.editor, after.disk); assert(!after.disk.includes('#HostActive'));
    await screenshot('active-editor-applied'); await undo(id);
    const restored = await assertRestored(before, [path]);
    await cdp.eval('window.__hostEditorLeaf.detach();delete window.__hostEditorLeaf;');
    baseline = await readNotes(); return { activePathAfterWorkbenchFocus, activePathAtReview, editorEqualsDisk: true, restored };
  });
  await check('popout-workbench-policy-modal-and-close', async () => {
    const beforeTargets = new Set((await (await fetch(targetsUrl)).json()).map(t=>t.id));
    await cdp.eval(`window.__hostPopoutLeaf=app.workspace.openPopoutLeaf();await window.__hostPopoutLeaf.setViewState({type:'tag-curator-management',active:true});await app.workspace.revealLeaf(window.__hostPopoutLeaf);`);
    let target;
    for (let i=0;i<50;i++) { target=(await (await fetch(targetsUrl)).json()).find(t=>!beforeTargets.has(t.id)&&t.type==='page');if(target)break;await new Promise(r=>setTimeout(r,100)); }
    assert(target, 'Popout CDP target missing');
    const popout = await CDP.connect(target);
    try {
      await waitFor(`document.querySelector('.tag-curator-workbench')`, 'popout workbench', 15000, popout);
      await screenshot('popout-workbench', popout);
      // A JS click alone does not activate the native window after a prior popout cycle.
      await popout.call('Page.bringToFront');
      await cdp.eval('app.workspace.setActiveLeaf(window.__hostPopoutLeaf,{focus:true});');
      await popout.eval(`window.electronWindow?.focus();window.focus();`);
      try { await waitFor(`activeWindow===window.__hostPopoutLeaf.view.contentEl.ownerDocument.defaultView`, 'native popout focus', 1500); }
      catch {
        // CDP does not reliably deliver native focus in this environment. Exercise
        // Obsidian's real focus handler, and retain this limitation in the report.
        (report.inputLimitations??=[]).push('Popout native focus not observed; dispatched a window focus event before real CDP mouse input. Manual native activation remains unverified.');
        await popout.eval(`window.dispatchEvent(new FocusEvent('focus'));`);
        await waitFor(`activeWindow===window.__hostPopoutLeaf.view.contentEl.ownerDocument.defaultView`, 'host popout focus handler', 1500);
      }
      const point=await popout.eval(`const el=document.querySelector('[data-focus="settings"]');el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};`);
      await popout.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await popout.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
      try { await waitFor(`document.querySelector('.tag-curator-workbench-modal')`, 'modal in popout ownerDocument', 5000, popout); }
      catch (error) {
        report.popoutDiagnostic = await cdp.eval(`return {mainModals:Array.from(document.querySelectorAll('.modal')).map(e=>e.textContent.slice(0,500)),viewModals:Array.from(window.__hostPopoutLeaf.view.modals).map(m=>({live:m.live,connected:m.containerEl.isConnected,mainDocument:m.containerEl.ownerDocument===document,owner:m.containerEl.ownerDocument.title})),modalOpen:String(window.__hostObsidian.Modal.prototype.open)};`);
        await screenshot('popout-modal-failure',popout);throw error;
      }
      await screenshot('popout-policy-modal', popout);
      await click('Cancel', 'document', popout);
      await focusClick('tab-history', popout); await screenshot('popout-history', popout);
      const result = await popout.eval(`return {basePath:app.vault.adapter.basePath,history:!!document.querySelector('[data-focus="history-search"]'),width:innerWidth,height:innerHeight};`);
      assert.equal(result.history, true); return result;
    } finally {
      await cdp.eval(`if(window.__hostPopoutLeaf){${guard}window.__hostPopoutLeaf.detach();delete window.__hostPopoutLeaf;}`); popout.close();
    }
  });
  await check('original-nonfixture-notes-unchanged', async () => {
    const after = await readNotes();
    for (const [path, text] of Object.entries(originalNotes)) if (!path.startsWith(`${FIXTURE}/`)) assert.equal(after[path], text);
    return { verifiedFiles: Object.keys(originalNotes).filter(p => !p.startsWith(`${FIXTURE}/`)).length };
  });
  await check('local-plugin-network-zero-requests', async () => {
    const calls = await cdp.eval('return window.__hostRequestUrlCalls;');
    report.requestUrlCalls = calls;
    const pluginCalls = calls.filter(call => call.stack?.includes(`plugin:${PLUGIN}`));
    const rendererCalls = report.network.filter(r => r.pluginAttributed);
    assert.equal(pluginCalls.length, 0); assert.equal(rendererCalls.length, 0);
    return { pluginRequestUrl: pluginCalls.length, pluginRendererRequests: rendererCalls.length, unrelatedRendererRequests: report.network.length - rendererCalls.length };
  });
}

try { await main(); }
catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  if (cdp) {
    report.finalHost = await cdp.eval(`return {basePath:app.vault.adapter.basePath,title:document.title,modals:Array.from(document.querySelectorAll('.modal')).map(e=>e.textContent.slice(0,3000))};`).catch(error => ({ error: error.message }));
    if (run) { await cdp.call('Debugger.disable').catch(() => {}); }
    if (run) {
      report.ioAudit = await cdp.eval('return window.__hostIO?{writes:window.__hostIO.writes,reads:window.__hostIO.reads}:null;').catch(() => null);
      await cdp.eval('window.__releaseRestore?.();delete window.__releaseRestore;window.__hostSmokeUnsub?.forEach(fn=>fn());delete window.__hostSmokeUnsub;window.__hostIO?.restore.forEach(fn=>fn());delete window.__hostIO;delete window.__hostObsidian;delete window.__hostRequestUrlCalls;').catch(() => {});
    }
    cdp.close();
  }
  report.finishedAt = new Date().toISOString();
  if (!report.error && report.yaml?.apiVersion === '1.8.7' && run) report.unverified = report.unverified.filter(item => item !== 'Minimum supported Obsidian 1.8.7');
  await mkdir(ASSETS, { recursive: true });
  const path = resolve(ASSETS, recoveryPhase ? `host-recovery-${recoveryPhase}-report.json` : finalSmoke ? 'host-final-smoke-report.json' : probeOnly ? 'host-probe-report.json' : 'host-workbench-report.json');
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${path}`);
}
