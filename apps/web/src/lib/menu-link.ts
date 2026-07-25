/**
 * Opens a menu URL in the same window or a new tab (used for EXTERNAL_URL items).
 */
export function navigateMenuLink(url: string, openInNewTab: boolean): void {
  const trimmed = String(url || '').trim();
  if (!trimmed) return;
  if (openInNewTab) {
    window.open(trimmed, '_blank', 'noopener,noreferrer');
  } else {
    window.location.assign(trimmed);
  }
}

/** Client-side check for basic UX; server enforces the same rules. */
export function isLikelyValidMenuUrl(raw: string): boolean {
  return assertSafeMenuLinkUrl(raw) !== null;
}

export function assertSafeMenuLinkUrl(raw: unknown): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if (t.startsWith('/')) {
    if (t.startsWith('//')) return null;
    return t;
  }
  try {
    const u = new URL(t);
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) {
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return null;
}
