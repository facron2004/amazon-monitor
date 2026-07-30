import { afterEach, describe, expect, it } from "vitest";
import {
  decryptSpApiCredentials,
  encryptSpApiCredentials
} from "./sp-api-credentials.js";

const originalKey = process.env.DATA_SOURCE_CREDENTIALS_KEY;
const originalKeyVersion = process.env.DATA_SOURCE_CREDENTIALS_KEY_VERSION;

afterEach(() => {
  restoreEnv("DATA_SOURCE_CREDENTIALS_KEY", originalKey);
  restoreEnv("DATA_SOURCE_CREDENTIALS_KEY_VERSION", originalKeyVersion);
});

describe("SP-API credential encryption", () => {
  it("uses authenticated encryption bound to the owning organization and data source", () => {
    process.env.DATA_SOURCE_CREDENTIALS_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.DATA_SOURCE_CREDENTIALS_KEY_VERSION = "test-v1";
    const credentials = {
      lwaClientId: "amzn1.application-oa2-client.test",
      lwaClientSecret: "client-secret-not-to-return",
      lwaRefreshToken: "Atzr|refresh-token-not-to-return"
    };

    const encrypted = encryptSpApiCredentials(credentials, { orgId: 4, dataSourceId: 9 });

    expect(encrypted).toMatchObject({ keyVersion: "test-v1" });
    expect(encrypted.ciphertext).not.toContain(credentials.lwaClientSecret);
    expect(encrypted.ciphertext).not.toContain(credentials.lwaRefreshToken);
    expect(decryptSpApiCredentials(encrypted, { orgId: 4, dataSourceId: 9 })).toEqual(credentials);
    expect(() => decryptSpApiCredentials(encrypted, { orgId: 5, dataSourceId: 9 })).toThrow();
  });

  it("requires a base64-encoded 32-byte deployment key", () => {
    delete process.env.DATA_SOURCE_CREDENTIALS_KEY;
    expect(() => encryptSpApiCredentials({
      lwaClientId: "client",
      lwaClientSecret: "secret",
      lwaRefreshToken: "refresh"
    }, { orgId: 1, dataSourceId: 2 })).toThrow("DATA_SOURCE_CREDENTIALS_KEY is required");
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
