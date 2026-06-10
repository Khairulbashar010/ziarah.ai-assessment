/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "@/components/landing/hero";

describe("Hero", () => {
  it("renders headline and description", () => {
    render(<Hero />);
    expect(screen.getByRole("heading", { name: /Meet Ziarah Travel AI/i })).toBeTruthy();
    expect(
      screen.getByText(/Your personal AI travel agent that plans and books complete trips/i),
    ).toBeTruthy();
  });
});
