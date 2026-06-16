export function imgFallback(event: Event): void {
  const img = event.target as HTMLImageElement;
  const bounds = img.getBoundingClientRect();
  img.style.display = "none";

  const fallback = document.createElement("div");
  fallback.className = "img-fallback";
  fallback.style.width = `${Math.max(42, Math.round(bounds.width || 52))}px`;
  fallback.style.height = `${Math.max(42, Math.round(bounds.height || 52))}px`;
  fallback.textContent = "无图";

  img.parentElement?.insertBefore(fallback, img);
}
