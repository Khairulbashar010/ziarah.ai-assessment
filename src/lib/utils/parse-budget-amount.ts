const SUFFIX_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
};

/** Parse informal budget amounts like 3k, $2.5K, 1.2m → numeric value. */
export function parseBudgetAmount(digits: string, suffix?: string): number | undefined {
  const normalizedDigits = digits.replace(/,/g, "");
  const amount = Number(normalizedDigits);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const multiplier = suffix ? SUFFIX_MULTIPLIERS[suffix.toLowerCase()] : 1;
  if (!multiplier) return undefined;

  return amount * multiplier;
}
