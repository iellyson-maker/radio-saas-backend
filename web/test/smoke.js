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
      try {
        healthResponse = await fetch(base + "/health");
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    assert.ok(healthResponse, "Server did not start in time");
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.ok, true);
    assert.equal(health.service, "qolan-studio-web");
    assert.equal(health.product, "Qolan Studio");

    const pageResponse = await fetch(base + "/");
    assert.equal(pageResponse.status, 200);
    const page = await pageResponse.text();
    assert.match(page, /Qolan Studio/);
    console.log("Smoke tests passed: /health and home page.");
  } catch (error) {
    console.error(error);
    console.error(output);
    process.exitCode = 1;
  } finally {
    child.kill();
  }
})();
