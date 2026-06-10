/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuickChips } from "@/components/landing/quick-chips";

describe("QuickChips", () => {
  it("renders all chip labels", () => {
    render(<QuickChips onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Book Package/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Inspire Me/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Surprise Me/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Trending Now/i })).toBeTruthy();
  });

  it("calls onSelect with query when chip clicked", () => {
    const onSelect = vi.fn();
    render(<QuickChips onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Inspire Me/i }));
    expect(onSelect).toHaveBeenCalledWith("Plan a 5-day Japan trip with flights and hotels");
  });

  it("calls onSelect for each chip variant", () => {
    const onSelect = vi.fn();
    render(<QuickChips onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Book Package/i }));
    fireEvent.click(screen.getByRole("button", { name: /Surprise Me/i }));
    fireEvent.click(screen.getByRole("button", { name: /Trending Now/i }));
    expect(onSelect).toHaveBeenCalledWith(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );
    expect(onSelect).toHaveBeenCalledWith("Weekend getaway from Dubai under $1500");
    expect(onSelect).toHaveBeenCalledWith("Romantic weekend in Paris from London, March 14-16");
  });

  it("highlights selected chip", () => {
    const query = "Plan a 5-day Japan trip with flights and hotels";
    const { container } = render(<QuickChips onSelect={vi.fn()} selected={query} />);
    const inspireBtn = screen.getByRole("button", { name: /Inspire Me/i });
    expect(inspireBtn.className).toContain("bg-purple-500/20");
    const bookBtn = screen.getByRole("button", { name: /Book Package/i });
    expect(bookBtn.className).not.toContain("bg-purple-500/20");
    expect(container).toBeTruthy();
  });
});
