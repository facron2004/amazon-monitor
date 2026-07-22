import { describe, expect, it } from "vitest";
import { hasBusinessCapability } from "./types-identity.js";

describe("identity capability matrix", () => {
  it("matches the workflow roles from the PRD", () => {
    expect(hasBusinessCapability("admin", "manage_workflow")).toBe(true);
    expect(hasBusinessCapability("manager", "manage_workflow")).toBe(true);
    expect(hasBusinessCapability("operator", "manage_workflow")).toBe(true);
    expect(hasBusinessCapability("ads_operator", "manage_workflow")).toBe(true);
    expect(hasBusinessCapability("product_researcher", "manage_workflow")).toBe(true);
    expect(hasBusinessCapability("viewer", "manage_workflow")).toBe(false);
    expect(hasBusinessCapability("developer", "manage_workflow")).toBe(false);
  });

  it("keeps administration and data-source access restricted", () => {
    expect(hasBusinessCapability("admin", "manage_users")).toBe(true);
    expect(hasBusinessCapability("manager", "manage_users")).toBe(false);
    expect(hasBusinessCapability("admin", "manage_data_sources")).toBe(true);
    expect(hasBusinessCapability("manager", "manage_data_sources")).toBe(false);
  });

  it("limits task assignment to administrators and managers", () => {
    expect(hasBusinessCapability("admin", "assign_tasks")).toBe(true);
    expect(hasBusinessCapability("manager", "assign_tasks")).toBe(true);
    expect(hasBusinessCapability("operator", "assign_tasks")).toBe(false);
    expect(hasBusinessCapability("ads_operator", "assign_tasks")).toBe(false);
    expect(hasBusinessCapability("product_researcher", "assign_tasks")).toBe(false);
    expect(hasBusinessCapability("viewer", "assign_tasks")).toBe(false);
  });

  it("allows the PRD competitor-pool roles to manage watch state", () => {
    expect(hasBusinessCapability("admin", "manage_competitors")).toBe(true);
    expect(hasBusinessCapability("manager", "manage_competitors")).toBe(true);
    expect(hasBusinessCapability("operator", "manage_competitors")).toBe(true);
    expect(hasBusinessCapability("product_researcher", "manage_competitors")).toBe(true);
    expect(hasBusinessCapability("ads_operator", "manage_competitors")).toBe(false);
    expect(hasBusinessCapability("viewer", "manage_competitors")).toBe(false);
  });

  it("separates full and partial profit access", () => {
    expect(hasBusinessCapability("admin", "view_profit_details")).toBe(true);
    expect(hasBusinessCapability("manager", "view_profit_details")).toBe(true);
    expect(hasBusinessCapability("operator", "view_profit")).toBe(true);
    expect(hasBusinessCapability("operator", "view_profit_details")).toBe(false);
    expect(hasBusinessCapability("product_researcher", "view_profit")).toBe(true);
    expect(hasBusinessCapability("ads_operator", "view_profit")).toBe(false);
    expect(hasBusinessCapability("viewer", "view_profit")).toBe(false);
    expect(hasBusinessCapability("manager", "manage_profit")).toBe(true);
    expect(hasBusinessCapability("operator", "manage_profit")).toBe(false);
  });

  it("separates full, partial, and denied Ads access", () => {
    expect(hasBusinessCapability("admin", "manage_ads")).toBe(true);
    expect(hasBusinessCapability("manager", "view_ads_details")).toBe(true);
    expect(hasBusinessCapability("ads_operator", "manage_ads")).toBe(true);
    expect(hasBusinessCapability("operator", "view_ads")).toBe(true);
    expect(hasBusinessCapability("operator", "view_ads_details")).toBe(false);
    expect(hasBusinessCapability("operator", "manage_ads")).toBe(false);
    expect(hasBusinessCapability("product_researcher", "view_ads")).toBe(false);
    expect(hasBusinessCapability("viewer", "view_ads")).toBe(false);
  });
});
