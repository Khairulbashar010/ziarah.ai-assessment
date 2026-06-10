/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/ui/toast";

function ToastHarness({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useToast>) => void;
}) {
  const api = useToast();
  onReady(api);
  return <div>app</div>;
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    let uuid = 0;
    vi.stubGlobal("crypto", {
      randomUUID: () => `toast-${++uuid}`,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("throws when useToast is used outside provider", () => {
    function Bad() {
      useToast();
      return null;
    }
    expect(() => render(<Bad />)).toThrow("useToast must be used within ToastProvider");
  });

  it("shows success, error, and info toasts with descriptions", () => {
    let api!: ReturnType<typeof useToast>;
    render(
      <ToastProvider>
        <ToastHarness onReady={(a) => (api = a)} />
      </ToastProvider>,
    );

    act(() => {
      api.success("Saved", "Trip saved successfully");
      api.error("Failed", "Something broke");
      api.info("Heads up");
      api.toast({ title: "Custom", variant: "success", durationMs: 10_000 });
    });

    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.getByText("Trip saved successfully")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Something broke")).toBeTruthy();
    expect(screen.getByText("Heads up")).toBeTruthy();
    expect(screen.getByText("Custom")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(4);
  });

  it("dismisses toast on button click", () => {
    let api!: ReturnType<typeof useToast>;
    render(
      <ToastProvider>
        <ToastHarness onReady={(a) => (api = a)} />
      </ToastProvider>,
    );

    act(() => api.info("Dismiss me"));
    expect(screen.getByText("Dismiss me")).toBeTruthy();

    fireEvent.click(screen.getAllByLabelText("Dismiss")[0]!);
    expect(screen.queryByText("Dismiss me")).toBeNull();
  });

  it("auto-dismisses after duration", () => {
    let api!: ReturnType<typeof useToast>;
    render(
      <ToastProvider>
        <ToastHarness onReady={(a) => (api = a)} />
      </ToastProvider>,
    );

    act(() => api.toast({ title: "Temporary", durationMs: 3000 }));
    expect(screen.getByText("Temporary")).toBeTruthy();

    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByText("Temporary")).toBeNull();
  });

  it("clears timers on unmount", () => {
    let api!: ReturnType<typeof useToast>;
    const { unmount } = render(
      <ToastProvider>
        <ToastHarness onReady={(a) => (api = a)} />
      </ToastProvider>,
    );

    act(() => api.info("Cleanup"));
    unmount();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByText("Cleanup")).toBeNull();
  });
});
