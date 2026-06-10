import { v4 as uuidv4, validate as uuidValidate, version as uuidVersion } from "uuid";

function isUuidV4(value: string): boolean {
  return uuidValidate(value) && uuidVersion(value) === 4;
}

/** Accept only UUID v4 request IDs from clients; otherwise generate a new one. */
export function resolveRequestId(headerValue: string | null): string {
  if (headerValue && isUuidV4(headerValue)) {
    return headerValue;
  }
  return uuidv4();
}
