import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { limiterIdentity } from "../server/client-address.mjs";
import { buildServer } from "../server/app.mjs";

const origin = "https://synthetic.example.test";
function identity(value, peer = "127.0.0.1", enabled = true, rawHeaders) {
  return limiterIdentity(
    {
      socket: { remoteAddress: peer },
      headers: { "x-forwarded-for": value },
      raw: {
        rawHeaders:
          rawHeaders || (value === undefined ? [] : ["X-Forwarded-For", value]),
      },
    },
    enabled,
  );
}
test("limiter identity accepts only one canonical IP from the explicitly enabled loopback proxy", () => {
  assert.equal(identity("198.51.100.1"), "apache:198.51.100.1");
  assert.equal(identity("2001:0DB8:0:0::1"), "apache:2001:db8::1");
  assert.equal(identity("::ffff:198.51.100.1"), identity("198.51.100.1"));
  assert.equal(identity("::FFFF:c633:6401"), identity("198.51.100.1"));
  for (const value of [
    undefined,
    "",
    "example.test",
    "198.51.100.1:80",
    "[::1]",
    "::1%lo0",
    "198.51.100.1/32",
    "198.51.100.1, 203.0.113.1",
    "for=198.51.100.1",
    ["198.51.100.1"],
  ])
    assert.equal(identity(value), "socket:127.0.0.1");
  assert.equal(
    identity("198.51.100.1", "127.0.0.1", true, [
      "X-Forwarded-For",
      "198.51.100.1",
      "x-FORWARDED-for",
      "203.0.113.1",
    ]),
    "socket:127.0.0.1",
  );
  assert.equal(identity("198.51.100.1", "203.0.113.1"), "socket:203.0.113.1");
  assert.equal(identity("198.51.100.1", "::1"), "socket:::1");
  assert.equal(
    identity("198.51.100.1", "127.0.0.1", false),
    "socket:127.0.0.1",
  );
});
async function server(t, apacheProxy = true) {
  const app = await buildServer({
    vaultKey: randomBytes(32),
    origin,
    apacheProxy,
    passwordCheck: async () => false,
  });
  t.after(() => app.close());
  return app;
}
function login(app, i, client, options = {}) {
  return app.inject({
    url: i % 2 ? "/api/auth/login" : "/backoffice/api/auth/login",
    method: "POST",
    remoteAddress: "127.0.0.1",
    ...options,
    headers: { origin, "x-forwarded-for": client, ...options.headers },
    payload: {
      email: `synthetic-${i}@example.test`,
      password: "synthetic-only",
      code: "000000",
    },
  });
}
test("one proxied visitor cannot exhaust another's sign-in limit; both auth aliases share its budget", async (t) => {
  const app = await server(t);
  for (let i = 0; i < 20; i++)
    assert.equal((await login(app, i, "198.51.100.1")).statusCode, 401);
  assert.equal((await login(app, 20, "198.51.100.1")).statusCode, 429);
  assert.equal((await login(app, 21, "203.0.113.1")).statusCode, 401);
});
test("ordinary and registration route limits also isolate proxy visitors", async (t) => {
  const app = await server(t);
  for (let i = 0; i < 241; i++) {
    const r = await app.inject({
      url: "/backoffice/health.json",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": "198.51.100.2" },
    });
    assert.equal(r.statusCode, i < 240 ? 200 : 429);
  }
  assert.equal(
    (
      await app.inject({
        url: "/backoffice/health.json",
        remoteAddress: "127.0.0.1",
        headers: { "x-forwarded-for": "203.0.113.2" },
      })
    ).statusCode,
    200,
  );
  for (let i = 0; i < 11; i++) {
    const r = await app.inject({
      url: "/backoffice/api/register/begin",
      method: "POST",
      remoteAddress: "127.0.0.1",
      headers: { origin, "x-forwarded-for": "198.51.100.2" },
      payload: {},
    });
    assert.equal(r.statusCode, i < 10 ? 400 : 429);
  }
  assert.equal(
    (
      await app.inject({
        url: "/backoffice/api/register/begin",
        method: "POST",
        remoteAddress: "127.0.0.1",
        headers: { origin, "x-forwarded-for": "203.0.113.2" },
        payload: {},
      })
    ).statusCode,
    400,
  );
});
test("direct mode and nontrusted peers cannot rotate headers to escape their sign-in limit", async (t) => {
  for (const [enabled, peer] of [
    [false, "127.0.0.1"],
    [true, "203.0.113.9"],
  ]) {
    const app = await server(t, enabled);
    for (let i = 0; i < 21; i++) {
      const r = await login(app, i, `198.51.100.${i + 1}`, {
        remoteAddress: peer,
        headers: {
          forwarded: `for=198.51.100.${i + 1}`,
          "x-real-ip": `198.51.100.${i + 1}`,
          "x-forwarded-host": "localhost",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(r.statusCode, i < 20 ? 401 : 429);
    }
  }
});
test("changing proxy address cannot reset the separate account failure limit", async (t) => {
  const app = await server(t);
  for (let i = 0; i < 6; i++) {
    const r = await app.inject({
      url: i % 2 ? "/api/auth/login" : "/backoffice/api/auth/login",
      method: "POST",
      remoteAddress: "127.0.0.1",
      headers: { origin, "x-forwarded-for": `198.51.100.${i + 1}` },
      payload: {
        email: "same-account@example.test",
        password: "synthetic-only",
        code: "000000",
      },
    });
    assert.equal(r.statusCode, i < 5 ? 401 : 429);
  }
});
