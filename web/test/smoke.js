const { spawn } = require("node:child_process");
const path = require("node:path");
const assert = require("node:assert/strict");
const port = 3100 + Math.floor(Math.random() * 1000);
const root = path.resolve(__dirname, "..");
const child = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
child.stdout.on("data", chunk => { output += chunk.toString(); });
child.stderr.on("data", chunk => { output += chunk.toString(); });

(async () => {
  const base = "http://127.0.0.1:" + port;
  try {
    let healthResponse;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (child.exitCode !== null) throw new Error("Server exited early: " + output);
      try { healthResponse = await fetch(base + "/health"); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    assert.ok(healthResponse, "Server did not start in time");
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.ok, true); assert.equal(health.service, "qolan-studio-web");
    assert.equal(health.product, "Qolan Studio"); assert.equal(health.version, "0.5.1");

    const pageResponse = await fetch(base + "/"); assert.equal(pageResponse.status, 200);
    const page = await pageResponse.text();
    for (const text of ["Console de estúdio","Cartwall","Conteúdo ao vivo","Rádio visual / OBS","Montador de bloco",'id="view-live"','id="view-visual"','id="cartAudio"','id="buildRotationBtn"','id="obsConnectBtn"','id="newsSourceSelect"','id="liveNotes"']) {
      assert.ok(page.includes(text), "Missing UI element: " + text);
    }
    assert.match(page,/styles\\.css\\?v=0\\.5\\.1/); assert.match(page,/app\\.js\\?v=0\\.5\\.1/);
    assert.match(page,/\.view\s*\{\s*display:\s*none\s*;/);
    assert.match(page,/\.view\.active\s*\{\s*display:\s*block\s*;/);
    for (const view of ["console","library","programming","commercials","live","visual","logs","diagnostics","settings"]) assert.ok(page.includes('id="view-'+view+'"'),"Missing module "+view);

    const sources=await fetch(base+"/api/news-sources"); assert.equal(sources.status,200);
    const sourceJson=await sources.json(); assert.equal(sourceJson.ok,true);
    for (const id of ["agencia-brasil","radioagencia","politica","economia","esportes"]) assert.ok(sourceJson.sources.some(s=>s.id===id),"Missing feed "+id);
    const blocked=await fetch(base+"/api/news/not-allowed"); assert.equal(blocked.status,404);
    const unknownApi=await fetch(base+"/api/not-real"); assert.equal(unknownApi.status,404); assert.ok((unknownApi.headers.get("content-type")||"").includes("application/json"));
    assert.equal((await fetch(base+"/health")).headers.get("x-content-type-options"),"nosniff");

    const logicResponse=await fetch(base+"/logic.js?v=0.5.1"); assert.equal(logicResponse.status,200); assert.match(logicResponse.headers.get("content-type")||"",/javascript/);
    const logicText=await logicResponse.text(); for(const token of ["stationClockParts","collectDueItems","normalizeBackup"]) assert.ok(logicText.includes(token),"Missing deterministic core "+token);
    const appResponse=await fetch(base+"/app.js?v=0.5.1"); assert.equal(appResponse.status,200);
    const appText=await appResponse.text();
    for (const token of ["indexedDB.open","scheduleTick","stationClockParts","collectDueItems","mainAudio.addEventListener","play-complete","buildRotationBlock","playCart","SetCurrentProgramScene","GetSceneList","GetSourceScreenshot","loadNews"]) assert.ok(appText.includes(token),"Missing application behavior "+token);
    const cssResponse=await fetch(base+"/styles.css?v=0.5.1"); assert.equal(cssResponse.status,200);
    assert.match(cssResponse.headers.get("content-type")||"",/text\/css/);
    const css=await cssResponse.text();
    for (const token of [".studio-grid",".ops-metrics",".live-content-grid",".obs-workspace",".rotation-builder",".cart-live-label"]) assert.ok(css.includes(token),"Missing style "+token);
    console.log("Smoke tests passed: Qolan 0.5.1, operator workflow modules, rotation builder, separate cartwall audio, RSS allowlist/API, OBS WebSocket connector, responsive CSS.");
  } catch (error) {
    console.error(error); console.error(output); process.exitCode = 1;
  } finally { child.kill(); }
})();
