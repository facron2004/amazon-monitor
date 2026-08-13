import { describe, expect, it } from "vitest";
import { resolveReleaseArtifacts } from "./verify-signatures.mjs";

describe("release signature artifact selection", () => {
  it("matches the desktop package version to the NSIS installer", () => {
    const artifacts = resolveReleaseArtifacts("1.1.0", "C:\\release\\electron");
    expect(artifacts.unpacked).toContain("win-unpacked");
    expect(artifacts.unpacked).toMatch(/Amazon Monitor\.exe$/);
    expect(artifacts.installer).toMatch(/Amazon Monitor Setup 1\.1\.0\.exe$/);
  });

  it("does not select an installer from an unrelated version", () => {
    const artifacts = resolveReleaseArtifacts("2.0.0", "C:\\release\\electron");
    expect(artifacts.installer).toMatch(/Amazon Monitor Setup 2\.0\.0\.exe$/);
    expect(artifacts.installer).not.toMatch(/1\.1\.0/);
  });
});
