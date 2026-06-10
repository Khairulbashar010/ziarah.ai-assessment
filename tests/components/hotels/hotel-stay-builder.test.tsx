/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HotelStayBuilder } from "@/components/hotels/hotel-stay-builder";
import { mockHotelOffer } from "../fixtures/trip-mocks";

describe("HotelStayBuilder", () => {
  const offer = mockHotelOffer();

  it("returns null when no stays", () => {
    const { container } = render(
      <HotelStayBuilder
        stays={[]}
        offers={[offer]}
        tripNights={7}
        remaining={7}
        onRemove={vi.fn()}
        onUpdateNights={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders stay plan with remaining nights hint", () => {
    render(
      <HotelStayBuilder
        stays={[
          {
            id: "stay-1",
            offerId: offer.id,
            nights: 3,
            checkIn: offer.checkIn,
            checkOut: "2025-12-23",
          },
        ]}
        offers={[offer]}
        tripNights={7}
        remaining={4}
        onRemove={vi.fn()}
        onUpdateNights={vi.fn()}
      />,
    );
    expect(screen.getByText("Your stay plan")).toBeTruthy();
    expect(screen.getByText(/4 left/)).toBeTruthy();
    expect(screen.getByText(/Use/)).toBeTruthy();
    expect(screen.getByText(offer.hotelName)).toBeTruthy();
  });

  it("shows all nights planned message when remaining is zero", () => {
    render(
      <HotelStayBuilder
        stays={[
          {
            id: "stay-1",
            offerId: offer.id,
            nights: 7,
            checkIn: offer.checkIn,
            checkOut: offer.checkOut,
          },
        ]}
        offers={[offer]}
        tripNights={7}
        remaining={0}
        onRemove={vi.fn()}
        onUpdateNights={vi.fn()}
      />,
    );
    expect(screen.getByText(/All nights are planned/i)).toBeTruthy();
  });

  it("calls onUpdateNights and onRemove", () => {
    const onRemove = vi.fn();
    const onUpdateNights = vi.fn();
    render(
      <HotelStayBuilder
        stays={[
          {
            id: "stay-1",
            offerId: offer.id,
            nights: 3,
            checkIn: offer.checkIn,
            checkOut: "2025-12-23",
          },
        ]}
        offers={[offer]}
        tripNights={7}
        remaining={4}
        onRemove={onRemove}
        onUpdateNights={onUpdateNights}
      />,
    );
    fireEvent.change(screen.getByLabelText(`Nights at ${offer.hotelName}`), { target: { value: "5" } });
    expect(onUpdateNights).toHaveBeenCalledWith("stay-1", 5);
    fireEvent.click(screen.getByLabelText(`Remove ${offer.hotelName}`));
    expect(onRemove).toHaveBeenCalledWith("stay-1");
  });

  it("skips stays with missing offer", () => {
    render(
      <HotelStayBuilder
        stays={[
          {
            id: "stay-missing",
            offerId: "missing",
            nights: 2,
            checkIn: offer.checkIn,
            checkOut: "2025-12-22",
          },
        ]}
        offers={[offer]}
        tripNights={7}
        remaining={5}
        onRemove={vi.fn()}
        onUpdateNights={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Remove/)).toBeNull();
  });
});
