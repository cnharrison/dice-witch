import { describe, expect, it, vi } from "vitest";
import {
  isWorkerSecretSource,
  readWorkerSecret,
} from "../../packages/worker-secrets/src";

describe("Worker secret sources", () => {
  it("reads a Cloudflare Secrets Store binding", async () => {
    const get = vi.fn(() => Promise.resolve("stored-secret"));

    await expect(readWorkerSecret({ get }, "TEST_SECRET")).resolves.toBe(
      "stored-secret",
    );
    expect(get).toHaveBeenCalledOnce();
  });

  it("retains explicit per-Worker secret compatibility for development", async () => {
    await expect(readWorkerSecret("development-secret", "TEST_SECRET"))
      .resolves.toBe("development-secret");
  });

  it("rejects missing, blank, or malformed sources", async () => {
    expect(isWorkerSecretSource({ get: vi.fn() })).toBe(true);
    expect(isWorkerSecretSource({})).toBe(false);
    await expect(readWorkerSecret("", "TEST_SECRET")).rejects.toThrow(
      "TEST_SECRET is invalid",
    );
    await expect(
      readWorkerSecret({ get: () => Promise.resolve(" padded ") }, "TEST_SECRET"),
    ).rejects.toThrow("TEST_SECRET is invalid");
  });
});
