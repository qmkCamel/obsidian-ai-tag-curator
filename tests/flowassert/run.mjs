import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath,pathToFileURL } from "node:url";
import { execFileSync,execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { cases } from "./cases.mjs";

const root=fileURLToPath(new URL("../../",import.meta.url));
const runtime=process.env.CODEX_BROWSER_PACKAGES??path.join(os.homedir(),".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules");
const requireRuntime=createRequire(path.join(runtime,"package.json")),{chromium}=requireRuntime("playwright");
const runId=new Date().toISOString().replace(/[:.]/g,"-"),out=path.join(root,"tests/flowassert/artifacts",runId);await fs.mkdir(out,{recursive:true});
const report={runId,startedAt:new Date().toISOString(),sha:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),dirty:true,node:process.version,hardware:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model,memory:os.totalmem()},boundary:"Production graph modules in real Chrome with synthetic Obsidian adapter. Playwright executes the repository cases; FlowAssert imports the real JUnit report. Not native FlowAssert desktop execution or real Obsidian acceptance.",cases:[],screenshots:[],externalRequests:[],pageErrors:[],performance:[],visualReview:"needs-review"};
const archive=await fs.readFile("/Applications/Obsidian.app/Contents/Resources/obsidian.asar"),header=JSON.parse(archive.subarray(16,16+archive.readUInt32LE(12)).toString());
const archiveFile=name=>{const entry=name.split("/").reduce((dir,p)=>dir.files[p],header);const start=8+archive.readUInt32LE(4)+Number(entry.offset);return archive.subarray(start,start+entry.size).toString();};
report.obsidianCssVersion=JSON.parse(archiveFile("package.json")).version;
const worker=await build({absWorkingDir:root,entryPoints:["src/graph/tag-graph.worker.ts"],bundle:true,write:false,format:"iife",platform:"browser",target:"es2018",minify:true});
const bundle=await build({absWorkingDir:root,entryPoints:["tests/flowassert/graph-fixture.ts"],bundle:true,write:false,format:"esm",target:"es2022",alias:{obsidian:path.join(root,"tests/verification/workbench-browser-host.mjs"),lucide:requireRuntime.resolve("lucide")},plugins:[{name:"embedded-worker",setup(b){b.onLoad({filter:/[\\/]graph[\\/]worker-source\.ts$/},()=>({contents:`export default ${JSON.stringify(worker.outputFiles[0].text)}`,loader:"js"}));}}]});
report.browserBundleSha256=createHash("sha256").update(bundle.outputFiles[0].text).digest("hex");report.workerSha256=createHash("sha256").update(worker.outputFiles[0].text).digest("hex");
const css=await fs.readFile(path.join(root,"styles.css"),"utf8");
const html=`<!doctype html><html><head><meta charset="utf-8"><style>${archiveFile("app.css")}</style><style>${css}</style><style>html,body,#preview{margin:0;width:100%;height:100%}body{display:block}#preview{position:relative}.view-content{height:100%;overflow:auto}.tag-curator-workbench{overflow:auto}</style></head><body><main id="preview"></main></body></html>`;
let browser;
const xml=s=>String(s).replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]));
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE??"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});report.browser=browser.version();
  const page=await browser.newPage({viewport:{width:900,height:900},reducedMotion:"reduce",serviceWorkers:"block"});page.setDefaultTimeout(12000);
  await page.route("**/*",route=>{report.externalRequests.push(route.request().url());return route.abort();});page.on("pageerror",error=>report.pageErrors.push(error.message));
  await page.setContent(html);await page.addScriptTag({type:"module",content:bundle.outputFiles[0].text});await page.waitForFunction(()=>window.graphFixture);
  const capture=async name=>{const file=`${name}.png`;await page.screenshot({path:path.join(out,file),fullPage:true});const bytes=await fs.readFile(path.join(out,file));report.screenshots.push({file,sha256:createHash("sha256").update(bytes).digest("hex")});};
  for(const test of cases){
    await page.evaluate(async()=>{window.graphFixture.fault(false);await window.graphFixture.mount();});await page.waitForFunction(()=>window.graphFixture.metrics().phase==="ready");
    const started=performance.now();console.log(`Running ${test.id}: ${test.name}`);let error;
    try{await test.run({page,capture:name=>capture(`${test.id}-${name}`)});}catch(e){error=String(e.stack??e);await capture(`${test.id}-failure`);}
    report.cases.push({id:test.id,name:test.name,status:error?"failed":"passed",durationMs:performance.now()-started,error});console.log(`${test.id}: ${error?"FAIL":"PASS"}`);
  }
  // Responsive visual evidence and a real keyboard-only comparison path.
  for(const width of [360,900])for(const dark of [false,true]){
    await page.setViewportSize({width,height:900});await page.evaluate(async options=>{window.graphFixture.fault(false);await window.graphFixture.mount(options);},{dark,language:width===360?"zh-CN":"en"});await page.waitForFunction(()=>window.graphFixture.metrics().phase==="ready");
    const label=width===360?"精确标签 A":"Exact tag A";await page.getByLabel(label,{exact:true}).focus();await page.keyboard.type("note");await page.keyboard.press("Tab");await page.keyboard.type("notes");await page.keyboard.press("Tab");await page.keyboard.press("Enter");await page.waitForFunction(()=>window.graphFixture.metrics().comparison?.shared===0);
    await capture(`keyboard-${width}-${dark?"dark":"light"}`);
    const overflow=await page.evaluate(()=>document.querySelector(".tag-graph").scrollWidth>document.querySelector(".tag-graph").clientWidth+1);
    report.cases.push({id:`LAYOUT-${width}-${dark}`,name:`Keyboard comparison ${width}px ${dark?"dark":"light"}`,status:overflow?"failed":"passed",durationMs:0,error:overflow?"Horizontal overflow":undefined});
  }
  if(process.argv.includes("--performance")){
    await page.setViewportSize({width:900,height:900});
    for(const size of [1000,10000]){console.log(`Performance ${size}: warmup 5, samples 30`);const result=await page.evaluate(size=>window.graphFixture.benchmark(size),size);const p95=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];result.p95=Object.fromEntries(Object.keys(result.samples[0]).map(k=>[k,p95(result.samples.map(s=>s[k]))]));report.performance.push(result);}
    report.responsiveness=await page.evaluate(()=>window.graphFixture.responsiveness());
    report.longTasks=await page.evaluate(()=>window.graphFixture.longTasks);
    const p95=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
    report.responsivenessP95=Object.fromEntries(["feedback","interaction","cancel"].map(k=>[k,p95(report.responsiveness.map(s=>s[k]))]));
    assert(report.responsivenessP95.feedback<=100&&report.responsivenessP95.interaction<=100&&report.responsivenessP95.cancel<=250,"Interaction or cancellation budget failed");
    assert(report.performance.every(r=>r.p95.total<=(r.size===1000?2000:5000)),"Generation performance budget failed");
    assert(report.longTasks.every(ms=>ms<=100),"Graph introduced a main-thread task over 100ms");
  }
  await page.evaluate(()=>window.graphFixture.close());report.resources=await page.evaluate(()=>window.graphFixture.resources());assert.equal(report.resources.activeWorkers,0);assert.equal(report.resources.urls,0);
}catch(error){report.error=String(error.stack??error);}
finally{await browser?.close();}
report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,"report.json"),JSON.stringify(report,null,2)+"\n");
const failures=report.cases.filter(t=>t.status!=="passed").length;
const junit=`<?xml version="1.0" encoding="UTF-8"?><testsuite name="Tag relationship graph" tests="${report.cases.length}" failures="${failures}" errors="0" skipped="0">${report.cases.map(t=>`<testcase name="${xml(t.id+" "+t.name)}" classname="tag-relationships.browser" time="${t.durationMs/1000}">${t.error?`<failure message="${xml(t.error)}"/>`:""}</testcase>`).join("")}</testsuite>`;
await fs.writeFile(path.join(out,"junit.xml"),junit+"\n");
console.log(`Evidence: ${out}`);
if(process.argv.includes("--flowassert")){
  // A real isolated FlowAssert runtime imports the actual producer report. Never reuse personal archives.
  const flowRoot=process.env.FLOWASSERT_ROOT??"/Users/edge/work/flowassert";
  const {startLocalViewerCli,LocalDeviceRuntime}=await import(pathToFileURL(path.join(flowRoot,"lib/index.js")).href);
  const flowStorage=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),"tag-graph-flowassert-"));
  const handle=await startLocalViewerCli(["--config",path.join(flowStorage,"config.json"),"--port","0"],{stdout:{write:()=>{}}},{env:{},createRuntime:(config,options)=>new LocalDeviceRuntime(config,{...options,workbenchRoot:path.join(flowStorage,"workbench"),matrixRegistryPath:path.join(flowStorage,"matrix.json")})});
  try{
    const args=[path.join(flowRoot,"scripts/mobile-mirror-cli.mjs"),"test","external-results","import","--url",handle.url,"--report",path.join(out,"junit.xml"),"--adapter","junit","--engine","Playwright","--engine-version",requireRuntime("playwright/package.json").version,"--reviewed"];
    const {stdout}=await promisify(execFile)(process.execPath,args,{cwd:root,encoding:"utf8",timeout:30000});await fs.writeFile(path.join(out,"flowassert-import.json"),stdout);
    const records=stdout.trim().split("\n").map(line=>JSON.parse(line));assert.equal(records.at(-1).phase,"finished");
    await fs.writeFile(path.join(out,"flowassert-version.json"),JSON.stringify({version:JSON.parse(await fs.readFile(path.join(flowRoot,"package.json"),"utf8")).version,sha:execFileSync("git",["rev-parse","HEAD"],{cwd:flowRoot,encoding:"utf8"}).trim(),assetId:records.at(-1).assetId,storage:flowStorage},null,2)+"\n");console.log("FlowAssert imported the browser execution report.");
  }finally{await handle.close();}
}
if(report.error||failures||report.pageErrors.length||report.externalRequests.length)process.exitCode=1;
