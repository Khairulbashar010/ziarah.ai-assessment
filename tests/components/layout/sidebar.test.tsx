/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/layout/sidebar";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    title,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    title?: string;
    className?: string;
  }) => (
    <a href={href} title={title} className={className}>
      {children}
    </a>
  ),
}));

describe("Sidebar", () => {
  it("renders nav links with home active by default", () => {
    render(<Sidebar />);
    const homeLink = screen.getByTitle("Home");
    expect(homeLink.getAttribute("href")).toBe("/");
    expect(homeLink.className).toContain("bg-white/10");
  });

  it("highlights New link with accent style", () => {
    render(<Sidebar active="other" />);
    const newLink = screen.getByTitle("New");
    expect(newLink.className).toContain("bg-accent");
  });
});
