/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteTimeline } from "@/components/trip/route-timeline";

describe("RouteTimeline", () => {
  it("renders round-trip route with destination name", () => {
    render(
      <RouteTimeline
        originCode="DXB"
        destinationCode="LON"
        destinationName="London"
        checkIn="2025-12-20"
        checkOut="2025-12-27"
        roundTrip
      />,
    );
    expect(screen.getAllByText(/Dubai/i).length).toBeGreaterThan(0);
    expect(screen.getByText("London")).toBeTruthy();
  });

  it("renders one-way without return leg", () => {
    const { container } = render(
      <RouteTimeline
        originCode="DXB"
        destinationCode="LON"
        destinationName="London"
        checkIn="2025-12-20"
        checkOut="2025-12-27"
        roundTrip={false}
        className="custom-class"
      />,
    );
    const planes = container.querySelectorAll(".lucide-plane");
    expect(planes.length).toBe(1);
    expect(container.firstChild).toHaveProperty("className", expect.stringContaining("custom-class"));
  });
});
