import { describe, expect, it } from "vitest";
import { resolveAppViewState } from "./appViewState.js";

describe("resolveAppViewState", () => {
  it("prioritizes loading while a request is active", () => {
    expect(resolveAppViewState(true, "API 请求超时")).toBe("loading");
  });

  it("shows the error after loading finishes", () => {
    expect(resolveAppViewState(false, "API 请求超时")).toBe("error");
  });

  it("renders content after a successful load", () => {
    expect(resolveAppViewState(false, "")).toBe("content");
  });
});
