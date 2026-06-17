// Dependency-free tests for the Taiga egress relay Worker.
// Run: `node --test` (needs Node >= 21 for global Request/Response/Headers/fetch).
//
// The headline guard is `forwards no client-IP headers`: the relay exists to
// present a Cloudflare source IP to api.taiga.io. If x-forwarded-for (= the
// backend's Azure egress IP, auto-added by Cloudflare) ever reaches Taiga, its
// origin firewall DROPs the Azure range and returns 520. This test fails loudly
// if a future edit removes that header from STRIP_HEADERS.

import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const SECRET = "test-secret";
const TARGET = "https://api.taiga.io/api/v1/auth";

// Replace global fetch with a spy that records the outbound request and returns
// a benign 401 (so the Worker's 52x-retry path never engages).
function withFetchSpy(run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response('{"detail":"No active account found"}', {
      status: 401,
      headers: { "content-type": "application/json", "content-length": "33" },
    });
  };
  return Promise.resolve(run(calls)).finally(() => {
    globalThis.fetch = original;
  });
}

function relayRequest(extraHeaders = {}) {
  return new Request("https://relay.example/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-relay-secret": SECRET,
      "x-relay-target": TARGET,
      ...extraHeaders,
    },
    body: JSON.stringify({ username: "u", password: "p", type: "normal" }),
  });
}

const ENV = { RELAY_SECRET: SECRET };

test("forwards no client-IP / forwarding headers to Taiga", async () => {
  await withFetchSpy(async (calls) => {
    const res = await worker.fetch(
      relayRequest({
        "x-forwarded-for": "20.74.94.128",
        "x-real-ip": "20.74.94.128",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "relay.example",
        "cf-connecting-ip": "20.74.94.128",
        "cf-visitor": '{"scheme":"https"}',
        "cf-ew-via": "x",
        "cf-worker": "relay.example",
      }),
      ENV,
    );
    assert.equal(res.status, 401, "benign upstream status passes through");
    assert.equal(calls.length, 1, "exactly one upstream fetch");

    const { url, init } = calls[0];
    assert.equal(url, TARGET, "forwards to the real Taiga target");

    const leaks = [
      "x-forwarded-for",
      "x-real-ip",
      "x-forwarded-proto",
      "x-forwarded-host",
      "cf-connecting-ip",
      "cf-visitor",
      "cf-ew-via",
      "cf-worker",
    ];
    for (const h of leaks) {
      assert.equal(
        init.headers.get(h),
        null,
        `${h} must NOT be forwarded to Taiga (would leak the Azure IP -> 520)`,
      );
    }
    // Relay-control + framing headers are stripped too.
    for (const h of ["x-relay-secret", "x-relay-target", "host", "content-length"]) {
      assert.equal(init.headers.get(h), null, `${h} must be stripped`);
    }
    // The genuine payload header survives.
    assert.equal(init.headers.get("content-type"), "application/json");
  });
});

test("rejects a wrong relay secret with 403 and never calls upstream", async () => {
  await withFetchSpy(async (calls) => {
    const req = relayRequest({ "x-relay-secret": "wrong" });
    const res = await worker.fetch(req, ENV);
    assert.equal(res.status, 403);
    assert.equal(calls.length, 0, "must fail closed before any upstream fetch");
  });
});

test("fails closed (500) when RELAY_SECRET is unset", async () => {
  await withFetchSpy(async (calls) => {
    const res = await worker.fetch(relayRequest(), {});
    assert.equal(res.status, 500);
    assert.equal(calls.length, 0);
  });
});

test("rejects a non-allow-listed target host with 403", async () => {
  await withFetchSpy(async (calls) => {
    const req = relayRequest({ "x-relay-target": "https://evil.example/api/v1/auth" });
    const res = await worker.fetch(req, ENV);
    assert.equal(res.status, 403);
    assert.equal(calls.length, 0);
  });
});

test("rejects a missing target with 400", async () => {
  await withFetchSpy(async (calls) => {
    const req = new Request("https://relay.example/", {
      method: "POST",
      headers: { "x-relay-secret": SECRET },
    });
    const res = await worker.fetch(req, ENV);
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });
});

test("retries Cloudflare 52x then surfaces the final status", async () => {
  const original = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => {
    n += 1;
    return new Response("origin error", { status: 520 });
  };
  try {
    const res = await worker.fetch(relayRequest(), ENV);
    assert.equal(res.status, 520, "surfaces 520 after exhausting retries");
    assert.equal(n, 3, "tries 3 times on persistent 52x");
  } finally {
    globalThis.fetch = original;
  }
});
