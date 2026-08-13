import { describe, expect, it } from "vitest";
import {
  isSignatureRequired,
  normalizeSignatureStatus,
  readAuthenticodeStatus,
  verifySignature,
} from "./verify-signature.mjs";

describe("release signature gate", () => {
  it("only enables strict verification for the explicit true value", () => {
    expect(isSignatureRequired("true")).toBe(true);
    expect(isSignatureRequired("TRUE")).toBe(true);
    expect(isSignatureRequired("1")).toBe(false);
    expect(isSignatureRequired(undefined)).toBe(false);
  });

  it("normalizes PowerShell output to the final status line", () => {
    expect(normalizeSignatureStatus("\r\nValid\r\n")).toBe("Valid");
    expect(normalizeSignatureStatus("")).toBe("Unavailable");
  });

  it("accepts an unsigned local package only when strict mode is off", () => {
    const fileExists = () => true;
    const readStatus = () => ({ status: "NotSigned" });
    expect(verifySignature("release/Amazon Monitor.exe", { fileExists, readStatus }).ok).toBe(true);
    expect(
      verifySignature("release/Amazon Monitor.exe", { required: true, fileExists, readStatus }),
    ).toMatchObject({ ok: false, status: "NotSigned", required: true });
  });

  it("fails strict verification outside Windows", () => {
    const result = verifySignature("release/Amazon Monitor.exe", {
      required: true,
      platformName: "linux",
      fileExists: () => true,
      readStatus: () => readAuthenticodeStatus("release/Amazon Monitor.exe", { platformName: "linux" }),
    });
    expect(result).toMatchObject({ ok: false, status: "UnsupportedPlatform" });
  });

  it("passes when PowerShell reports a valid signature", () => {
    const result = readAuthenticodeStatus("C:\\release\\Amazon Monitor.exe", {
      platformName: "win32",
      run: () => ({ status: 0, stdout: "Valid\r\n", stderr: "" }),
    });
    expect(result).toEqual({ status: "Valid", detail: undefined });
  });
});
