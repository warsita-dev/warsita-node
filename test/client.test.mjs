import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";

import { OPERATIONS, Warsita, WarsitaError, verifyWebhook } from "../dist/esm/index.js";

// fakeFetch answers each call with the next response and records what was sent.
function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: new URL(url), init, body: typeof init.body === "string" ? JSON.parse(init.body) : init.body });
    const r = responses.shift() ?? { status: 200, body: {} };
    if (r instanceof Error) throw r;
    return new Response(r.status === 204 ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers });
  };
  fn.calls = calls;
  return fn;
}

test("every operation in openapi.yaml has a method, and every method exists", () => {
  const spec = parse(readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8"));
  const ids = Object.values(spec.paths).flatMap((ops) => Object.values(ops).map((op) => op.operationId).filter(Boolean));
  assert.deepEqual([...ids].sort(), Object.keys(OPERATIONS).sort());
  const client = new Warsita({ apiKey: "wsk_test" });
  for (const path of Object.values(OPERATIONS)) {
    const fn = path.split(".").reduce((obj, key) => obj?.[key], client);
    assert.equal(typeof fn, "function", path);
  }
});

test("send uses the API key, an idempotency key, and unwraps data", async () => {
  const fetch = fakeFetch({ status: 202, body: { data: { id: "msg_1", status: "queued" } } });
  const warsita = new Warsita({ apiKey: "wsk_test", fetch });
  const m = await warsita.messages.send({ to: "+6281234567890", text: "Hi" });
  assert.deepEqual(m, { id: "msg_1", status: "queued" });
  const { url, init, body } = fetch.calls[0];
  assert.equal(url.href, "https://api.warsita.com/v1/messages");
  assert.equal(init.headers.Authorization, "Bearer wsk_test");
  assert.match(init.headers["Idempotency-Key"], /^[0-9a-f-]{36}$/);
  assert.deepEqual(body, { to: "+6281234567890", text: "Hi" });
});

test("a token adds session_id: in the body for POST, in the query otherwise", async () => {
  const fetch = fakeFetch({ status: 202, body: { data: {} } }, { status: 200, body: { data: [] } }, { status: 200, body: { data: [] } });
  const warsita = new Warsita({ apiKey: "wsp_token", sessionId: "ses_a", fetch });
  await warsita.messages.send({ to: "+6281234567890", text: "Hi" });
  await warsita.groups.list();
  await warsita.groups.list({ sessionId: "ses_b" });
  assert.equal(fetch.calls[0].body.session_id, "ses_a");
  assert.equal(fetch.calls[1].url.searchParams.get("session_id"), "ses_a");
  assert.equal(fetch.calls[2].url.searchParams.get("session_id"), "ses_b");
  await assert.rejects(new Warsita({ apiKey: "wsp_token", fetch }).contacts.list(), /sessionId/);
});

test("responses with more than data are returned whole; 204 is undefined", async () => {
  const fetch = fakeFetch({ status: 201, body: { session: { id: "ses_1" }, api_key: "wsk_new" } }, { status: 204 });
  const warsita = new Warsita({ apiKey: "wsp_token", fetch });
  assert.deepEqual(await warsita.sessions.create({ name: "Support" }), { session: { id: "ses_1" }, api_key: "wsk_new" });
  assert.equal(await warsita.sessions.restart("ses_1"), undefined);
  assert.equal(fetch.calls[1].url.pathname, "/v1/sessions/ses_1/restart");
});

test("rate limits are retried after Retry-After; a send keeps its idempotency key", async () => {
  const fetch = fakeFetch(
    { status: 429, body: { error: { code: "rate_limited", message: "Slow down" } }, headers: { "Retry-After": "0" } },
    { status: 503, body: {} },
    { status: 202, body: { data: { id: "msg_1" } } },
  );
  const warsita = new Warsita({ apiKey: "wsk_test", fetch });
  await warsita.messages.send({ to: "+6281234567890", text: "Hi" });
  assert.equal(fetch.calls.length, 3);
  const keys = new Set(fetch.calls.map((c) => c.init.headers["Idempotency-Key"]));
  assert.equal(keys.size, 1);
});

test("server errors on calls that are not idempotent are not retried", async () => {
  const fetch = fakeFetch({ status: 504, body: { error: { code: "runtime_timeout", message: "WhatsApp did not answer in time." } } });
  const warsita = new Warsita({ apiKey: "wsk_test", fetch });
  await assert.rejects(warsita.groups.create({ name: "Team", participants: ["+6281234567890"] }), (err) => {
    assert.ok(err instanceof WarsitaError);
    assert.equal(err.status, 504);
    assert.equal(err.code, "runtime_timeout");
    return true;
  });
  assert.equal(fetch.calls.length, 1);
});

test("path parameters are escaped and uploads are multipart", async () => {
  const fetch = fakeFetch({ status: 200, body: { data: {} } }, { status: 201, body: { data: { id: "med_1" } } });
  const warsita = new Warsita({ apiKey: "wsk_test", fetch });
  await warsita.groups.get("120363012345678901@g.us");
  assert.equal(fetch.calls[0].url.pathname, "/v1/groups/120363012345678901%40g.us");
  const media = await warsita.media.upload(new Uint8Array([1, 2, 3]), { filename: "a.png", contentType: "image/png" });
  assert.equal(media.id, "med_1");
  assert.ok(fetch.calls[1].init.body instanceof FormData);
  assert.equal(fetch.calls[1].init.headers["Content-Type"], undefined);
});

test("verifyWebhook accepts a valid signature and refuses forged or old ones", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ event: "messages.received", session_id: "ses_1", timestamp: "2026-10-28T00:00:00Z", data: { text: "Hi" } });
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
  assert.equal(verifyWebhook(body, sig, secret).data.text, "Hi");
  assert.throws(() => verifyWebhook(body, sig, "whsec_other"), /does not match/);
  assert.throws(() => verifyWebhook(body + " ", sig, secret), /does not match/);
  assert.throws(() => verifyWebhook(body, sig, secret, { now: (t + 600) * 1000 }), /too old/);
  assert.throws(() => verifyWebhook(body, undefined, secret), /missing/);
});
