/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FlightCard } from "@/components/flights/flight-card";
import { mockFlightOffer, mockRoundTripFlightOffer } from "../fixtures/trip-mocks";

describe("FlightCard", () => {
  it("renders direct flight summary and selects", () => {
    const onSelect = vi.fn();
    render(
      <FlightCard
        offer={mockFlightOffer()}
        selected
        onSelect={onSelect}
        withinBudget
      />,
    );
    expect(screen.getByText("EK")).toBeTruthy();
    expect(screen.getByText("Direct")).toBeTruthy();
    expect(screen.getByText("Refundable")).toBeTruthy();
    expect(screen.getByText("In budget")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Selected" }));
    expect(onSelect).toHaveBeenCalled();
  });

  it("expands to show leg details on click", () => {
    render(<FlightCard offer={mockRoundTripFlightOffer()} withinBudget={false} />);
    fireEvent.click(screen.getByText("EK").closest("[role=button]")!);
    expect(screen.getByText("Outbound")).toBeTruthy();
    expect(screen.getAllByText("Return").length).toBeGreaterThan(0);
    expect(screen.getByText("Over budget")).toBeTruthy();
    expect(screen.getAllByText(/1 stop/).length).toBeGreaterThan(0);
  });

  it("toggles expand with keyboard", () => {
    render(<FlightCard offer={mockFlightOffer({ stops: 1 })} />);
    const toggle = screen.getByText("EK").closest("[role=button]")!;
    fireEvent.keyDown(toggle, { key: "Enter" });
    expect(screen.getByText("Outbound")).toBeTruthy();
    fireEvent.keyDown(toggle, { key: " " });
    expect(screen.queryByText("Outbound")).toBeNull();
  });

  it("shows per-passenger price when available", () => {
    render(<FlightCard offer={mockFlightOffer({ perPassenger: 350 })} />);
    expect(screen.getByText(/\$350\/pax/)).toBeTruthy();
  });

  it("shows single stop label in expanded leg detail", () => {
    render(
      <FlightCard
        offer={mockFlightOffer({
          stops: 1,
          segments: [
            {
              origin: "DXB",
              destination: "IST",
              departure: "2025-12-20T08:00:00Z",
              arrival: "2025-12-20T12:00:00Z",
              carrier: "TK",
              flightNumber: "100",
            },
            {
              origin: "IST",
              destination: "LHR",
              departure: "2025-12-20T14:00:00Z",
              arrival: "2025-12-20T18:00:00Z",
              carrier: "TK",
              flightNumber: "101",
            },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByText("EK").closest("[role=button]")!);
    expect(screen.getByText("1 stop")).toBeTruthy();
  });

  it("shows multi-stop label for single segment offer", () => {
    render(
      <FlightCard
        offer={mockFlightOffer({ stops: 2, perPassenger: 0 })}
      />,
    );
    expect(screen.getByText("2 stops")).toBeTruthy();
  });
});
