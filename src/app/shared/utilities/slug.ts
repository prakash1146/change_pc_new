/**
 * Convert a display name to a URL-safe slug. Shared across pages that link
 * into collection / agent detail routes (e.g. /assets/collection/:slug,
 * /assets/agent/:slug).
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
