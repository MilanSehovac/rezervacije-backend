'use strict';

// Average service price below which a salon counts as "$" / "$$"; anything above is "$$$".
const BUDGET_BELOW = 25;
const MODERATE_BELOW = 60;

/**
 * Price level derived from what the salon actually charges, so it can never contradict the price list.
 * Returns { priceRange: '$'|'$$'|'$$$'|null, minPrice, maxPrice }.
 */
function priceInfo(services) {
  const prices = (services || []).map((s) => Number(s.price)).filter((p) => Number.isFinite(p));
  if (!prices.length) return { priceRange: null, minPrice: null, maxPrice: null };
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  return {
    priceRange: avg < BUDGET_BELOW ? '$' : avg < MODERATE_BELOW ? '$$' : '$$$',
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
  };
}

module.exports = { priceInfo, BUDGET_BELOW, MODERATE_BELOW };
