/** How a menu group or item is rendered in sidebar, header, and footer. */
export type MenuDisplayMode = 'icon_only' | 'text_only' | 'icon_and_text';

export function normalizeDisplayMode(value: unknown): MenuDisplayMode {
  const v = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/-/g, '_');
  if (v === 'icon_only' || v === 'icononly') return 'icon_only';
  if (v === 'text_only' || v === 'textonly') return 'text_only';
  if (v === 'icon_and_text' || v === 'iconandtext' || v === 'both' || v === 'text_and_icon') {
    return 'icon_and_text';
  }
  return 'icon_and_text';
}

export function showIconInMenu(mode: MenuDisplayMode): boolean {
  return mode === 'icon_only' || mode === 'icon_and_text';
}

export function showTextInMenu(mode: MenuDisplayMode): boolean {
  return mode === 'text_only' || mode === 'icon_and_text';
}
