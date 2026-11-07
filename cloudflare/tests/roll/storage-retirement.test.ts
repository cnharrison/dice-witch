import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// These fixtures use the real owners and workerd SQLite storage. No provider I/O.
describe("empty storage retirement", () => {
  it("does not allocate schema for missing RollWork reads or duplicate retirement", async () => {
    const stub = env.ROLL_WORK.getByName("retirement-missing");
    await expect(stub.deliveryStatus()).resolves.toEqual({ state: "missing" });
    await expect(stub.getSaveRollIntent()).resolves.toEqual({ status: "missing" });
    await expect(stub.retireEmptyStorage()).resolves.toBe("retired");
    await expect(stub.retireEmptyStorage()).resolves.toBe("retired");
    await evictDurableObject(stub);
    await expect(stub.deliveryStatus()).resolves.toEqual({ state: "missing" });
    await runInDurableObject(stub, (_instance, state) => {
      expect(state.storage.sql.exec(
        "SELECT name FROM sqlite_master WHERE name = 'roll_work'",
      ).toArray()).toEqual([]);
    });
  });

  it("refuses work and reclaims a legacy empty RollWork allocation", async () => {
    const stub = env.ROLL_WORK.getByName("retirement-legacy");
    await stub.prepare({ notation: ["1d6"], repetitions: 1 });
    await expect(stub.retireEmptyStorage()).resolves.toBe("retained");
    const allocated = await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("DELETE FROM roll_work");
      return state.storage.sql.databaseSize;
    });
    await expect(stub.retireEmptyStorage()).resolves.toBe("retired");
    const retired = await runInDurableObject(stub, async (_instance, state) => {
      expect(await state.storage.getAlarm()).toBeNull();
      return state.storage.sql.databaseSize;
    });
    console.info(JSON.stringify({ fixture: "empty-roll-work", allocated, retired }));
    expect(retired).toBeLessThan(allocated);
    await evictDurableObject(stub);
    await expect(stub.deliveryStatus()).resolves.toEqual({ state: "missing" });
    // Explicit deterministic preparation remains a supported computation API.
    await expect(stub.prepare({ notation: ["1d6"], repetitions: 1 }))
      .resolves.toMatchObject({ status: "created" });
  });

  it("refuses unknown schema and KV state without deleting either", async () => {
    const stub = env.LOG_WORK.getByName("retirement-unknown");
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec("CREATE TABLE future_receipt (id TEXT PRIMARY KEY)");
      await state.storage.put("receipt", "uncertain");
    });
    await expect(stub.retireEmptyStorage()).resolves.toBe("retained");
    await runInDurableObject(stub, async (_instance, state) => {
      expect(await state.storage.get("receipt")).toBe("uncertain");
      state.storage.sql.exec("DROP TABLE future_receipt");
    });
    await expect(stub.retireEmptyStorage()).resolves.toBe("retained");
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.delete("receipt");
    });
    await expect(stub.retireEmptyStorage()).resolves.toBe("retired");
    await expect(stub.artifactStatus()).resolves.toEqual({ state: "missing" });
  });
});

// Exercise the maintenance transport against a real isolated namespace.
it("fences maintenance by authorization and target identity", async () => {
  const { default: maintenance } = await import("../../tools/storage-retirement/worker");
  const bindings = {
    TARGET: env.ROLL_WORK,
    RETIREMENT_TOKEN: "isolated-test-token",
    ACCOUNT_ID: "a".repeat(32),
    NAMESPACE_ID: "b".repeat(32),
  };
  const id = env.ROLL_WORK.idFromName("maintenance-transport").toString();
  const request = (token: string, namespaceId: string) => new Request("https://maintenance.invalid/retire", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ accountId: bindings.ACCOUNT_ID, namespaceId, id }),
  });
  expect((await maintenance.fetch(request("wrong", bindings.NAMESPACE_ID), bindings)).status).toBe(401);
  expect((await maintenance.fetch(request(bindings.RETIREMENT_TOKEN, "c".repeat(32)), bindings)).status).toBe(409);
  const response = await maintenance.fetch(request(bindings.RETIREMENT_TOKEN, bindings.NAMESPACE_ID), bindings);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "retired" });
});
