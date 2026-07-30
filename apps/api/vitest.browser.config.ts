import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.browser.test.ts", "src/**/browser.test.ts"]
  }
});
