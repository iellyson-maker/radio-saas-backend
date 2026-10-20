const test = require("node:test");
const assert = require("node:assert/strict");
const { requireAdminToken } = require("../server");

function invokeGuard(token, authorization) {
  if (token === null) delete process.env.API_ADMIN_TOKEN;
  else process.env.API_ADMIN_TOKEN = token;
  let nextCalled = false;
  let statusCode = 200;
  let body = null;
  const req = { get: name => name.toLowerCase() === "authorization" ? authorization : undefined };
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; }
  };
  requireAdminToken(req, res, () => { nextCalled = true; });
  return { nextCalled, statusCode, body };
}

test("organization API guard fails closed without a strong admin token", () => {
  const prior = process.env.API_ADMIN_TOKEN;
  try {
    assert.equal(invokeGuard(null, "Bearer test").statusCode, 503);
    assert.equal(invokeGuard("short", "Bearer short").statusCode, 503);
    assert.equal(invokeGuard("x".repeat(48), undefined).statusCode, 401);
    assert.equal(invokeGuard("x".repeat(48), "Bearer " + "y".repeat(48)).statusCode, 401);
    const accepted = invokeGuard("x".repeat(48), "Bearer " + "x".repeat(48));
    assert.equal(accepted.nextCalled, true);
    assert.equal(accepted.statusCode, 200);
  } finally {
    if (prior === undefined) delete process.env.API_ADMIN_TOKEN;
    else process.env.API_ADMIN_TOKEN = prior;
  }
});
