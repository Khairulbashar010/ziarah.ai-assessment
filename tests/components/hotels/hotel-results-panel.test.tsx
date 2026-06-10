/**
 * @vitest-environment jsdom
 */
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HotelResultsPanel } from "@/components/hotels/hotel-results-panel";
import type { HotelStaySegment, TripSearchResponse } from "@/lib/types/trip";
import {
  mockHotelOffer,
  mockTripSearchResponse,
  mockTripSearchResponseAllHotels,
} from "../fixtures/trip-mocks";

const defaultStays: HotelStaySegment[] = [
  {
    id: "hotel-1-full",
    offerId: "hotel-1",
    nights: 7,
    checkIn: "2025-12-20",
    checkOut: "2025-12-27",
  },
];

function HotelPanelHarness({
  result,
  initialStays = defaultStays,
  pairedFlightPrice = 1200,
  budgetMax,
  searching,
}: {
  result: TripSearchResponse;
  initialStays?: HotelStaySegment[];
  pairedFlightPrice?: number;
  budgetMax?: number;
  searching?: boolean;
}) {
  const [stays, setStays] = useState(initialStays);
  return (
    <HotelResultsPanel
      result={result}
      hotelStays={stays}
      onChangeStays={setStays}
      pairedFlightPrice={pairedFlightPrice}
      budgetMax={budgetMax}
      searching={searching}
    />
  );
}

describe("HotelResultsPanel", () => {
  it("renders hotel list with stay builder", () => {
    render(<HotelPanelHarness result={mockTripSearchResponse()} budgetMax={5000} />);
    expect(screen.getAllByText("Grand London Hotel").length).toBeGreaterThan(0);
    expect(screen.getByText("Your stay plan")).toBeTruthy();
    expect(screen.getByText(/Within \$5,000 trip budget/i)).toBeTruthy();
  });

  it("shows awaiting state while searching", () => {
    render(
      <HotelPanelHarness
        result={mockTripSearchResponse({
          hotels: { totalOffers: 0, truncated: false, offers: [] },
        })}
        initialStays={[]}
        searching
        pairedFlightPrice={0}
      />,
    );
    expect(screen.getByText(/Searching hotel inventory/i)).toBeTruthy();
  });

  it("shows no hotels message with budget suggestion", () => {
    render(
      <HotelPanelHarness
        result={mockTripSearchResponse({
          hotels: { totalOffers: 0, truncated: false, offers: [] },
          tripSummary: {
            ...mockTripSearchResponse().tripSummary,
            suggestedMinBudget: 4000,
          },
        })}
        initialStays={[]}
        pairedFlightPrice={1200}
        budgetMax={3000}
      />,
    );
    expect(screen.getByText(/No hotels within your/i)).toBeTruthy();
    expect(screen.getByText(/\$4,000/)).toBeTruthy();
  });

  it("shows no hotels without budget", () => {
    render(
      <HotelPanelHarness
        result={mockTripSearchResponse({
          hotels: { totalOffers: 0, truncated: false, offers: [] },
        })}
        initialStays={[]}
        pairedFlightPrice={0}
      />,
    );
    expect(screen.getByText(/No hotels matched your search/i)).toBeTruthy();
  });

  it("shows filtered empty state and show all hotels", () => {
    render(<HotelPanelHarness result={mockTripSearchResponse()} budgetMax={500} />);
    expect(screen.getByText(/No hotels match your filters/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all hotels" }));
    expect(screen.queryByText(/No hotels match your filters/i)).toBeNull();
  });

  it("sorts by rating and price", () => {
    render(<HotelPanelHarness result={mockTripSearchResponseAllHotels()} />);
    fireEvent.click(screen.getByLabelText("Highest rating"));
    fireEvent.click(screen.getByLabelText("Lowest price"));
    expect(screen.getAllByText(/Budget Stay/i).length).toBeGreaterThan(0);
  });

  it("handles pick offer and confirm nights", async () => {
    render(
      <HotelPanelHarness
        result={mockTripSearchResponseAllHotels()}
        initialStays={[
          {
            id: "hotel-1-partial",
            offerId: "hotel-1",
            nights: 3,
            checkIn: "2025-12-20",
            checkOut: "2025-12-23",
          },
        ]}
      />,
    );
    const pickButtons = screen.getAllByRole("button", { name: "Pick" });
    fireEvent.click(pickButtons[pickButtons.length - 1]!);
    expect(screen.getByText(/How many nights at Budget Stay Inn/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add 1 night/i }));
    await waitFor(() => {
      expect(screen.getByText(/3 left/i)).toBeTruthy();
    });
  });

  it("toggles pick off when same offer clicked again", () => {
    render(
      <HotelPanelHarness
        result={mockTripSearchResponse()}
        initialStays={[
          {
            id: "hotel-1-partial",
            offerId: "hotel-1",
            nights: 3,
            checkIn: "2025-12-20",
            checkOut: "2025-12-23",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Selected" }));
    expect(screen.getByText(/How many nights at Grand London Hotel/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Selected" }));
    expect(screen.queryByText(/How many nights at Grand London Hotel/i)).toBeNull();
  });

  it("initializes stays when invalid and shows partial search banner", () => {
    render(
      <HotelPanelHarness
        result={mockTripSearchResponse({
          meta: { ...mockTripSearchResponse().meta, partialResults: true },
        })}
        initialStays={[{ id: "bad", offerId: "missing", nights: 7, checkIn: "2025-12-20", checkOut: "2025-12-27" }]}
        searching
      />,
    );
    expect(screen.getByText(/Still searching/i)).toBeTruthy();
    expect(screen.getAllByText("Grand London Hotel").length).toBeGreaterThan(0);
  });

  it("removes stay and falls back to first hotel", async () => {
    render(
      <HotelPanelHarness
        result={mockTripSearchResponse()}
        initialStays={[
          {
            id: "hotel-1-partial",
            offerId: "hotel-1",
            nights: 3,
            checkIn: "2025-12-20",
            checkOut: "2025-12-23",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText(`Remove ${mockHotelOffer().hotelName}`));
    await waitFor(() => {
      expect(screen.getByText(/7\/7 nights booked/i)).toBeTruthy();
    });
  });

  it("updates stay nights via stay builder", async () => {
    render(
      <HotelPanelHarness
        result={mockTripSearchResponse()}
        initialStays={[
          {
            id: "hotel-1-partial",
            offerId: "hotel-1",
            nights: 3,
            checkIn: "2025-12-20",
            checkOut: "2025-12-23",
          },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText(`Nights at ${mockHotelOffer().hotelName}`), {
      target: { value: "5" },
    });
    await waitFor(() => {
      expect(screen.getByText(/5\/7 nights booked/i)).toBeTruthy();
    });
  });

  it("replaces full stay when picking different hotel", async () => {
    render(<HotelPanelHarness result={mockTripSearchResponseAllHotels()} />);
    const pickButtons = screen.getAllByRole("button", { name: "Pick" });
    fireEvent.click(pickButtons[pickButtons.length - 1]!);
    const comboboxes = screen.getAllByRole("combobox");
    fireEvent.change(comboboxes[comboboxes.length - 1]!, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /Add 7 nights/i }));
    await waitFor(() => {
      expect(screen.getAllByText(/Budget Stay/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/7\/7 nights booked/i)).toBeTruthy();
    });
  });
});
