// Runs only a newly created synthetic vault/profile with an explicitly supplied official app copy.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn,execFileSync,execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const root=fileURLToPath(new URL("../../",import.meta.url)),version=process.argv[2],executable=process.argv[3];
assert(["1.8.7","1.14.5"].includes(version));assert(executable?.startsWith("/private/tmp/tag-curator-graph-hosts/"));
const runtime=process.env.CODEX_BROWSER_PACKAGES??path.join(os.homedir(),".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules");
const {chromium}=createRequire(path.join(runtime,"package.json"))("playwright");
const temp=await fs.mkdtemp("/private/tmp/tag-curator-release-graph-"),vault=path.join(temp,"vault"),profile=path.join(temp,"profile"),pluginDir=path.join(vault,".obsidian/plugins/ai-tag-curator-dev"),port=version==="1.8.7"?19387:19445;
await fs.writeFile(path.join(temp,".release-fixture"),"tag-curator-0.5.0\n");
await fs.mkdir(pluginDir,{recursive:true});await fs.mkdir(profile,{recursive:true});
const json=(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2)+"\n");
await json(path.join(profile,"obsidian.json"),{vaults:{"abcdef1234567890":{path:vault,ts:Date.now(),open:true}},updateDisabled:true});
await json(path.join(vault,".obsidian/app.json"),{safeMode:false});await json(path.join(vault,".obsidian/core-plugins.json"),[]);await json(path.join(vault,".obsidian/community-plugins.json"),["ai-tag-curator-dev"]);
const manifest=JSON.parse(await fs.readFile(path.join(root,"manifest.json"),"utf8"));await json(path.join(pluginDir,"manifest.json"),{...manifest,id:"ai-tag-curator-dev",name:"Tag Curator Graph Acceptance"});
for(const file of ["main.js","styles.css"])await fs.copyFile(path.join(root,file),path.join(pluginDir,file));
await json(path.join(pluginDir,"data.json"),{settings:{uiLanguage:"en",readInlineTags:true,refreshIndexOnLoad:false,apiKey:"",providerType:"local-openai-compatible"},operations:[]});
const tagList=Array.from({length:200},(_,i)=>`dense-${String(i).padStart(3,"0")}`);
const notes={"dense-a.md":`---\ntags: [${tagList.join(", ")}]\n---\nSynthetic graph fixture.\n`,"dense-b.md":`---\ntags: [${tagList.join(", ")}]\n---\nSynthetic graph fixture.\n`,"a.md":"---\ntags: [alpha, alpha/child]\n---\n#alpha #alpha/child\n","b.md":"---\ntags: [alpha]\n---\n#alpha\n","zero.md":"---\ntags: [unrelated]\n---\n"};
for(const [name,content]of Object.entries(notes))await fs.writeFile(path.join(vault,name),content);
const runId=`host-${version}-${new Date().toISOString().replace(/[:.]/g,"-")}`,out=path.join(root,"tests/flowassert/artifacts",runId);await fs.mkdir(out,{recursive:true});
const report={version,runId,vault,profile,sha:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),assets:{},checks:[],screenshots:[],requests:[],errors:[]};
for(const file of ["main.js","manifest.json","styles.css"])report.assets[file]=createHash("sha256").update(await fs.readFile(path.join(pluginDir,file))).digest("hex");
let child,browser,page;
const launch=async()=>{
  const log=await fs.open(path.join(out,"host.log"),"a");child=spawn(executable,[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,"--disable-background-networking","--no-first-run"],{stdio:["ignore",log.fd,log.fd]});await log.close();
  for(let i=0;i<150;i++){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);break;}catch{await new Promise(r=>setTimeout(r,200));}}
  assert(browser,"Isolated app did not expose CDP");
  const context=browser.contexts()[0];await context.route(/https?:\/\//,route=>{report.requests.push(route.request().url());return route.abort();});
  for(let i=0;i<100;i++){page=context.pages().find(p=>p.url().includes("app://obsidian.md"));if(page)break;await new Promise(r=>setTimeout(r,100));}assert(page,"No host page");
  page.setDefaultTimeout(15000);page.on("pageerror",e=>report.errors.push(e.message));await page.waitForFunction(()=>!!window.app?.vault&&!!window.app?.plugins?.plugins);
  assert.equal(await page.evaluate(()=>app.vault.adapter.basePath),vault);
  const trust=page.getByRole("button",{name:/^(Trust author and enable plugins|信任仓库作者并启用插件)$/});
  await page.waitForFunction(()=>!!window.app?.plugins?.plugins?.["ai-tag-curator-dev"]||Array.from(document.querySelectorAll("button")).some(b=>/^(Trust author and enable plugins|信任仓库作者并启用插件)$/.test(b.textContent??"")));
  if(await trust.isVisible())await trust.click();
  await page.evaluate(async()=>{if(!app.plugins.plugins["ai-tag-curator-dev"]){await app.plugins.enablePluginAndSave("ai-tag-curator-dev");}});
  await page.waitForFunction(()=>!!app.plugins.plugins["ai-tag-curator-dev"]);
  await page.evaluate(()=>app.setting.close());
  await page.evaluate(()=>new Promise(resolve=>app.workspace.onLayoutReady(resolve)));
  await page.waitForFunction(()=>app.vault.getMarkdownFiles().every(file=>app.metadataCache.getFileCache(file)));
  // A fresh vault has startup metadata events; wait for their revision to settle before the explicit scan.
  let lastRevision,stableSince=Date.now();
  for(let i=0;i<100;i++){const revision=await page.evaluate(()=>app.plugins.plugins["ai-tag-curator-dev"].managementAdapter().getState().vaultRevision);if(revision!==lastRevision){lastRevision=revision;stableSince=Date.now();}if(Date.now()-stableSince>=500)break;await new Promise(r=>setTimeout(r,100));}
  await page.evaluate(()=>{const Original=window.Worker,create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.__graphResources={workers:0,urls:new Set()};window.Worker=class extends Original{constructor(...args){super(...args);window.__graphResources.workers++;}terminate(){super.terminate();window.__graphResources.workers--;}};URL.createObjectURL=blob=>{const url=create(blob);window.__graphResources.urls.add(url);return url;};URL.revokeObjectURL=url=>{window.__graphResources.urls.delete(url);revoke(url);};});
};
const close=async()=>{if(browser){await browser.close().catch(()=>{});browser=undefined;}if(child&&!child.killed){child.kill("SIGTERM");await new Promise(resolve=>{if(child.exitCode!==null)resolve();else{child.once("exit",resolve);setTimeout(resolve,3000);}});}};
const check=async(name,fn)=>{const start=Date.now();try{const value=await fn();report.checks.push({name,status:"passed",durationMs:Date.now()-start,value});console.log(`${version} PASS ${name}`);}catch(error){report.checks.push({name,status:"failed",error:String(error.stack??error)});throw error;}};
const screenshot=async(name,target=page)=>{if(name==="overview-200-800"||name==="popout")await target.locator(".tag-graph__canvas svg").scrollIntoViewIfNeeded();const file=`${name}.png`;await target.screenshot({path:path.join(out,file)});report.screenshots.push(file);};
const state=()=>page.evaluate(()=>app.plugins.plugins["ai-tag-curator-dev"].managementAdapter().getState());
const graph=()=>page.evaluate(()=>app.workspace.getLeavesOfType("tag-curator-management")[0].view.graphPanel);
try{
  await launch();
  await check("version-isolation-no-key-and-no-auto-scan",async()=>{
    const info=await page.evaluate(()=>({version:JSON.parse(require("fs").readFileSync(require("path").join(process.resourcesPath,"obsidian.asar/package.json"),"utf8")).version,electron:process.versions.electron,basePath:app.vault.adapter.basePath,key:app.plugins.plugins["ai-tag-curator-dev"].settings.apiKey,active:app.workspace.getActiveFile()?.path??null}));assert.equal(info.version,version);assert.equal(info.key,"");assert.equal(info.active,null);
    await page.evaluate(()=>app.commands.executeCommandById("ai-tag-curator-dev:open-tag-relationship-graph"));await page.getByRole("tab",{name:"Relationships",exact:true}).waitFor();assert.equal((await state()).index,null);return info;
  });
  await check("three-assets-offline-refresh-200-nodes-800-edges",async()=>{
    await page.evaluate(()=>app.plugins.plugins["ai-tag-curator-dev"].managementAdapter().commands.refresh());await page.waitForFunction(()=>document.querySelector(".tag-graph")?.dataset.phase==="ready");
    await page.getByRole("button",{name:"Scope overview",exact:true}).click();await page.locator(".tag-graph__canvas svg").waitFor();const nodes=await page.locator(".tag-graph__node").count(),edges=await page.locator(".tag-graph__edge").count();assert.equal(nodes,200);assert.equal(edges,800);await screenshot("overview-200-800");return{nodes,edges};
  });
  await check("real-note-evidence-and-read-only-management-navigation",async()=>{
    await page.getByLabel("Exact tag A",{exact:true}).fill("alpha");await page.getByLabel("Exact tag B",{exact:true}).fill("alpha/child");await page.getByRole("button",{name:"Compare pair",exact:true}).click();await page.getByText("Shared / only A / only B: 1 / 1 / 0",{exact:false}).waitFor();await screenshot("comparison");
    await page.getByRole("button",{name:"Bring to management",exact:true}).click();assert.equal(await page.locator("[data-tag] input:checked").count(),0);await page.getByRole("button",{name:"Cancel management and return to comparison",exact:true}).click();await page.locator(".tag-graph__file").first().waitFor();
    assert.equal((await state()).history.length,0);for(const [name,text]of Object.entries(notes))assert.equal(await fs.readFile(path.join(vault,name),"utf8"),text);
  });
  await check("in-progress-file-open-search-cancel-failure-preservation",async()=>{
    await page.evaluate(()=>{const panel=app.workspace.getLeavesOfType("tag-curator-management")[0].view.graphPanel,original=panel.service.workerFactory;window.__graphFactory=original;panel.service.workerFactory=()=>{const h=original(),post=h.worker.postMessage.bind(h.worker),release=h.release;let timer;h.worker.postMessage=(m)=>{if(m.type==="compute")timer=setTimeout(()=>post(m),1800);else post(m);};h.release=()=>{clearTimeout(timer);release();};return h;};});
    await page.getByRole("button",{name:"Generate relationships",exact:true}).click();await page.getByLabel("Search all scoped tags",{exact:true}).fill("alpha");
    await page.locator(".tag-graph__file").first().click();assert.notEqual(await page.locator(".tag-graph").getAttribute("data-phase"),"ready");
    const start=Date.now();await page.getByRole("button",{name:"Cancel calculation",exact:true}).click();assert(Date.now()-start<250);assert.equal(await page.locator(".tag-graph__canvas svg").count(),1);
    await page.evaluate(()=>{const panel=app.workspace.getLeavesOfType("tag-curator-management")[0].view.graphPanel;panel.service.workerFactory=()=>{throw new Error("controlled host Worker failure");};});await page.getByRole("button",{name:"Generate relationships",exact:true}).click();await page.getByText("Worker unavailable",{exact:false}).waitFor();assert.equal(await page.locator(".tag-graph__canvas svg").count(),1);
    await page.evaluate(()=>{app.workspace.getLeavesOfType("tag-curator-management")[0].view.graphPanel.service.workerFactory=window.__graphFactory;delete window.__graphFactory;});return await page.evaluate(()=>({workers:window.__graphResources.workers,urls:window.__graphResources.urls.size}));
  });
  await check("owner-window-popout-offline-worker",async()=>{
    const context=browser.contexts()[0],prior=new Set(context.pages());await page.evaluate(async()=>{window.__graphPopout=app.workspace.openPopoutLeaf();await window.__graphPopout.setViewState({type:"tag-curator-management",active:true});await app.workspace.revealLeaf(window.__graphPopout);window.__graphPopout.view.openRelationships();});
    let pop;for(let i=0;i<100;i++){pop=context.pages().find(p=>!prior.has(p));if(pop)break;await new Promise(r=>setTimeout(r,100));}assert(pop);pop.setDefaultTimeout(15000);await pop.getByRole("button",{name:"Scope overview",exact:true}).click();await pop.locator(".tag-graph__canvas svg").waitFor();assert.equal(await pop.locator(".tag-graph__edge").count(),800);await screenshot("popout",pop);await page.evaluate(()=>{window.__graphPopout.detach();delete window.__graphPopout;});
  });
  await check("index-save-failure-preserves-evidence-and-last-index-time",async()=>{
    const before=(await state()).index.updatedAt;
    const failure=await page.evaluate(async()=>{const s=app.plugins.plugins["ai-tag-curator-dev"].indexService,original=s.dependencies.persist;s.dependencies.persist=async()=>{throw new Error("controlled synthetic index save failure");};try{await app.plugins.plugins["ai-tag-curator-dev"].managementAdapter().commands.refresh();return null;}catch(error){return error.message;}finally{s.dependencies.persist=original;}});
    assert.equal(failure,"controlled synthetic index save failure");
    assert.equal((await state()).freshness,"error");assert.equal((await state()).index.updatedAt,before);assert(await page.locator(".tag-graph__details").textContent());await screenshot("index-save-failure");
    await page.evaluate(()=>app.plugins.plugins["ai-tag-curator-dev"].managementAdapter().commands.refresh());await page.waitForFunction(()=>document.querySelector(".tag-graph")?.dataset.phase==="ready");
  });
  await check("narrow-wide-dark-light-keyboard",async()=>{
    await page.evaluate(()=>{app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();for(const editor of app.workspace.getLeavesOfType("markdown"))editor.detach();const leaf=app.workspace.getLeavesOfType("tag-curator-management")[0];app.workspace.setActiveLeaf(leaf,{focus:true});});
    const cdp=await page.context().newCDPSession(page);
    for(const width of [360,900])for(const dark of [false,true]){await cdp.send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:false});await page.evaluate(dark=>{document.body.classList.toggle("theme-dark",dark);document.body.classList.toggle("theme-light",!dark);},dark);await page.getByLabel("Exact tag A",{exact:true}).focus();await page.keyboard.press("ControlOrMeta+A");await page.keyboard.type("alpha");await page.keyboard.press("Tab");await page.keyboard.press("ControlOrMeta+A");await page.keyboard.type("unrelated");await page.keyboard.press("Tab");await page.keyboard.press("Enter");await page.getByText("Shared / only A / only B: 0 / 2 / 1",{exact:false}).waitFor();await screenshot(`keyboard-${width}-${dark?"dark":"light"}`);}
    await cdp.send("Emulation.clearDeviceMetricsOverride");await cdp.detach();
  });
  await check("full-process-restart-stale-cache",async()=>{const pid=child.pid;await close();await launch();await page.evaluate(()=>app.commands.executeCommandById("ai-tag-curator-dev:open-tag-relationship-graph"));await page.getByText("Stale index/evidence",{exact:false}).waitFor();assert.notEqual(child.pid,pid);return{beforePid:pid,afterPid:child.pid,freshness:(await state()).freshness};});
  await check("final-no-note-or-operation-writes",async()=>{for(const [name,text]of Object.entries(notes))assert.equal(await fs.readFile(path.join(vault,name),"utf8"),text);assert.equal((await state()).history.length,0);return{notes:Object.keys(notes).length};});
  if(process.argv.includes("--regression"))await check("existing-real-host-rename-merge-undo-regression",async()=>{
    const assets=`docs/verification/assets/${runId}-regression`;
    const {stdout}=await promisify(execFile)(process.execPath,["tests/verification/host-workbench.mjs","--installed"],{cwd:root,env:{...process.env,OBSIDIAN_TEST_VAULT:vault,OBSIDIAN_TEST_PORT:String(port),OBSIDIAN_TEST_VERSION:version,OBSIDIAN_TEST_ASSETS:assets},timeout:180000});
    await fs.writeFile(path.join(out,"management-regression.log"),stdout);return{assets};
  });
}catch(error){report.error=String(error.stack??error);if(page)await screenshot("failure").catch(()=>{});process.exitCode=1;}
finally{await close();report.finishedAt=new Date().toISOString();await json(path.join(out,"report.json"),report);console.log(`Host evidence: ${out}`);}
