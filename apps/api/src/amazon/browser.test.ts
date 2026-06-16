import { describe, expect, it, vi } from "vitest";
import type { Locator, Page } from "playwright";
import { setDeliveryZipCode } from "./browser.js";

describe("setDeliveryZipCode", () => {
  it("tries the next visible location trigger when the first one does not open the editor", async () => {
    const page = createMockPage();
    const firstTrigger = page.define("#nav-global-location-popover-link", { visible: true });
    const secondTrigger = page.define("#glow-ingress-block", {
      visible: true,
      onClick: () => {
        page.define("#GLUXZipUpdateInput", { visible: true });
        page.define('#GLUXZipUpdate input[type="submit"]', {
          visible: true,
          onClick: () => applyZip(page, "10001")
        });
      }
    });
    page.define("#nav-global-location-popover-link, #glow-ingress-block, #nav-global-location-slot", {
      visible: true,
      text: "Deliver to"
    });
    page.define("body", { visible: true, text: "Amazon home page" });

    await setDeliveryZipCode(page as unknown as Page, "amazon.com", "10001");

    expect(firstTrigger.click).toHaveBeenCalledTimes(1);
    expect(secondTrigger.click).toHaveBeenCalledTimes(1);
    expect(page.define("#GLUXZipUpdateInput").fill).toHaveBeenNthCalledWith(1, "");
    expect(page.define("#GLUXZipUpdateInput").fill).toHaveBeenNthCalledWith(2, "10001");
  });

  it("uses the select-location fallback when the editor requires an extra step", async () => {
    const page = createMockPage();
    const trigger = page.define("#nav-global-location-popover-link", {
      visible: true,
      onClick: () => {
        page.define('input[data-action-type="SELECT_LOCATION"]', {
          visible: true,
          onClick: () => {
            page.define("#GLUXZipUpdateInput", { visible: true });
            page.define('#GLUXZipUpdate input[type="submit"]', {
              visible: true,
              onClick: () => applyZip(page, "30301")
            });
          }
        });
      }
    });
    const selectLocation = page.define('input[data-action-type="SELECT_LOCATION"]', { visible: false });
    page.define("#nav-global-location-popover-link, #glow-ingress-block, #nav-global-location-slot", {
      visible: true,
      text: "Deliver to"
    });
    page.define("body", { visible: true, text: "Amazon home page" });

    await setDeliveryZipCode(page as unknown as Page, "amazon.com", "30301");

    expect(trigger.click).toHaveBeenCalledTimes(1);
    expect(selectLocation.click).toHaveBeenCalledTimes(1);
    expect(page.define("#GLUXZipUpdateInput").fill).toHaveBeenNthCalledWith(2, "30301");
  });
});

function createMockPage(): MockPage {
  return new MockPage();
}

function applyZip(page: MockPage, zip: string): void {
  page.define("#nav-global-location-popover-link, #glow-ingress-block, #nav-global-location-slot", {
    visible: true,
    text: `Deliver to ${zip}`
  });
  page.define("body", {
    visible: true,
    text: `Deliver to ${zip}\nAmazon home page`
  });
}

type MockLocatorOptions = {
  visible?: boolean;
  text?: string;
  onClick?: () => void;
};

class MockLocator {
  visible: boolean;
  text: string;
  onClick?: () => void;
  readonly click = vi.fn(async () => {
    if (!this.visible) {
      throw new Error(`Locator not visible: ${this.selector}`);
    }
    this.onClick?.();
  });
  readonly fill = vi.fn(async (_value: string) => undefined);

  constructor(
    private readonly selector: string,
    onClick?: () => void,
    options: MockLocatorOptions = {}
  ) {
    this.onClick = onClick;
    this.visible = options.visible ?? false;
    this.text = options.text ?? "";
  }

  first(): Locator {
    return this as unknown as Locator;
  }

  async waitFor(): Promise<void> {
    if (!this.visible) {
      throw new Error(`Locator not visible: ${this.selector}`);
    }
  }

  async innerText(): Promise<string> {
    return this.text;
  }
}

class MockPage {
  private readonly locators = new Map<string, MockLocator>();

  readonly goto = vi.fn(async () => undefined);
  readonly waitForLoadState = vi.fn(async () => undefined);
  readonly waitForTimeout = vi.fn(async () => undefined);
  readonly reload = vi.fn(async () => undefined);

  readonly locator = vi.fn((selector: string) => this.define(selector));

  define(selector: string, options: MockLocatorOptions = {}): MockLocator {
    const existing = this.locators.get(selector);
    if (existing) {
      if (options.visible !== undefined) existing.visible = options.visible;
      if (options.text !== undefined) existing.text = options.text;
      if (options.onClick !== undefined) existing.onClick = options.onClick;
      return existing;
    }
    const locator = new MockLocator(selector, options.onClick, options);
    this.locators.set(selector, locator);
    return locator;
  }
}
