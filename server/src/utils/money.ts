/** Money helpers — amounts are plain rupees with 2-decimal precision. */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function addMoney(...values: number[]): number {
  return round2(values.reduce((a, b) => a + (Number(b) || 0), 0));
}

export function subtractMoney(a: number, b: number): number {
  return round2((Number(a) || 0) - (Number(b) || 0));
}

export function percentOf(amount: number, percent: number): number {
  return round2((Number(amount) || 0) * (Number(percent) || 0) / 100);
}

export interface DiscountInput {
  type: 'percent' | 'fixed';
  value: number;
}

export function discountAmount(subtotal: number, discount?: DiscountInput | null): number {
  if (!discount || !discount.value) return 0;
  if (discount.type === 'percent') return Math.min(round2(percentOf(subtotal, Math.min(100, discount.value))), subtotal);
  return Math.min(round2(discount.value), subtotal);
}

export function clampMoney(value: number, min = 0): number {
  return Math.max(min, round2(value));
}
