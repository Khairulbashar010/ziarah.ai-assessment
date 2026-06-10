/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripWorkspaceLoading } from "@/components/trip/trip-workspace-loading";

const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockGet }),
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

describe("TripWorkspaceLoading", () => {
  it("renders chat loading state with query param", async () => {
    mockGet.mockReturnValue("Dubai to Tokyo");
    render(<TripWorkspaceLoading />);
    expect(await screen.findByText("Dubai to Tokyo")).toBeTruthy();
    expect(screen.getByText("Planning your trip...")).toBeTruthy();
  });

  it("renders without messages when query is empty", async () => {
    mockGet.mockReturnValue("");
    render(<TripWorkspaceLoading />);
    await screen.findByText(/Ziarah/);
    expect(screen.queryByText("Planning your trip...")).toBeNull();
  });

  it("renders suspense fallback while search params load", async () => {
    let ready = false;
    mockGet.mockImplementation(() => {
      if (!ready) {
        throw new Promise<void>((resolve) => {
          setTimeout(() => {
            ready = true;
            resolve();
          }, 0);
        });
      }
      return "";
    });

    render(<TripWorkspaceLoading />);
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
    await screen.findByText(/Ziarah/);
  });
});
