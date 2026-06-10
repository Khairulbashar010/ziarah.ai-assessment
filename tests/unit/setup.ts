import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

process.env.LOG_LEVEL = "silent";
process.env.METRICS_ENABLED = "false";
process.env.OTEL_ENABLED = "false";

vi.mock("@/lib/storage/redis", () => import("./helpers/redis-mock"));

afterEach(() => {
  cleanup();
});
