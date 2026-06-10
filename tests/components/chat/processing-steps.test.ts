/**
 * @vitest-environment jsdom
 */
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { INITIAL_PROCESSING_STEPS } from "@/components/chat/processing-steps";

describe("INITIAL_PROCESSING_STEPS", () => {
  it("defines five steps in order with understand active", () => {
    expect(INITIAL_PROCESSING_STEPS).toHaveLength(5);
    expect(INITIAL_PROCESSING_STEPS.map((s) => s.id)).toEqual([
      "understand",
      "parse",
      "flights",
      "hotels",
      "build",
    ]);
    expect(INITIAL_PROCESSING_STEPS[0]).toMatchObject({
      id: "understand",
      status: "active",
      label: "Understanding your trip",
    });
    expect(INITIAL_PROCESSING_STEPS.slice(1).every((s) => s.status === "pending")).toBe(true);
  });

  it("includes descriptive labels for each step", () => {
    expect(INITIAL_PROCESSING_STEPS[1]?.label).toContain("dates");
    expect(INITIAL_PROCESSING_STEPS[2]?.label).toContain("flights");
    expect(INITIAL_PROCESSING_STEPS[3]?.label).toContain("hotel");
    expect(INITIAL_PROCESSING_STEPS[4]?.label).toContain("trip");
  });
});
