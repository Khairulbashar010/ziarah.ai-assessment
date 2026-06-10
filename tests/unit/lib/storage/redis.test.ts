import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRedisClient = vi.hoisted(() => {
  const client = {
    isOpen: false,
    on: vi.fn(),
    connect: vi.fn(async function (this: { isOpen: boolean }) {
      this.isOpen = true;
    }),
    get: vi.fn().mockResolvedValue("cached"),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue("PONG"),
    keys: vi.fn().mockResolvedValue(["trip:cache:abc", "trip:result:1"]),
    quit: vi.fn().mockResolvedValue(undefined),
  };
  return client;
});

vi.mock("redis", () => ({
  createClient: vi.fn(() => mockRedisClient),
}));

vi.mock("@/lib/observability/logger", () => ({
  logRedisError: vi.fn(),
}));

vi.mock("@/lib/storage/redis", async (importOriginal) => {
  return importOriginal<typeof import("@/lib/storage/redis")>();
});

describe("redis client", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    mockRedisClient.isOpen = false;
    mockRedisClient.connect.mockClear();
    mockRedisClient.on.mockClear();
    const { disconnectRedis } = await import("@/lib/storage/redis");
    await disconnectRedis();
  });

  afterEach(async () => {
    const { disconnectRedis } = await import("@/lib/storage/redis");
    await disconnectRedis();
    vi.unstubAllEnvs();
  });

  it("requireRedisUrl returns the configured URL", async () => {
    const { requireRedisUrl } = await import("@/lib/storage/redis");
    expect(requireRedisUrl()).toBe("redis://localhost:6379");
  });

  it("requireRedisUrl throws when REDIS_URL is missing", async () => {
    vi.unstubAllEnvs();
    const { requireRedisUrl } = await import("@/lib/storage/redis");
    expect(() => requireRedisUrl()).toThrow(/REDIS_URL is required/);
  });

  it("connects once and reuses the open client", async () => {
    const { getRedis } = await import("@/lib/storage/redis");
    const first = await getRedis();
    mockRedisClient.isOpen = true;
    const second = await getRedis();

    expect(first).toBe(second);
    expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
    expect(mockRedisClient.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("logs redis client errors from the error handler", async () => {
    const { logRedisError } = await import("@/lib/observability/logger");
    const { getRedis } = await import("@/lib/storage/redis");
    await getRedis();

    const errorHandler = mockRedisClient.on.mock.calls.find(([event]) => event === "error")?.[1];
    errorHandler?.(new Error("connection reset"));

    expect(logRedisError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("reads and writes values with optional TTL flags", async () => {
    const { redisGet, redisSet } = await import("@/lib/storage/redis");

    await expect(redisGet("trip:cache:abc")).resolves.toBe("cached");
    await expect(redisSet("trip:cache:abc", "value")).resolves.toBe("OK");
    await expect(redisSet("trip:cache:abc", "value", { EX: 60 })).resolves.toBe("OK");
    await expect(redisSet("trip:cache:abc", "value", { PX: 5000 })).resolves.toBe("OK");
    await expect(redisSet("trip:lock:abc", "1", { NX: true, EX: 30 })).resolves.toBe("OK");
    await expect(redisSet("trip:lock:abc", "1", { NX: true, PX: 5000 })).resolves.toBe("OK");
  });

  it("deletes keys and checks existence", async () => {
    const { redisDel, redisExists } = await import("@/lib/storage/redis");

    await redisDel();
    await redisDel("trip:result:1");
    await expect(redisExists("trip:result:1")).resolves.toBe(true);
  });

  it("pings redis and returns false when ping fails", async () => {
    const { pingRedis } = await import("@/lib/storage/redis");

    await expect(pingRedis()).resolves.toBe(true);

    mockRedisClient.ping.mockRejectedValueOnce(new Error("down"));
    await expect(pingRedis()).resolves.toBe(false);
  });

  it("clears namespaced keys and disconnects", async () => {
    const { clearRedisNamespace, disconnectRedis } = await import("@/lib/storage/redis");

    await clearRedisNamespace();
    expect(mockRedisClient.keys).toHaveBeenCalled();
    expect(mockRedisClient.del).toHaveBeenCalled();

    mockRedisClient.keys.mockResolvedValueOnce([]);
    await clearRedisNamespace();

    mockRedisClient.isOpen = true;
    await disconnectRedis();
    expect(mockRedisClient.quit).toHaveBeenCalled();
  });
});
