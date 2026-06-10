/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HotelCard } from "@/components/hotels/hotel-card";
import { mockHotelOffer } from "../fixtures/trip-mocks";

describe("HotelCard", () => {
  it("renders hotel summary with budget badges and all nights badge", () => {
    const onSelect = vi.fn();
    render(
      <HotelCard
        offer={mockHotelOffer()}
        selected
        onSelect={onSelect}
        withinBudget
        staySegments={[
          {
            id: "s1",
            offerId: "hotel-1",
            nights: 7,
            checkIn: "2025-12-20",
            checkOut: "2025-12-27",
          },
        ]}
      />,
    );
    expect(screen.getByText("Grand London Hotel")).toBeTruthy();
    expect(screen.getByText("In budget")).toBeTruthy();
    expect(screen.getByText(/All 7 nights/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Selected" }));
    expect(onSelect).toHaveBeenCalled();
  });

  it("expands to show details with free cancellation", () => {
    render(<HotelCard offer={mockHotelOffer()} withinBudget={false} />);
    fireEvent.click(screen.getByText("Grand London Hotel").closest("[role=button]")!);
    expect(screen.getByText(/Free cancellation until/i)).toBeTruthy();
    expect(screen.getByText("Over budget")).toBeTruthy();
  });

  it("shows fee cancellation and RECHECK rate", () => {
    render(
      <HotelCard
        offer={mockHotelOffer({
          category: "ABC",
          cancellationPolicies: [{ amount: "150", from: "2025-12-10T00:00:00Z" }],
          rateType: "RECHECK",
        })}
      />,
    );
    fireEvent.click(screen.getByText("Grand London Hotel").closest("[role=button]")!);
    expect(screen.getByText(/fee after/i)).toBeTruthy();
    expect(screen.getByText(/Rate to be confirmed at booking/i)).toBeTruthy();
  });

  it("shows stay segment badges for partial stays", () => {
    render(
      <HotelCard
        offer={mockHotelOffer()}
        selected
        staySegments={[
          {
            id: "s1",
            offerId: "hotel-1",
            nights: 3,
            checkIn: "2025-12-20",
            checkOut: "2025-12-23",
          },
          {
            id: "s2",
            offerId: "hotel-1",
            nights: 2,
            checkIn: "2025-12-23",
            checkOut: "2025-12-25",
          },
        ]}
      />,
    );
    expect(screen.getAllByText(/3n ·/i).length).toBeGreaterThan(0);
  });

  it("handles picking nights flow", () => {
    const onConfirmNights = vi.fn();
    const onCancelPick = vi.fn();
    render(
      <HotelCard
        offer={mockHotelOffer()}
        pickingNights
        maxNights={3}
        defaultNights={2}
        onConfirmNights={onConfirmNights}
        onCancelPick={onCancelPick}
      />,
    );
    expect(screen.getByText(/How many nights/i)).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Add 3 nights/i }));
    expect(onConfirmNights).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelPick).toHaveBeenCalled();
  });

  it("shows close when maxNights is zero", () => {
    const onCancelPick = vi.fn();
    render(
      <HotelCard
        offer={mockHotelOffer()}
        pickingNights
        maxNights={0}
        onCancelPick={onCancelPick}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancelPick).toHaveBeenCalled();
  });

  it("toggles expand with keyboard", () => {
    render(<HotelCard offer={mockHotelOffer()} />);
    const toggle = screen.getByText("Grand London Hotel").closest("[role=button]")!;
    fireEvent.keyDown(toggle, { key: " " });
    expect(screen.getByText("Bed & Breakfast")).toBeTruthy();
  });
});
