const test = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../server");

test("organization endpoints fail closed without a strong admin token", async () => {
  const prior = process.env.API_ADMIN_TOKEN;
  const server = app.listen(0, "127.0.0.1");
  try {
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/organizations`;
    delete process.env.API_ADMIN_TOKEN;
    assert.equal((await fetch(url)).status, 503);
    process.env.API_ADMIN_TOKEN = "correct-but-not-long-enough";
    assert.equal((await fetch(url)).status, 503);
    process.env.API_ADMIN_TOKEN = "x".repeat(48);
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { authorization: "Bearer " + "y".repeat(48) } })).status, 401);
  } finally {
    if (prior === undefined) delete process.env.API_ADMIN_TOKEN;
    else process.env.API_ADMIN_TOKEN = prior;
    await new Promise(resolve => server.close(resolve));
  }
});
