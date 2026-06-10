/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FlightResultsPanel } from "@/components/flights/flight-results-panel";
import { mockFlightOffer, mockTripSearchResponse } from "../fixtures/trip-mocks";

describe("FlightResultsPanel", () => {
  it("renders flight list with header and footer", () => {
    render(<FlightResultsPanel result={mockTripSearchResponse()} />);
    expect(screen.getByText(/Dubai to London/i)).toBeTruthy();
    expect(screen.getByText("Selected flight")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select flight" })).toBeTruthy();
    expect(screen.getAllByText("EK").length).toBeGreaterThan(0);
  });

  it("shows awaiting state while searching with no offers", () => {
    render(
      <FlightResultsPanel
        result={mockTripSearchResponse({
          flights: { totalOffers: 0, truncated: false, withinBudget: true, offers: [] },
        })}
        searching
      />,
    );
    expect(screen.getByText(/Searching flight inventory/i)).toBeTruthy();
  });

  it("shows no results message without budget", () => {
    const noBudget = mockTripSearchResponse({
      parsedQuery: { ...mockTripSearchResponse().parsedQuery, budget: undefined },
      flights: { totalOffers: 0, truncated: false, withinBudget: true, offers: [] },
    });
    render(<FlightResultsPanel result={noBudget} />);
    expect(screen.getByText(/No flights matched your search/i)).toBeTruthy();
  });

  it("shows budget no results with suggested min", () => {
    render(
      <FlightResultsPanel
        result={mockTripSearchResponse({
          flights: { totalOffers: 0, truncated: false, withinBudget: false, offers: [] },
          tripSummary: {
            ...mockTripSearchResponse().tripSummary,
            suggestedMinBudget: 3500,
          },
        })}
      />,
    );
    expect(screen.getByText(/No flights within your/i)).toBeTruthy();
    expect(screen.getByText(/\$3,500/)).toBeTruthy();
  });

  it("shows no filtered results and clears filters", () => {
    render(<FlightResultsPanel result={mockTripSearchResponse()} />);
    fireEvent.click(screen.getByLabelText("2+ stops"));
    expect(screen.getByText(/No flights match your filters/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByText("EK").length).toBeGreaterThan(0);
  });

  it("renders embedded mode with paired hotel budget labels", () => {
    const onSelectFlight = vi.fn();
    render(
      <FlightResultsPanel
        result={mockTripSearchResponse()}
        embedded
        selectedFlightId="flight-1"
        onSelectFlight={onSelectFlight}
        pairedHotelPrice={900}
      />,
    );
    expect(screen.queryByText("Selected flight")).toBeNull();
    expect(screen.getByText(/trip budget/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pick" }));
    expect(onSelectFlight).toHaveBeenCalled();
  });

  it("shows partial results while searching and stale cache when idle", () => {
    const { rerender } = render(
      <FlightResultsPanel
        result={mockTripSearchResponse({
          meta: { ...mockTripSearchResponse().meta, partialResults: true },
        })}
        searching
      />,
    );
    expect(screen.getByText(/Still searching/i)).toBeTruthy();

    rerender(
      <FlightResultsPanel
        result={mockTripSearchResponse({
          meta: {
            ...mockTripSearchResponse().meta,
            partialResults: false,
            cache: {
              status: "stale",
              cachedAt: "2025-01-01T00:00:00.000Z",
              expiresAt: null,
              refreshInMs: 0,
              ttlMs: 300_000,
            },
          },
        })}
      />,
    );
    expect(screen.getByText(/cached prices/i)).toBeTruthy();
  });

  it("shows price refresh countdown for fresh cache", () => {
    render(
      <FlightResultsPanel
        result={mockTripSearchResponse({
          meta: {
            ...mockTripSearchResponse().meta,
            cache: {
              status: "fresh",
              cachedAt: "2025-01-01T00:00:00.000Z",
              expiresAt: "2025-01-01T00:05:00.000Z",
              refreshInMs: 120_000,
              ttlMs: 300_000,
            },
          },
        })}
      />,
    );
    expect(screen.getByText(/Prices refresh in 2 min/i)).toBeTruthy();
  });

  it("shows over-budget message in footer for expensive selection", () => {
    render(
      <FlightResultsPanel
        result={mockTripSearchResponse()}
        pairedHotelPrice={4000}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Within \$5,000 trip budget/i));
    expect(screen.getByText(/over trip budget/i)).toBeTruthy();
  });

  it("resets selection via onSelectFlight when filters exclude current flight", () => {
    const onSelectFlight = vi.fn();
    render(
      <FlightResultsPanel
        result={mockTripSearchResponse()}
        embedded
        selectedFlightId="flight-1"
        onSelectFlight={onSelectFlight}
      />,
    );
    fireEvent.click(screen.getByLabelText("BA"));
    expect(onSelectFlight).toHaveBeenCalledWith("flight-2");
  });

  it("shows truncated flight count and premium cabin label", () => {
    const result = mockTripSearchResponse({
      parsedQuery: {
        ...mockTripSearchResponse().parsedQuery,
        flights: {
          ...mockTripSearchResponse().parsedQuery.flights,
          cabin: "BUSINESS",
          passengers: { adults: 1, children: 0, infants: 0 },
        },
      },
      flights: {
        totalOffers: 10,
        truncated: true,
        withinBudget: true,
        offers: [mockFlightOffer()],
      },
    });
    render(<FlightResultsPanel result={result} />);
    expect(screen.getByText(/top 1 shown/i)).toBeTruthy();
    expect(screen.getByText(/BUSINESS/)).toBeTruthy();
    expect(screen.getByText(/1 traveller/)).toBeTruthy();
  });
});
