import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflowPath = fileURLToPath(new URL("../.github/workflows/windows-release-verify.yml", import.meta.url));
const workflow = readFileSync(workflowPath, "utf8");

describe("Windows release workflow", () => {
  it("serializes releases and fails early without signing configuration", () => {
    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain("group: windows-release-${{ github.ref }}");
    expect(workflow).toContain('REQUIRE_CODE_SIGNATURE: "true"');
    expect(workflow).toContain('REQUIRE_INSTALLER_SIGNATURE: "true"');
    expect(workflow).toContain("if ([string]::IsNullOrWhiteSpace($env:CSC_LINK))");
  });

  it("requires strict release evidence and uploads every evidence file", () => {
    expect(workflow).toContain('REQUIRE_RELEASE_EVIDENCE: "true"');
    expect(workflow).toContain("if-no-files-found: error");
  });

  it("does not run the production audit twice", () => {
    expect(workflow.match(/npm run audit:production/g) ?? []).toHaveLength(0);
  });
});
