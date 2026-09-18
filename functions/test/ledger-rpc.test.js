import test from "node:test";
import assert from "node:assert/strict";
import { rpc } from "../mainnet/ledger.js";

test("missing snapshot retries retain exact hash and parameters", async () => {
  const original = global.fetch,
    calls = [];
  global.fetch = async (_url, opts) => {
    calls.push(JSON.parse(opts.body));
    return {
      ok: true,
      json: async () => ({
        result:
          calls.length < 3
            ? { error: calls.length === 1 ? "ledgerNotFound" : "lgrNotFound" }
            : { ledger_hash: "A".repeat(64), ledger_index: 10, offers: [] },
      }),
    };
  };
  try {
    const r = await rpc("book_offers", {
      ledger_hash: "A".repeat(64),
      limit: 100,
    });
    assert.equal(r.ledger_index, 10);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0], calls[1]);
    assert.deepEqual(calls[1], calls[2]);
  } finally {
    global.fetch = original;
  }
});

test("persistent missing snapshots stop after three attempts with actionable error", async () => {
  const original = global.fetch;
  let count = 0;
  global.fetch = async () => {
    count++;
    return {
      ok: true,
      json: async () => ({ result: { error: "ledgerNotFound" } }),
    };
  };
  try {
    await assert.rejects(
      () => rpc("account_info", { ledger_hash: "A".repeat(64) }),
      (e) =>
        e.code === "ledgerNotFound" && /Refresh and try again/.test(e.message),
    );
    assert.equal(count, 3);
  } finally {
    global.fetch = original;
  }
});

test("submissions and unrelated errors are never automatically retried", async () => {
  const original = global.fetch;
  try {
    for (const [method, params, error] of [
      ["submit", { tx_blob: "test-only" }, "ledgerNotFound"],
      ["account_info", { ledger_hash: "A".repeat(64) }, "actNotFound"],
      ["tx", { transaction: "A".repeat(64) }, "txnNotFound"],
    ]) {
      let count = 0;
      global.fetch = async () => {
        count++;
        return { ok: true, json: async () => ({ result: { error } }) };
      };
      await assert.rejects(
        () => rpc(method, params),
        (e) => e.code === error,
      );
      assert.equal(count, 1);
    }
  } finally {
    global.fetch = original;
  }
});
