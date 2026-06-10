import { redisKeys } from "@/lib/storage/redis-keys";
import type { RedisSetOptions } from "@/lib/storage/redis";

type StoredValue = {
  value: string;
  expiresAt: number | null;
};

const store = new Map<string, StoredValue>();

function isExpired(entry: StoredValue, now = Date.now()): boolean {
  return entry.expiresAt !== null && now >= entry.expiresAt;
}

function purgeExpired(key: string, now = Date.now()) {
  const entry = store.get(key);
  if (entry && isExpired(entry, now)) {
    store.delete(key);
  }
}

export async function redisGet(key: string): Promise<string | null> {
  purgeExpired(key);
  return store.get(key)?.value ?? null;
}

export async function redisSet(
  key: string,
  value: string,
  options?: RedisSetOptions,
): Promise<string | null> {
  purgeExpired(key);

  if (options?.NX && store.has(key)) {
    return null;
  }

  const expiresAt =
    options?.EX !== undefined
      ? Date.now() + options.EX * 1000
      : options?.PX !== undefined
        ? Date.now() + options.PX
        : null;

  store.set(key, { value, expiresAt });
  return "OK";
}

export async function redisDel(...keys: string[]): Promise<void> {
  for (const key of keys) {
    store.delete(key);
  }
}

export async function redisExists(key: string): Promise<boolean> {
  purgeExpired(key);
  return store.has(key);
}

export async function pingRedis(): Promise<boolean> {
  return true;
}

export async function clearRedisNamespace(): Promise<void> {
  const prefix = redisKeys.namespacePattern().replace("*", "");
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

export async function disconnectRedis(): Promise<void> {
  store.clear();
}

export function requireRedisUrl(): string {
  return "redis://mock";
}

export async function getRedis(): Promise<never> {
  throw new Error("getRedis() is not available in the redis test mock");
}
