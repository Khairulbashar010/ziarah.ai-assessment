/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripTopBar } from "@/components/layout/trip-top-bar";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe("TripTopBar", () => {
  it("renders brand and new trip link", () => {
    render(<TripTopBar />);
    expect(screen.getByText(/Ziarah/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /New Trip/i })).toHaveProperty("href", expect.stringContaining("/"));
  });

  it("shows dates and travellers when provided", () => {
    render(<TripTopBar dates="Dec 20 – 27" travellers="3 travellers" />);
    expect(screen.getByText("Dec 20 – 27")).toBeTruthy();
    expect(screen.getByText("3 travellers")).toBeTruthy();
  });
});
