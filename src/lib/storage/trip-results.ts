import type { TripSearchResult } from "@/lib/types/trip";
import { TRIP_RESULT_TTL_SECONDS, redisKeys } from "@/lib/storage/redis-keys";
import { redisDel, redisGet, redisSet } from "@/lib/storage/redis";

function parseTripResult(raw: string): TripSearchResult | undefined {
  try {
    return JSON.parse(raw) as TripSearchResult;
  } catch {
    return undefined;
  }
}

export async function saveTripResult(result: TripSearchResult) {
  await redisSet(redisKeys.result(result.requestId), JSON.stringify(result), {
    EX: TRIP_RESULT_TTL_SECONDS,
  });
}

export async function getTripResult(requestId: string): Promise<TripSearchResult | undefined> {
  const raw = await redisGet(redisKeys.result(requestId));
  if (!raw) return undefined;
  return parseTripResult(raw);
}

/** Test helper */
export async function deleteTripResult(requestId: string) {
  await redisDel(redisKeys.result(requestId));
}
