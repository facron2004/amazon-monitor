import { describe, expect, it } from "vitest";
import { isoDate } from "./index";

describe("date helpers", () => {
  it("uses Asia/Shanghai as the default business date instead of UTC", () => {
    expect(isoDate(new Date("2026-05-31T15:59:00.000Z"))).toBe("2026-05-31");
    expect(isoDate(new Date("2026-05-31T16:00:00.000Z"))).toBe("2026-06-01");
    expect(isoDate(new Date("2026-05-31T16:00:00.000Z"), "UTC")).toBe("2026-05-31");
  });
});
