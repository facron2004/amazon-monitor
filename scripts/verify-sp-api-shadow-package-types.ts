import type { ShadowEvidenceValidation } from "./sp-api-shadow-evidence-validation.js";

export interface ShadowEvidencePackageIssue {
  path: string;
  message: string;
}

export interface ShadowEvidencePackageResult {
  ok: boolean;
  packagePath: string;
  files: string[];
  checksumFiles: number;
  evidence: ShadowEvidenceValidation | null;
  issues: ShadowEvidencePackageIssue[];
}
