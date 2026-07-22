import { describe, expect, it } from "vitest";
import { canWriteForRole } from "./useWriteAccess";

describe("canWriteForRole", () => {
  it("uses the requested business capability", () => {
    expect(canWriteForRole("admin")).toBe(true);
    expect(canWriteForRole("manager")).toBe(true);
    expect(canWriteForRole("operator")).toBe(true);
    expect(canWriteForRole("ads_operator")).toBe(true);
    expect(canWriteForRole("product_researcher")).toBe(true);
    expect(canWriteForRole("viewer")).toBe(false);
    expect(canWriteForRole("developer")).toBe(false);
    expect(canWriteForRole(null)).toBe(false);

    expect(canWriteForRole("manager", "manage_rules")).toBe(true);
    expect(canWriteForRole("operator", "manage_rules")).toBe(false);
    expect(canWriteForRole("admin", "manage_data_sources")).toBe(true);
    expect(canWriteForRole("manager", "manage_data_sources")).toBe(false);
    expect(canWriteForRole("manager", "assign_tasks")).toBe(true);
    expect(canWriteForRole("operator", "assign_tasks")).toBe(false);
    expect(canWriteForRole("product_researcher", "manage_competitors")).toBe(true);
    expect(canWriteForRole("ads_operator", "manage_competitors")).toBe(false);
    expect(canWriteForRole("operator", "view_profit")).toBe(true);
    expect(canWriteForRole("operator", "view_profit_details")).toBe(false);
    expect(canWriteForRole("manager", "manage_profit")).toBe(true);
    expect(canWriteForRole("ads_operator", "view_profit")).toBe(false);
  });
});
