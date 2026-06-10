import { createClient, type RedisClientType } from "redis";
import { redisKeys } from "@/lib/storage/redis-keys";

export type RedisSetOptions = {
  EX?: number;
  PX?: number;
  NX?: boolean;
};

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType> | null = null;

export function requireRedisUrl(): string {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    throw new Error("REDIS_URL is required — set redis://host:6379");
  }
  return url;
}

export async function getRedis(): Promise<RedisClientType> {
  if (client?.isOpen) {
    return client;
  }

  if (!connectPromise) {
    connectPromise = (async () => {
      const nextClient = createClient({ url: requireRedisUrl() });
      nextClient.on("error", (error) => {
        console.error("[redis] client error", error);
      });
      await nextClient.connect();
      client = nextClient;
      return nextClient;
    })();
  }

  return connectPromise;
}

export async function redisGet(key: string): Promise<string | null> {
  const redis = await getRedis();
  return redis.get(key);
}

export async function redisSet(
  key: string,
  value: string,
  options?: RedisSetOptions,
): Promise<string | null> {
  const redis = await getRedis();
  if (options?.NX) {
    return redis.set(key, value, {
      NX: true,
      ...(options.EX !== undefined ? { EX: options.EX } : {}),
      ...(options.PX !== undefined ? { PX: options.PX } : {}),
    });
  }

  if (options?.EX !== undefined) {
    return redis.set(key, value, { EX: options.EX });
  }

  if (options?.PX !== undefined) {
    return redis.set(key, value, { PX: options.PX });
  }

  return redis.set(key, value);
}

export async function redisDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const redis = await getRedis();
  await redis.del(keys);
}

export async function redisExists(key: string): Promise<boolean> {
  const redis = await getRedis();
  return (await redis.exists(key)) === 1;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const redis = await getRedis();
    const response = await redis.ping();
    return response === "PONG";
  } catch {
    return false;
  }
}

/** Test helper — clears all trip-scoped keys. */
export async function clearRedisNamespace(): Promise<void> {
  const redis = await getRedis();
  const keys = await redis.keys(redisKeys.namespacePattern());
  if (keys.length > 0) {
    await redis.del(keys);
  }
}

export async function disconnectRedis(): Promise<void> {
  if (client?.isOpen) {
    await client.quit();
  }
  client = null;
  connectPromise = null;
}
