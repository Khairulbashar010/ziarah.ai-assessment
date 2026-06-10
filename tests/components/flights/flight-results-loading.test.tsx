/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FlightResultsLoading } from "@/components/flights/flight-results-loading";

describe("FlightResultsLoading", () => {
  it("renders skeleton placeholders", () => {
    const { container } = render(<FlightResultsLoading />);
    expect(container.querySelectorAll(".skeleton-shimmer").length).toBeGreaterThan(5);
  });
});
