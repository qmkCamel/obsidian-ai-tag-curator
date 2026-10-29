import assert from "node:assert/strict";
export const cases = [
  {id:"GRAPH-07",name:"Refresh uses applied parameters exactly once, hidden views defer and errors retain results",async run({page}){
    await page.getByRole("button",{name:"Scope overview",exact:true}).click();await page.locator(".tag-graph__canvas svg").waitFor();const before=await page.evaluate(()=>window.graphFixture.resources().created);
    await page.getByLabel("Shared-file threshold",{exact:true}).fill("99");
    await page.evaluate(()=>{const s=window.graphFixture.state();window.graphFixture.update({index:{...s.index,updatedAt:"2026-10-29T00:00:00.000Z"},indexRevision:2});});
    await page.waitForFunction(()=>window.graphFixture.metrics().phase==="ready");assert.equal((await page.evaluate(()=>window.graphFixture.metrics().query)).threshold,2);assert.equal(await page.evaluate(()=>window.graphFixture.resources().created),before+1);
    await page.getByRole("tab",{name:"History",exact:true}).click();await page.evaluate(()=>{const s=window.graphFixture.state();window.graphFixture.update({index:{...s.index,updatedAt:"2026-10-30T00:00:00.000Z"},indexRevision:3});});assert.equal(await page.evaluate(()=>window.graphFixture.resources().created),before+1);
    await page.getByRole("tab",{name:"Relationships",exact:true}).click();await page.waitForFunction(()=>window.graphFixture.metrics().phase==="ready");assert.equal(await page.evaluate(()=>window.graphFixture.resources().created),before+2);
    await page.evaluate(()=>window.graphFixture.update({freshness:"error",error:"controlled index save failure"}));assert.equal(await page.locator(".tag-graph__canvas svg").count(),1);await page.getByText("2026-10-30T00:00:00.000Z",{exact:false}).first().waitFor();
  }},
  {id:"GRAPH-01",name:"Local-first entry, independent pair, asymmetric evidence and read-only handoff",async run({page,capture}){
    await page.getByLabel("Search all scoped tags",{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector(".tag-graph")?.dataset.phase==="ready");
    assert.equal(await page.locator(".tag-graph__canvas svg").count(),0);
    await page.getByLabel("Exact tag A",{exact:true}).fill("topic");await page.getByLabel("Exact tag B",{exact:true}).fill("topic/special");await page.getByRole("button",{name:"Compare pair",exact:true}).click();
    await page.getByText("Shared / only A / only B: 10 / 91 / 0",{exact:false}).waitFor();
    await page.getByRole("button",{name:"Only A files",exact:true}).click();await page.locator(".tag-graph__file").first().waitFor();assert.equal(await page.locator(".tag-graph__file").count(),50);await capture("comparison");
    await page.getByRole("button",{name:"Bring to management",exact:true}).click();assert.equal(await page.locator('[data-tag] input:checked').count(),0);
    assert.deepEqual(await page.evaluate(()=>window.graphFixture.calls.filter(c=>c[0]!=="openFile")),[]);
    await page.getByRole("button",{name:"Cancel management and return to comparison",exact:true}).click();await page.getByRole("button",{name:"Only A files",exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll(".tag-graph__file").length===50);
    await page.getByRole("button",{name:"Bring to management",exact:true}).click();
    await page.evaluate(()=>{const s=window.graphFixture.state(),tags={...s.index.tags};delete tags.topic;window.graphFixture.update({index:{...s.index,tags,updatedAt:"2026-10-29T00:00:00Z"},indexRevision:2,vaultRevision:2});});
    await page.getByText("Comparison is stale",{exact:false}).waitFor();await page.getByRole("button",{name:"Cancel management and return to comparison",exact:true}).click();
    await page.getByText("An endpoint has no eligible files",{exact:false}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.graphFixture.calls.filter(c=>c[0]!=="openFile")),[]);
  }},
  {id:"GRAPH-02",name:"Zero overlap, duplicate endpoint validation and source availability",async run({page}){
    await page.getByLabel("Exact tag A",{exact:true}).fill("note");await page.getByLabel("Exact tag B",{exact:true}).fill("notes");await page.getByRole("button",{name:"Compare pair",exact:true}).click();await page.getByText("Shared / only A / only B: 0 / 1 / 1",{exact:false}).waitFor();
    await page.getByLabel("Exact tag B",{exact:true}).fill("#NOTE");await page.getByRole("button",{name:"Compare pair",exact:true}).click();await page.getByText("Select two different exact tags.",{exact:true}).waitFor();
    await page.evaluate(()=>window.graphFixture.update({readInlineTags:false}));await page.getByLabel("Browse source",{exact:true}).selectOption("inline");await page.getByRole("button",{name:"Apply source to search",exact:true}).click();await page.getByText("Inline source was not collected",{exact:false}).waitFor();
  }},
  {id:"GRAPH-03",name:"Real Worker/SVG, table identity, pending controls and scope revocation",async run({page,capture}){
    await page.getByLabel("Show direct naming hierarchy",{exact:true}).check();await page.getByRole("button",{name:"Scope overview",exact:true}).click();await page.locator(".tag-graph__canvas svg").waitFor();
    const value=await page.evaluate(()=>window.graphFixture.metrics().graph);assert(value.edges.some(e=>e.type==="hierarchy"));assert.equal(await page.locator(".tag-graph__edge").count(),value.edges.length);
    const workerCount=await page.evaluate(()=>window.graphFixture.resources().created);
    for(const name of ["Zoom in","Zoom out","Fit graph"])await page.getByRole("button",{name,exact:true}).click();
    await page.locator(".tag-graph__node circle").first().click();await page.getByRole("button",{name:"View in tag list",exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.graphFixture.resources().created),workerCount);await page.getByRole("button",{name:"Back to relationships",exact:true}).click();
    await page.getByLabel("Shared-file threshold",{exact:true}).fill("99");assert.equal((await page.evaluate(()=>window.graphFixture.metrics().query)).threshold,2);await page.getByText("New settings not applied",{exact:false}).waitFor();await capture("overview");
    await page.evaluate(()=>window.graphFixture.update({scope:{include:[{path:"Excluded",recursive:true}]}}));assert.equal(await page.locator(".tag-graph__canvas svg").count(),0);assert.equal(await page.locator(".tag-graph__file").count(),0);assert(!await page.locator(".tag-graph").textContent().then(t=>t.includes("Project/000.md")));
  }},
  {id:"GRAPH-04",name:"Interact during slow work, cancellation and failure preserve good data",async run({page,capture}){
    await page.getByRole("button",{name:"Scope overview",exact:true}).click();await page.locator(".tag-graph__canvas svg").waitFor();await page.evaluate(()=>window.graphFixture.fault(false,1800));
    await page.getByRole("button",{name:"Generate relationships",exact:true}).click();await page.waitForFunction(()=>["preparing","counting"].includes(document.querySelector(".tag-graph").dataset.phase));
    const started=Date.now();await page.getByLabel("Search all scoped tags",{exact:true}).fill("topic");assert(Date.now()-started<1000);assert.notEqual(await page.evaluate(()=>window.graphFixture.metrics().phase),"ready");
    await page.getByRole("button",{name:"Cancel calculation",exact:true}).click();await page.waitForFunction(()=>window.graphFixture.resources().activeWorkers===0);assert.equal(await page.locator(".tag-graph__canvas svg").count(),1);await capture("cancelled-old-result");
    await page.evaluate(()=>window.graphFixture.fault(true));await page.getByRole("button",{name:"Generate relationships",exact:true}).click();await page.getByText("Worker unavailable",{exact:false}).waitFor();assert.equal(await page.locator(".tag-graph__canvas svg").count(),1);
    await page.getByRole("button",{name:"Retry as relationship table",exact:true}).click();await page.waitForFunction(()=>window.graphFixture.metrics().phase==="ready");assert.equal(await page.locator(".tag-graph__canvas svg").count(),0);assert.equal(await page.locator(".tag-graph__error").textContent(),"");
  }},
  {id:"GRAPH-05",name:"Busy tab switching, index stale time and missing evidence remain read-only",async run({page}){
    await page.evaluate(()=>window.graphFixture.fault(false,1800));await page.getByRole("button",{name:"Scope overview",exact:true}).click();await page.getByRole("tab",{name:"History",exact:true}).click();assert.equal(await page.evaluate(()=>window.graphFixture.resources().activeWorkers),0);
    await page.getByRole("tab",{name:"Relationships",exact:true}).click();await page.evaluate(()=>window.graphFixture.fault(false));
    await page.getByLabel("Exact tag A",{exact:true}).fill("note");await page.getByLabel("Exact tag B",{exact:true}).fill("notes");await page.getByRole("button",{name:"Compare pair",exact:true}).click();await page.getByRole("button",{name:"Only A files",exact:true}).click();await page.locator(".tag-graph__file").first().waitFor();
    await page.evaluate(()=>window.graphFixture.update({freshness:"stale",vaultRevision:2,missingPaths:["Project/name-a.md"]}));await page.locator(".tag-graph__file").first().click();await page.getByText("File unavailable",{exact:false}).waitFor();await page.getByText("2026-10-28T00:00:00.000Z",{exact:false}).first().waitFor();assert.equal(await page.evaluate(()=>window.graphFixture.calls.length),0);
  }},
  {id:"GRAPH-06",name:"Twenty lifecycle cycles release real Worker URLs and subscriptions",async run({page}){
    for(let i=0;i<20;i++){await page.evaluate(()=>window.graphFixture.mount());await page.waitForFunction(()=>window.graphFixture.metrics().phase==="ready");await page.getByRole("button",{name:"Scope overview",exact:true}).click();await page.locator(".tag-graph__canvas svg").waitFor();await page.evaluate(()=>window.graphFixture.close());const r=await page.evaluate(()=>window.graphFixture.resources());assert.equal(r.activeWorkers,0);assert.equal(r.urls,0);assert.equal(r.listeners,0);}
  }}
];
