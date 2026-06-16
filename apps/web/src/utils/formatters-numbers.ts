export function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `$${value.toFixed(2)}`;
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : new Intl.NumberFormat("zh-CN").format(value);
}

export function formatSignedCount(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  const formatted = new Intl.NumberFormat("zh-CN").format(Math.abs(value));
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : "0";
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `${(value * 100).toFixed(1)}%`;
}
