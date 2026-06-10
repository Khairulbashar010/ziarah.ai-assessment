import { describe, expect, it } from "vitest";
import { resolveRequestId } from "@/lib/api/request-id";

const VALID_UUID_V4 = "550e8400-e29b-41d4-a716-446655440000";

describe("resolveRequestId", () => {
  it("returns a valid UUID v4 header value", () => {
    expect(resolveRequestId(VALID_UUID_V4)).toBe(VALID_UUID_V4);
  });

  it("generates a new UUID when the header is missing", () => {
    const id = resolveRequestId(null);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("ignores non-UUID header values", () => {
    expect(resolveRequestId("custom-req-id")).not.toBe("custom-req-id");
    expect(resolveRequestId("not-a-uuid")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("ignores UUID v1 values", () => {
    const uuidV1 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    expect(resolveRequestId(uuidV1)).not.toBe(uuidV1);
  });
});
