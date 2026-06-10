export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function pickFrom<T>(items: T[], seed: string, offset = 0): T {
  const index = (hashString(`${seed}:${offset}`) >>> 0) % items.length;
  return items[index];
}
