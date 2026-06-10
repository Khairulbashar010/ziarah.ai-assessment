/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ChatPage from "@/app/chat/[id]/page";
import { mockParsedQuery, mockTripSearchResponse } from "../../../components/fixtures/trip-mocks";
import { USER_ERRORS } from "@/lib/user-messages";

const requestId = "chat-test-id";
const searchTripClientStream = vi.fn();
const getTripFromCache = vi.fn();
const saveTripToCache = vi.fn();
const fetchTripResult = vi.fn();
const toastError = vi.fn();

let searchParams = new URLSearchParams();
let searchParamsReady = true;
let resolveSearchParams: (() => void) | undefined;
let searchParamsSuspendPromise: Promise<void> | undefined;

const toastApi = {
  error: toastError,
  success: vi.fn(),
  info: vi.fn(),
  toast: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: requestId }),
  useSearchParams: () => {
    if (!searchParamsReady) {
      if (!searchParamsSuspendPromise) {
        searchParamsSuspendPromise = new Promise<void>((resolve) => {
          resolveSearchParams = () => {
            searchParamsReady = true;
            resolve();
          };
        });
      }
      throw searchParamsSuspendPromise;
    }
    return searchParams;
  },
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

let uuidCounter = 0;
vi.mock("uuid", () => ({
  v4: () => `uuid-mock-${++uuidCounter}`,
}));

vi.mock("@/lib/client/trip-search", () => ({
  searchTripClientStream: (...args: unknown[]) => searchTripClientStream(...args),
  getTripFromCache: (...args: unknown[]) => getTripFromCache(...args),
  saveTripToCache: (...args: unknown[]) => saveTripToCache(...args),
  fetchTripResult: (...args: unknown[]) => fetchTripResult(...args),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => toastApi,
}));

