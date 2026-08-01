/**
 * 在新标签页/系统默认浏览器中打开指定 ASIN 的 Amazon 商品页面
 */
export async function openCategoryProductByAsin(asin: string, categoryId?: number | null): Promise<void> {
  const base = import.meta.env.VITE_API_BASE?.trim() || "/api";
  let linkUrl = `${base}/category-products/${encodeURIComponent(asin)}/link`;
  if (categoryId != null) {
    linkUrl += `?categoryId=${categoryId}`;
  }

  try {
    const res = await fetch(linkUrl, { credentials: "include" });
    if (res.ok) {
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        return;
      }
    }
  } catch {
    // Fall back to direct Amazon URL
  }

  const fallbackUrl = `https://www.amazon.com/dp/${encodeURIComponent(asin)}`;
  window.open(fallbackUrl, "_blank", "noopener,noreferrer");
}
