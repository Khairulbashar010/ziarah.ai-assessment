/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TripFooter } from "@/components/trip/trip-footer";

describe("TripFooter", () => {
  it("renders collapsed state with selection summary", () => {
    render(
      <TripFooter
        total={2500}
        selectionSummary="EK flight · Grand London Hotel"
        withinBudget
        budget={5000}
        flightPrice={1200}
        hotelPrice={1300}
        flightLabel="EK flight"
        hotelLabel="Grand London Hotel"
      />,
    );
    expect(screen.getByText("$2,500")).toBeTruthy();
    expect(screen.getByText("EK flight · Grand London Hotel")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Book Now" })).toBeTruthy();
  });

  it("shows default prompt when no selection summary", () => {
    render(<TripFooter total={null} />);
    expect(screen.getByText("Pick a flight and hotel")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Book Now" })).toHaveProperty("disabled", true);
  });

  it("expands to show breakdown and budget under", () => {
    render(
      <TripFooter
        total={2100}
        withinBudget
        budget={5000}
        flightPrice={1200}
        hotelPrice={900}
        flightLabel="EK flight"
        hotelLabel="Hotel"
        hotelBreakdown={[
          { label: "Hotel A", price: 500 },
          { label: "Hotel B", price: 400 },
        ]}
        onBook={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand trip breakdown"));
    expect(screen.getByText("Trip total")).toBeTruthy();
    expect(screen.getByText("Hotel A")).toBeTruthy();
    expect(screen.getByText(/under \$5,000 budget/i)).toBeTruthy();
  });

  it("shows over budget message when expanded", () => {
    render(
      <TripFooter
        total={6000}
        withinBudget={false}
        budget={5000}
        flightPrice={3500}
        hotelPrice={2500}
        flightLabel="BA flight"
        hotelLabel="Luxury Hotel"
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand trip breakdown"));
    expect(screen.getByText(/Over budget by/i)).toBeTruthy();
  });

  it("collapses from expanded state", () => {
    render(
      <TripFooter
        total={3000}
        withinBudget
        budget={5000}
        flightPrice={1500}
        hotelPrice={1500}
        flightLabel="Flight"
        hotelLabel="Hotel"
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand trip breakdown"));
    fireEvent.click(screen.getByLabelText("Collapse trip total"));
    expect(screen.queryByText("Trip total")).toBeNull();
  });

  it("calls onBook when enabled", () => {
    const onBook = vi.fn();
    render(<TripFooter total={2000} withinBudget onBook={onBook} />);
    fireEvent.click(screen.getByRole("button", { name: "Book Now" }));
    expect(onBook).toHaveBeenCalledOnce();
  });
});
