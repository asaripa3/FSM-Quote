/** Reject only recognizable navigation URLs; uncertain pages still reach evidence validation. */
export function nonProductPageReason(url: URL): "home page" | "category page" | null {
  const path = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
  // Some older supplier storefronts serve real products from index.php or the root.
  if ([...url.searchParams.keys()].some(key => /^(?:product_?id|product|sku|item_?id|pid)$/i.test(key) && url.searchParams.get(key)?.trim())) return null;
  if (/^\/[a-z]{2}(?:-[a-z]{2})?$/i.test(path) || /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:index\.(?:html?|php|aspx?)|home)?$/i.test(path)) return "home page";
  // A Shopify product may live under /collections/<collection>/products/<product>.
  if (/(?:^|\/)(?:products?|p|dp|pd)\/[^/]+/.test(path)) return null;
  // Department paths also contain real products (for example Ace Hardware); do not
  // reject descendants merely because a supplier organizes products by department.
  const segments = path.split("/").filter(Boolean);
  if (/^[a-z]{2}(?:-[a-z]{2})?$/i.test(segments[0] ?? "")) segments.shift();
  // A category listing is the category itself, at most one level deep: /category/plumbing. Anything
  // below that is the supplier filing a product under its category, which many small carts do
  // (/category/plumbing/moen-104421), and rejecting it would discard the product page itself.
  if (/^(?:collections?|categor(?:y|ies))$/.test(segments[0] ?? "") && segments.length <= 2) return "category page";
  if (segments.length === 1 && /^(?:products?|catalog|shop|store|departments?)$/.test(segments[0])) return "category page";
  return null;
}
