import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

process.env.LOG_LEVEL = "silent";

vi.mock("@/lib/storage/redis", () => import("./helpers/redis-mock"));

afterEach(() => {
  cleanup();
});
