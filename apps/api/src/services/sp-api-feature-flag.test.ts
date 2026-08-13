import { describe, expect, it } from "vitest";
import { isSpApiConnectorEnabled } from "./sp-api-feature-flag.js";

describe("SP-API connector feature flag", () => {
  const cases: Array<[string | undefined, boolean]> = [
    ["true", true],
    [" TRUE ", true],
    ["false", false],
    ["", false],
    [undefined, false]
  ];

  it.each(cases)("normalizes %s to %s", (value, expected) => {
    expect(isSpApiConnectorEnabled({ SP_API_CONNECTOR_ENABLED: value })).toBe(expected);
  });
});
