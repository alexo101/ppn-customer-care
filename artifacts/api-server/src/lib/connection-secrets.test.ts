import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashDeploymentToken } from "./connection-secrets";

describe("connection secret encryption", () => {
  const previous = process.env.CONNECTION_ENCRYPTION_KEY;

  afterEach(() => {
    if (previous === undefined) delete process.env.CONNECTION_ENCRYPTION_KEY;
    else process.env.CONNECTION_ENCRYPTION_KEY = previous;
  });

  it("round trips encrypted values without exposing plaintext in the payload", () => {
    process.env.CONNECTION_ENCRYPTION_KEY = "test-key";
    const encrypted = encryptSecret("provider-token");
    expect(encrypted).not.toContain("provider-token");
    expect(decryptSecret(encrypted)).toBe("provider-token");
  });

  it("rejects tampered encrypted values", () => {
    process.env.CONNECTION_ENCRYPTION_KEY = "test-key";
    const encrypted = encryptSecret("provider-token");
    expect(() => decryptSecret(`${encrypted}x`)).toThrow();
  });

  it("hashes deployment tokens deterministically", () => {
    expect(hashDeploymentToken("token")).toBe(hashDeploymentToken("token"));
    expect(hashDeploymentToken("token")).not.toBe(hashDeploymentToken("other"));
  });
});
