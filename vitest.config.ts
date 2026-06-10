import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    setupFiles: ["./tests/unit/setup.ts"],
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/components/**/*.test.ts",
      "tests/components/**/*.test.tsx",
      "tests/app/**/*.test.ts",
      "tests/app/**/*.test.tsx",
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/lib/types/**",
        "src/lib/trip-search/stream-events.ts",
        "src/mocks/seed/types.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
