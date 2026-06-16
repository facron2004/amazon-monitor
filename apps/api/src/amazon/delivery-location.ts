import type { Locator, Page } from "playwright";
import { defaultZipCode, normalizeMarketplaceHost, timeoutMs } from "./config.js";

const LOCATION_TRIGGER_SELECTORS = [
  "#nav-global-location-popover-link",
  "#glow-ingress-block",
  "#glow-ingress-line2",
  '#nav-global-location-slot a[href]',
  "#nav-global-location-slot button",
  '[data-csa-c-slot-id="nav_locat_sign_in"] a[href]',
  '[data-csa-c-slot-id="nav_locat_sign_in"] button'
];

const ZIP_INPUT_SELECTORS = [
  "#GLUXZipUpdateInput",
  'input[name="glowZipcode"]',
  'input[data-action="GLUXPostalInputAction"]',
  'input[placeholder*="ZIP"]',
  'input[placeholder*="zip"]',
  'input[placeholder*="postal"]',
  "#GLUXZipUpdateInput_0"
];

const SELECT_LOCATION_BUTTON_SELECTORS = [
  'input[data-action-type="SELECT_LOCATION"]',
  "#GLUXCountryValue",
  '.a-popover-wrapper input[data-action-type="SELECT_LOCATION"]',
  '.a-popover-wrapper button:has-text("Choose location")',
  '.a-popover-wrapper button:has-text("Select delivery location")'
];

const APPLY_BUTTON_SELECTORS = [
  '#GLUXZipUpdate input[type="submit"]',
  "#GLUXZipUpdate .a-button-input",
  'input[aria-labelledby="GLUXZipUpdate-announce"]',
  "#GLUXZipUpdate .a-popover-footer .a-button-input",
  'input[data-action="GLUXPostalUpdateAction"]'
];

const CONFIRM_BUTTON_SELECTORS = [
  'button:has-text("Done")',
  'button:has-text("Continue")',
  ".a-popover-footer .a-button-primary input",
  "#GLUXConfirmClose",
  'input[name="glowDoneButton"]'
];

/**
 * Set Amazon delivery location to the configured zip code.
 * This ensures prices and availability reflect the target market.
 * Must be called on a dedicated page - caller should close this page afterward
 * (cookies persist at the BrowserContext level, so subsequent pages inherit the location).
 */
export async function setDeliveryZipCode(page: Page, marketplace: string, zipCode?: string | null): Promise<void> {
  const zip = defaultZipCode(zipCode);
  if (!zip) return;

  const zipTimeout = Math.min(timeoutMs(), 15000);
  const host = normalizeMarketplaceHost(marketplace);
  await page.goto(`https://${host}/`, { waitUntil: "domcontentloaded", timeout: zipTimeout });
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

  const zipInput = await openDeliveryLocationEditor(page, zipTimeout);
  await zipInput.click();
  await zipInput.fill("");
  await zipInput.fill(zip);
  await page.waitForTimeout(300);

  const applyButton = await firstVisibleLocator(page, APPLY_BUTTON_SELECTORS, zipTimeout);
  if (!applyButton) {
    throw new Error("Amazon ZIP apply button did not appear after opening the delivery location editor.");
  }

  await applyButton.click({ timeout: zipTimeout });
  await page.waitForTimeout(1500);

  const confirmButton = await firstVisibleLocator(page, CONFIRM_BUTTON_SELECTORS, 5000);
  await confirmButton?.click({ timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(800);

  await page.reload({ waitUntil: "domcontentloaded", timeout: zipTimeout }).catch(() => undefined);
  await page.waitForTimeout(1000);
  await assertDeliveryZipCodeApplied(page, zip);
}

async function openDeliveryLocationEditor(page: Page, zipTimeout: number): Promise<Locator> {
  for (const selector of LOCATION_TRIGGER_SELECTORS) {
    const trigger = await firstVisibleLocator(page, [selector], 1200);
    if (!trigger) {
      continue;
    }

    await trigger.click({ timeout: zipTimeout }).catch(() => undefined);
    await page.waitForTimeout(800);

    const zipInput = await waitForZipInput(page, 2500);
    if (zipInput) {
      return zipInput;
    }

    const selectLocationButton = await firstVisibleLocator(page, SELECT_LOCATION_BUTTON_SELECTORS, 2500);
    if (!selectLocationButton) {
      continue;
    }

    await selectLocationButton.click({ timeout: zipTimeout }).catch(() => undefined);
    await page.waitForTimeout(800);

    const revealedZipInput = await waitForZipInput(page, zipTimeout);
    if (revealedZipInput) {
      return revealedZipInput;
    }
  }

  throw new Error(`Amazon delivery location editor did not open. Tried triggers: ${LOCATION_TRIGGER_SELECTORS.join(", ")}`);
}

async function waitForZipInput(page: Page, timeout: number): Promise<Locator | null> {
  return firstVisibleLocator(page, ZIP_INPUT_SELECTORS, timeout);
}

async function isLocatorVisible(locator: Locator, timeout: number): Promise<boolean> {
  return locator
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

async function firstVisibleLocator(page: Page, selectors: string[], timeout: number): Promise<Locator | null> {
  const perSelectorTimeout = Math.max(250, Math.min(timeout, 1500));
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await isLocatorVisible(locator, perSelectorTimeout)) {
      return locator;
    }
  }
  return null;
}

async function assertDeliveryZipCodeApplied(page: Page, zip: string): Promise<void> {
  const locationText = await page
    .locator("#nav-global-location-popover-link, #glow-ingress-block, #nav-global-location-slot")
    .first()
    .innerText({ timeout: 5000 })
    .catch(() => "");
  const bodySample = await page
    .locator("body")
    .innerText({ timeout: 5000 })
    .then((text) => text.slice(0, 2000))
    .catch(() => "");
  const text = `${locationText}\n${bodySample}`;
  const expectedLocation = zip === "97201" ? /\b97201\b|Portland/i : new RegExp(`\\b${escapeRegExp(zip)}\\b`);

  if (/Deliver to\s+Hong Kong|ship to Hong Kong|items that ship to Hong Kong/i.test(text) || !expectedLocation.test(text)) {
    throw new Error(`Amazon delivery location did not apply zip ${zip}. Current location text: ${locationText || "unknown"}`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
