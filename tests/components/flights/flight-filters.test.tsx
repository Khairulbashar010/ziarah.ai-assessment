/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FlightFilters } from "@/components/flights/flight-filters";
import { getDefaultFlightFilters } from "@/lib/client/flight-filters";
import { mockFlightOffer } from "../fixtures/trip-mocks";

describe("FlightFilters", () => {
  const offers = [mockFlightOffer(), mockFlightOffer({ id: "f2", validatingCarrier: "BA", totalPrice: 2000 })];
  const defaults = getDefaultFlightFilters(offers, 5000);

  it("changes sort, stops, price, refundable, and airlines", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    render(
      <FlightFilters
        filters={defaults}
        defaults={defaults}
        airlines={["EK", "BA"]}
        priceRange={{ min: 1000, max: 3000 }}
        budgetMax={5000}
        budgetHint="Hotel paired hint"
        onChange={onChange}
        onReset={onReset}
      />,
    );

    fireEvent.click(screen.getByLabelText("Lowest price"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sort: "price" }));

    fireEvent.click(screen.getByLabelText("Direct only"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ stops: "direct" }));

    fireEvent.click(screen.getByLabelText(/Within \$5,000 budget/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ withinBudgetOnly: true }));

    fireEvent.change(screen.getByRole("slider"), { target: { value: "1500" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxPrice: 1500 }));

    fireEvent.click(screen.getByLabelText("Refundable only"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ refundableOnly: true }));

    fireEvent.click(screen.getByLabelText("BA"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ airlines: ["BA"] }));

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.getByText("Hotel paired hint")).toBeTruthy();
  });

  it("toggles airline off when already selected", () => {
    const onChange = vi.fn();
    render(
      <FlightFilters
        filters={{ ...defaults, airlines: ["EK"] }}
        defaults={defaults}
        airlines={["EK"]}
        priceRange={{ min: 1000, max: 3000 }}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("EK"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ airlines: [] }));
  });

  it("uses custom budget label when provided", () => {
    render(
      <FlightFilters
        filters={defaults}
        defaults={defaults}
        airlines={[]}
        priceRange={{ min: 1000, max: 3000 }}
        budgetMax={5000}
        budgetLabel="Custom trip budget filter"
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Custom trip budget filter")).toBeTruthy();
  });

  it("hides budget and airlines sections when not provided", () => {
    render(
      <FlightFilters
        filters={defaults}
        defaults={defaults}
        airlines={[]}
        priceRange={{ min: 0, max: 100 }}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Within/i)).toBeNull();
    expect(screen.queryByText("EK")).toBeNull();
  });
});
