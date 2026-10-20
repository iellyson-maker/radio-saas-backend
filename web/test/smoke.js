const { spawn } = require("node:child_process");
const path = require("node:path");
const assert = require("node:assert/strict");

const port = 3100 + Math.floor(Math.random() * 1000);
const root = path.resolve(__dirname, "..");
const child = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
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
    assert.equal(health.ok, true);
    assert.equal(health.service, "qolan-studio-web");
    assert.equal(health.product, "Qolan Studio");
    assert.equal(health.version, "0.3.0");

    const pageResponse = await fetch(base + "/");
    assert.equal(pageResponse.status, 200);
    const page = await pageResponse.text();
    assert.match(page, /Qolan Studio/);
    assert.match(page, /Console de estúdio/);
    assert.match(page, /Cartwall/);
    assert.match(page, /styles\.css\?v=0\.3\.0/);
    assert.match(page, /app\.js\?v=0\.3\.0/);
    assert.match(page, /\.view\s*\{\s*display:\s*none\s*;/);
    assert.match(page, /\.view\.active\s*\{\s*display:\s*block\s*;/);
    for (const feature of ["view-console", "view-library", "view-programming", "view-commercials", "view-logs", "view-diagnostics", "view-settings"]) {
      assert.ok(page.includes('id="' + feature + '"'), "Missing UI module: " + feature);
    }
    assert.match(page, /Prova de veiculação/);
    assert.match(page, /não é um motor de transmissão 24\/7/i);

    const appResponse = await fetch(base + "/app.js?v=0.3.0");
    assert.equal(appResponse.status, 200);
    const appJs = await appResponse.text();
    assert.match(appJs, /indexedDB\.open/);
    assert.match(appJs, /scheduleTick/);
    assert.match(appJs, /play-complete/);
    assert.match(appJs, /classList\.toggle\("playing",playing\)/);

    const cssResponse = await fetch(base + "/styles.css?v=0.3.0");
    assert.equal(cssResponse.status, 200);
    assert.match(cssResponse.headers.get("content-type") || "", /text\/css/);
    const css = await cssResponse.text();
    assert.match(css, /\.view\s*\{\s*display:\s*none/);
    assert.match(css, /\.shell\s*\{\s*display:\s*grid/);
    assert.match(css, /\.state-pill\.playing/);
    assert.match(css, /\.cart-button/);
    console.log("Smoke tests passed: health/version 0.3.0, broadcast console labels, versioned assets, single active view, playback state styling, seven UI modules, persistent media, local scheduler and logs.");
  } catch (error) {
    console.error(error);
    console.error(output);
    process.exitCode = 1;
  } finally {
    child.kill();
  }
})();
