/**
 * Formatting helpers for values the API returns. Presentation only — the server
 * owns every business rule and derived value (§46).
 */

/**
 * Render an amount in the business's currency (e.g. `₦2,500.00`). Falls back to
 * a plain `CODE 0.00` string if the business carries a currency code Intl does
 * not recognise, so an odd setting can never blank out a page.
 */
export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
