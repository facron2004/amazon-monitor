/**
 * 在浏览器新标签页中打开指定 ASIN 的 Amazon 商品页面（通过后端重定向）
 */
export function openCategoryProductByAsin(asin: string, categoryId?: number | null): void {
  const base = import.meta.env.VITE_API_BASE?.trim() || "/api";
  let url = `${base}/category-products/${encodeURIComponent(asin)}/open`;
  if (categoryId != null) {
    url += `?categoryId=${categoryId}`;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
