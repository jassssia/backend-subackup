import { describe, expect, it } from "vitest";
import { decryptConnectionString, encryptConnectionString } from "./credentials.crypto.js";

describe("credentials.crypto", () => {
  it("roundtrips encryption/decryption", () => {
    const key = "test_key_test_key_test_key_test_key_";
    const plain = "postgresql://user:pass@localhost:5432/db";

    const { encrypted, iv } = encryptConnectionString(plain, key);
    const out = decryptConnectionString(encrypted, iv, key);

    expect(out).toBe(plain);
  });
});

