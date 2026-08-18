import type { Page } from './model/types';

/**
 * Pure function — the single authority for page pairing.
 * Returns an array of [left, right] pairs (or [null, single] for solo pages).
 * null in a slot = blank/empty page to fill the spread.
 *
 * LTR example, firstPageIsSingle=true, 8 pages:
 *   [[null, p1]]
 *   [[p2,   p3]]
 *   [[p4,   p5]]
 *   [[p6,   p7]]
 *   [[p8,  null]]
 *
 * RTL example, firstPageIsSingle=true, 8 pages:
 *   [[null, p1]]
 *   [[p3,   p2]]
 *   [[p5,   p4]]
 *   [[p7,   p6]]
 *   [[null, p8]]
 */
export function getSpreads(
  pages: Page[],
  direction: 'ltr' | 'rtl',
  firstPageIsSingle: boolean,
): (Page | null)[][] {
  const spreads: (Page | null)[][] = [];

  let i = 0;

  if (firstPageIsSingle && pages.length > 0) {
    // First page sits alone on the right (RTL) or right (LTR) — always centre-right
    spreads.push([null, pages[0]]);
    i = 1;
  }

  while (i < pages.length) {
    const a = pages[i]     ?? null;
    const b = pages[i + 1] ?? null;
    if (direction === 'rtl') {
      // Right page has lower number in RTL
      spreads.push([b, a]);
    } else {
      spreads.push([a, b]);
    }
    i += 2;
  }

  return spreads;
}
