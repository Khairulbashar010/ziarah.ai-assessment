/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TripResultsPanel } from "@/components/trip/trip-results-panel";
import {
  mockFlightOffer,
  mockHotelOffer,
  mockTripSearchResponse,
} from "../fixtures/trip-mocks";

describe("TripResultsPanel", () => {
  it("renders flights tab with trip header and footer", () => {
    render(<TripResultsPanel result={mockTripSearchResponse()} />);
    expect(screen.getByText(/Dubai to London/i)).toBeTruthy();
    expect(screen.getByText(/\$5,000 budget/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Flights/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hotels/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Book Now" })).toBeTruthy();
  });

  it("switches to hotels tab", () => {
    render(<TripResultsPanel result={mockTripSearchResponse()} />);
    fireEvent.click(screen.getByRole("button", { name: /Hotels/i }));
    expect(screen.getByText("Your stay plan")).toBeTruthy();
    expect(screen.getAllByText("Grand London Hotel").length).toBeGreaterThan(0);
  });

  it("allows selecting a different flight from the list", async () => {
    const expensiveFlight = mockFlightOffer({
      id: "flight-expensive",
      totalPrice: 4500,
      validatingCarrier: "QR",
    });
    const cheapHotel = mockHotelOffer({ id: "hotel-cheap", totalPrice: 400 });
    render(
      <TripResultsPanel
        result={mockTripSearchResponse({
          flights: {
            totalOffers: 2,
            truncated: false,
            withinBudget: true,
            offers: [expensiveFlight, mockFlightOffer()],
          },
          hotels: {
            totalOffers: 1,
            truncated: false,
            offers: [cheapHotel],
          },
        })}
      />,
    );
    const pickButtons = screen.getAllByRole("button", { name: "Pick" });
    fireEvent.click(pickButtons[pickButtons.length - 1]!);
    await waitFor(() => {
      expect(screen.getAllByText("EK").length).toBeGreaterThan(0);
    });
  });

  it("expands footer with flight and hotel breakdown", () => {
    render(
      <TripResultsPanel
        result={mockTripSearchResponse({
          hotels: {
            totalOffers: 1,
            truncated: false,
            offers: [mockHotelOffer()],
          },
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand trip breakdown"));
    expect(screen.getByText(/EK flight/i)).toBeTruthy();
    expect(screen.getAllByText(/Grand London Hotel/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Trip total")).toBeTruthy();
  });

  it("shows searching state while partial results stream in", () => {
    render(
      <TripResultsPanel
        result={mockTripSearchResponse({
          meta: { ...mockTripSearchResponse().meta, partialResults: true },
        })}
        searching
      />,
    );
    expect(screen.getByText(/Still searching/i)).toBeTruthy();
  });

  it("renders one-way trip without return timeline planes duplicated", () => {
    render(
      <TripResultsPanel
        result={mockTripSearchResponse({
          parsedQuery: {
            ...mockTripSearchResponse().parsedQuery,
            tripType: "ONE_WAY",
          },
        })}
      />,
    );
    expect(screen.getByText(/Dubai to London/i)).toBeTruthy();
  });

  it("works without budget", () => {
    render(
      <TripResultsPanel
        result={mockTripSearchResponse({
          parsedQuery: {
            ...mockTripSearchResponse().parsedQuery,
            budget: undefined,
          },
        })}
      />,
    );
    expect(screen.queryByText(/\$5,000 budget/)).toBeNull();
  });

  it("replaces the hotel when a pricier flight exceeds the budget", async () => {
    const expensiveFlight = mockFlightOffer({
      id: "flight-over",
      totalPrice: 4800,
      validatingCarrier: "QR",
    });
    const cheapHotel = mockHotelOffer({ id: "hotel-cheap", totalPrice: 100, hotelName: "Budget Inn" });
    const priceyHotel = mockHotelOffer({ id: "hotel-pricey", totalPrice: 800, hotelName: "Luxury Stay" });

    render(
      <TripResultsPanel
        result={mockTripSearchResponse({
          flights: {
            totalOffers: 2,
            truncated: false,
            withinBudget: true,
            offers: [expensiveFlight, mockFlightOffer({ id: "flight-ok", totalPrice: 900 })],
          },
          hotels: {
            totalOffers: 2,
            truncated: false,
            offers: [priceyHotel, cheapHotel],
          },
        })}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Pick" })[0]!);

    await waitFor(() => {
      expect(screen.getAllByText("Budget Inn").length).toBeGreaterThan(0);
    });
  });

  it("switches back to the flights tab from hotels", () => {
    render(<TripResultsPanel result={mockTripSearchResponse()} />);
    fireEvent.click(screen.getByRole("button", { name: /Hotels/i }));
    fireEvent.click(screen.getByRole("button", { name: /Flights/i }));
    expect(screen.getAllByText("EK").length).toBeGreaterThan(0);
  });

  it("shows multi-stay hotel summary and breakdown in the footer", async () => {
    const hotelA = mockHotelOffer({ id: "hotel-a", hotelName: "Hotel Alpha", totalPrice: 600 });
    const hotelB = mockHotelOffer({ id: "hotel-b", hotelName: "Hotel Beta", totalPrice: 400 });

    render(
      <TripResultsPanel
        result={mockTripSearchResponse({
          hotels: {
            totalOffers: 2,
            truncated: false,
            offers: [hotelA, hotelB],
          },
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Hotels/i }));
    fireEvent.change(screen.getByLabelText(/Nights at Hotel Beta/i), { target: { value: "3" } });

    const pickButtons = screen.getAllByRole("button", { name: "Pick" });
    fireEvent.click(pickButtons[pickButtons.length - 1]!);

    await waitFor(() => {
      expect(screen.getByText(/How many nights at Hotel Alpha/i)).toBeTruthy();
    });

    const nightPicker = screen.getAllByRole("combobox").at(-1)!;
    fireEvent.change(nightPicker, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /Add 4 nights/i }));
    fireEvent.click(screen.getByLabelText("Expand trip breakdown"));

    expect(screen.getByText(/2 hotel stays/i)).toBeTruthy();
    expect(screen.getAllByText(/Hotel Alpha/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Hotel Beta/i).length).toBeGreaterThan(0);
  });

  it("uses singular traveller copy for one passenger", () => {
    render(
      <TripResultsPanel
        result={mockTripSearchResponse({
          parsedQuery: {
            ...mockTripSearchResponse().parsedQuery,
            flights: {
              ...mockTripSearchResponse().parsedQuery.flights,
              passengers: { adults: 1, children: 0, infants: 0 },
            },
          },
        })}
      />,
    );

    expect(screen.getByText("1 traveller")).toBeTruthy();
  });
});
