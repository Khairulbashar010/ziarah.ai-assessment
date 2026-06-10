/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HomePage from "@/app/page";

const navigateToTripSearch = vi.fn();

vi.mock("@/lib/client/navigate-to-trip", () => ({
  navigateToTripSearch: (...args: unknown[]) => navigateToTripSearch(...args),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

describe("HomePage", () => {
  beforeEach(() => {
    navigateToTripSearch.mockClear();
  });

  it("renders hero and search input", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: /Meet Ziarah Travel AI/i })).toBeTruthy();
    expect(screen.getByPlaceholderText(/Plan a 5-day Japan trip/i)).toBeTruthy();
  });

  it("navigates when search submitted with query", () => {
    render(<HomePage />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Dubai to London" } });
    fireEvent.click(screen.getAllByRole("button").find((b) => !b.textContent) ?? screen.getAllByRole("button")[0]!);
    expect(navigateToTripSearch).toHaveBeenCalledWith("Dubai to London");
  });

  it("selects quick chip query", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: /Inspire Me/i }));
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.value).toContain("Japan");
  });

  it("does not navigate with empty query", () => {
    render(<HomePage />);
    fireEvent.click(screen.getAllByRole("button").find((b) => !b.textContent) ?? screen.getAllByRole("button")[0]!);
    expect(navigateToTripSearch).not.toHaveBeenCalled();
  });
});