describe("ChatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    searchParamsReady = true;
    searchParamsSuspendPromise = undefined;
    resolveSearchParams = undefined;
    searchParams = new URLSearchParams();
    getTripFromCache.mockReturnValue(null);
    fetchTripResult.mockResolvedValue(null);
    searchTripClientStream.mockResolvedValue(undefined);
  });

  it("shows suspense fallback while search params load", async () => {
    searchParamsReady = false;
    getTripFromCache.mockReturnValue({
      query: "Trip",
      result: mockTripSearchResponse(),
    });

    render(<ChatPage />);
    expect(document.querySelector(".skeleton-shimmer, .animate-pulse")).toBeTruthy();

    await act(async () => {
      resolveSearchParams?.();
      await searchParamsSuspendPromise;
    });

    await waitFor(() => {
      expect(screen.getByText(/Dubai to London/i)).toBeTruthy();
    });
  });

  it("loads cached trip", async () => {
    const result = mockTripSearchResponse();
    getTripFromCache.mockReturnValue({ query: "Cached trip", result });

    render(<ChatPage />);
    await waitFor(() => {
      expect(screen.getByText("Cached trip")).toBeTruthy();
    });
    expect(screen.getByText(/Dubai to London/i)).toBeTruthy();
  });

  it("runs search stream when search=1 and query present", async () => {
    searchParams = new URLSearchParams("q=Dubai%20to%20London&search=1");
    const result = mockTripSearchResponse();

    searchTripClientStream.mockImplementation(async (_query, opts) => {
      opts.onEvent({ type: "status", message: "Understanding your trip", progress: 10 });
      opts.onEvent({ type: "status", message: "Extracting travel details" });
      opts.onEvent({ type: "parsed", params: mockParsedQuery });
      opts.onEvent({
        type: "offers_update",
        update: {
          meta: result.meta,
          providers: result.providers,
          flights: result.flights,
          hotels: result.hotels,
          tripSummary: result.tripSummary,
        },
      });
      opts.onEvent({
        type: "provider",
        provider: "sabre",
        status: { domain: "flights", status: "success", offerCount: 5, durationMs: 100 },
      });
      opts.onEvent({
        type: "provider",
        provider: "hotelbeds",
        status: { domain: "hotels", status: "success", offerCount: 3, durationMs: 90 },
      });
      opts.onEvent({ type: "status", message: "Searching our flight partners" });
      opts.onEvent({ type: "status", message: "Building your itinerary" });
      opts.onEvent({ type: "status", message: "Updating your trip details" });
      opts.onEvent({ type: "status", message: "Planning a new trip" });
      opts.onEvent({ type: "complete", result });
    });

    render(<ChatPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Dubai to London").length).toBeGreaterThan(0);
    });
    expect(searchTripClientStream).toHaveBeenCalled();
    expect(saveTripToCache).toHaveBeenCalledWith(requestId, "Dubai to London", result);
    await waitFor(() => {
      expect(screen.getAllByText(/Dubai to London/i).length).toBeGreaterThan(0);
    });
  });

  it("fetches trip by id when not cached and not searching", async () => {
    const result = mockTripSearchResponse();
    fetchTripResult.mockResolvedValue(result);

    render(<ChatPage />);
    await waitFor(() => {
      expect(screen.getByText(/Dubai to London/i)).toBeTruthy();
    });
    expect(fetchTripResult).toHaveBeenCalledWith(requestId);
  });

  it("shows toast when trip not found", async () => {
    render(<ChatPage />);
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(USER_ERRORS.notFound);
    });
  });

  it("handles search errors with toast and assistant message", async () => {
    searchParams = new URLSearchParams("q=Broken%20trip&search=1");
    searchTripClientStream.mockRejectedValue(new Error("OPENAI_API_KEY missing"));

    render(<ChatPage />);
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText(/ran into a problem/i)).toBeTruthy();
    });
  });

  it("handles looks good message without re-searching", async () => {
    const result = mockTripSearchResponse();
    getTripFromCache.mockReturnValue({ query: "Trip", result });

    render(<ChatPage />);
    await waitFor(() => expect(screen.getByText(/Dubai to London/i)).toBeTruthy());

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Looks good" } });
    fireEvent.click(screen.getAllByRole("button").find((b) => b.querySelector(".lucide-arrow-up"))!);

    await waitFor(() => {
      expect(searchTripClientStream).not.toHaveBeenCalled();
    });
  });

  it("sends follow-up message to run search with context", async () => {
    const result = mockTripSearchResponse();
    getTripFromCache.mockReturnValue({ query: "Trip", result });

    render(<ChatPage />);
    await waitFor(() => expect(screen.getByText(/Dubai to London/i)).toBeTruthy());

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Add a day in Paris" } });
    fireEvent.click(screen.getAllByRole("button").find((b) => b.querySelector(".lucide-arrow-up"))!);

    await waitFor(() => {
      expect(searchTripClientStream).toHaveBeenCalledWith(
        "Add a day in Paris",
        expect.objectContaining({ requestId }),
        mockParsedQuery,
      );
    });
  });

  it("shows flight loading before parsed results arrive", async () => {
    searchParams = new URLSearchParams("q=New%20trip&search=1");
    searchTripClientStream.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        }),
    );

    render(<ChatPage />);
    await waitFor(() => {
      expect(screen.getByText("New trip")).toBeTruthy();
    });
    expect(document.querySelector(".skeleton-shimmer")).toBeTruthy();
    await waitFor(() => {
      expect(searchTripClientStream).toHaveBeenCalled();
    });
  });

  it("uses query param when cache has empty query", async () => {
    searchParams = new URLSearchParams("q=From%20query");
    const result = mockTripSearchResponse();
    getTripFromCache.mockReturnValue({ query: "", result });

    render(<ChatPage />);
    await waitFor(() => {
      expect(screen.getByText("From query")).toBeTruthy();
    });
  });

  it("ignores empty follow-up messages", async () => {
    const result = mockTripSearchResponse();
    getTripFromCache.mockReturnValue({ query: "Trip", result });

    render(<ChatPage />);
    await waitFor(() => expect(screen.getAllByText(/Dubai to London/i).length).toBeGreaterThan(0));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "   " } });
    const sendBtn = screen.getAllByRole("button").find((b) => b.querySelector(".lucide-arrow-up"));
    expect(sendBtn).toHaveProperty("disabled", true);
    expect(searchTripClientStream).not.toHaveBeenCalled();
  });
});
