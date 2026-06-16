import type { NullableNumber } from "./types.js";

export const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
export const roundRate = (value: number): number => Math.round((value + Number.EPSILON) * 10000) / 10000;

export function formatMoney(value: number, currency = "$"): string {
  return `${currency}${roundCurrency(value).toFixed(2)}`;
}

export function formatNullableMoney(value: NullableNumber): string {
  return value === null ? "无" : formatMoney(value);
}

export function formatPercent(value: number): string {
  return `${roundCurrency(value * 100).toFixed(1)}%`;
}
