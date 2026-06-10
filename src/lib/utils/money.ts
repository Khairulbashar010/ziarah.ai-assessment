export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function minPrice<T extends { totalPrice: number }>(items: T[]): number | null {
  if (items.length === 0) return null;
  return Math.min(...items.map((item) => item.totalPrice));
}
