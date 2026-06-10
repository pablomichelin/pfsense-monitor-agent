export type NavItem = {
  href: string;
  label: string;
};

export function getActiveHref(pathname: string, items: NavItem[]): string | null {
  const matching = items.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (matching.length === 0) return null;
  matching.sort((a, b) => b.href.length - a.href.length);
  return matching[0].href;
}
