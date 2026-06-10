/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OfferSelectButton } from "@/components/ui/offer-select-button";

describe("OfferSelectButton", () => {
  it("shows Pick when not selected", () => {
    render(<OfferSelectButton />);
    expect(screen.getByRole("button", { name: "Pick" })).toBeTruthy();
  });

  it("shows Selected when selected", () => {
    render(<OfferSelectButton selected />);
    expect(screen.getByRole("button", { name: "Selected" })).toBeTruthy();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<OfferSelectButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
