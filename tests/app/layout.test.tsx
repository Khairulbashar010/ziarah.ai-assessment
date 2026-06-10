/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RootLayout, { metadata } from "@/app/layout";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-mock" }),
}));

vi.mock("@/app/globals.css", () => ({}));

describe("RootLayout", () => {
  it("exports metadata", () => {
    expect(metadata.title).toBe("Ziarah Travel AI — Trip Search");
    expect(metadata.description).toContain("AI-powered");
  });

  it("renders children inside ToastProvider", () => {
    render(
      <RootLayout>
        <div>child content</div>
      </RootLayout>,
    );
    expect(screen.getByText("child content")).toBeTruthy();
    expect(document.documentElement.className).toContain("--font-geist-mock");
  });
});
