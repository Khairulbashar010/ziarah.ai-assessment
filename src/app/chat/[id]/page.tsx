"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { TripTopBar } from "@/components/layout/trip-top-bar";
import { ChatPanel } from "@/components/chat/chat-panel";
import { INITIAL_PROCESSING_STEPS } from "@/components/chat/processing-steps";
import { FlightResultsLoading } from "@/components/flights/flight-results-loading";
import { TripResultsPanel } from "@/components/trip/trip-results-panel";
import { buildAssistantReply, type ChatMessage } from "@/lib/chat/messages";
import {
  fetchTripResult,
  getTripFromCache,
  saveTripToCache,
  searchTripClientStream,
} from "@/lib/client/trip-search";
import { applyOffersUpdate } from "@/lib/trip-search/client-payload";
import { buildTripSearchShell } from "@/lib/client/trip-search-shell";
import type { TripSearchParams, TripSearchResponse } from "@/lib/types/trip";
import { formatDateRange } from "@/lib/utils/dates";
import { totalPassengers } from "@/lib/utils/trip";

import type { ProcessingStep } from "@/components/chat/processing-steps";

function advanceProcessingSteps(steps: ProcessingStep[], activeId: string): ProcessingStep[] {
  const activeIndex = steps.findIndex((step) => step.id === activeId);
  if (activeIndex === -1) return steps;

  return steps.map((step, index) => {
    if (index < activeIndex) return { ...step, status: "done" as const };
    if (index === activeIndex) return { ...step, status: "active" as const };
    return { ...step, status: "pending" as const };
  });
}

function initialAssistantMessage(
  params: TripSearchParams,
  result: TripSearchResponse | null,
  query: string,
): ChatMessage {
  return {
    id: uuidv4(),
    role: "assistant",
    content: buildAssistantReply(params, result, query),
    params,
    result: result
      ? { flights: result.flights, tripSummary: result.tripSummary }
      : undefined,
  };
}

type Phase = "loading" | "results";

function ChatPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const requestId = params.id as string;
  const queryParam = searchParams.get("q") ?? "";
  const shouldSearch = searchParams.get("search") === "1";

  const [result, setResult] = useState<TripSearchResponse | null>(null);
  const [parsedParams, setParsedParams] = useState<TripSearchParams | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<Phase>(shouldSearch ? "loading" : "results");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Starting your trip search...");
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>(INITIAL_PROCESSING_STEPS);
  const [error, setError] = useState<string | null>(null);
  const tripContextRef = useRef<TripSearchParams | null>(null);

  const runSearch = useCallback(
    async (query: string, context?: TripSearchParams | null) => {
      setPhase("loading");
      setLoadingProgress(0);
      setStatusMessage(
        context ? "Updating your trip details..." : "Starting your trip search...",
      );
      setProcessingSteps(INITIAL_PROCESSING_STEPS);
      setError(null);

      try {
        await searchTripClientStream(
          query,
          {
            requestId,
            onEvent: (event) => {
              if (event.type === "status") {
                setStatusMessage(event.message);
                if (event.progress !== undefined) setLoadingProgress(event.progress);

                if (event.message.toLowerCase().includes("understanding")) {
                  setProcessingSteps((steps) => advanceProcessingSteps(steps, "understand"));
                }
                if (event.message.toLowerCase().includes("updating")) {
                  setProcessingSteps((steps) => advanceProcessingSteps(steps, "understand"));
                }
                if (event.message.toLowerCase().includes("planning a new")) {
                  setProcessingSteps((steps) => advanceProcessingSteps(steps, "understand"));
                }
                if (event.message.toLowerCase().includes("extracting")) {
                  setProcessingSteps((steps) => advanceProcessingSteps(steps, "parse"));
                }
                if (event.message.toLowerCase().includes("searching our flight")) {
                  setProcessingSteps((steps) => advanceProcessingSteps(steps, "flights"));
                }
                if (event.message.toLowerCase().includes("building your itinerary")) {
                  setProcessingSteps((steps) => advanceProcessingSteps(steps, "build"));
                }
              }

              if (event.type === "parsed") {
                setParsedParams(event.params);
                tripContextRef.current = event.params;
                setResult(buildTripSearchShell(requestId, event.params));
                setLoadingProgress((prev) => Math.max(prev, 30));
                setProcessingSteps((steps) => advanceProcessingSteps(steps, "flights"));
                setStatusMessage("Searching flight inventory...");
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === "assistant") {
                    next[next.length - 1] = { ...last, params: event.params };
                  }
                  return next;
                });
              }

              if (event.type === "offers_update") {
                setResult((prev) =>
                  prev ? applyOffersUpdate(prev, event.update) : prev,
                );
              }

              if (event.type === "provider") {
                setLoadingProgress((prev) => Math.max(prev, 40 + event.status.offerCount));
                if (event.provider === "hotelbeds") {
                  setProcessingSteps((steps) => advanceProcessingSteps(steps, "hotels"));
                }
                setStatusMessage(
                  event.status.domain === "flights"
                    ? "Flight options matched to your trip"
                    : "Hotel stays matched to your trip",
                );
              }

              if (event.type === "complete") {
                saveTripToCache(requestId, query, event.result);
                setResult(event.result);
                setParsedParams(event.result.parsedQuery);
                tripContextRef.current = event.result.parsedQuery;
                setLoadingProgress(100);
                setProcessingSteps((steps) =>
                  steps.map((step) => ({ ...step, status: "done" as const })),
                );
                setPhase("results");

                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === "assistant") {
                    next[next.length - 1] = {
                      ...last,
                      params: event.result.parsedQuery,
                      content: buildAssistantReply(
                        event.result.parsedQuery,
                        event.result,
                        query,
                      ),
                      result: {
                        flights: event.result.flights,
                        tripSummary: event.result.tripSummary,
                      },
                    };
                  }
                  return next;
                });
              }
            },
          },
          context,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setPhase("results");
      }
    },
    [requestId],
  );

  useEffect(() => {
    async function load() {
      const cached = getTripFromCache(requestId);
      if (cached) {
        const query = cached.query || queryParam;
        setResult(cached.result);
        setParsedParams(cached.result.parsedQuery);
        tripContextRef.current = cached.result.parsedQuery;
        setMessages([
          { id: uuidv4(), role: "user", content: query },
          initialAssistantMessage(cached.result.parsedQuery, cached.result, query),
        ]);
        setPhase("results");
        return;
      }

      if (shouldSearch && queryParam) {
        setMessages([
          { id: uuidv4(), role: "user", content: queryParam },
          {
            id: uuidv4(),
            role: "assistant",
            content: "",
          },
        ]);
        await runSearch(queryParam);
        return;
      }

      const data = await fetchTripResult(requestId);
      if (data) {
        setResult(data);
        setParsedParams(data.parsedQuery);
        tripContextRef.current = data.parsedQuery;
        setMessages([
          {
            id: uuidv4(),
            role: "user",
            content: queryParam || "Trip search",
          },
          initialAssistantMessage(data.parsedQuery, data, queryParam),
        ]);
        setPhase("results");
      } else {
        setError("Trip not found. Start a new search from the home page.");
      }
    }

    load();
  }, [requestId, queryParam, shouldSearch, runSearch]);

  const handleSendMessage = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      setMessages((prev) => [
        ...prev,
        { id: uuidv4(), role: "user", content: trimmed },
        { id: uuidv4(), role: "assistant", content: "" },
      ]);

      if (/^looks good$/i.test(trimmed)) {
        const context = tripContextRef.current ?? parsedParams ?? result?.parsedQuery ?? null;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            id: next[next.length - 1].id,
            role: "assistant",
            content: buildAssistantReply(context!, result, trimmed),
            params: context ?? undefined,
          };
          return next;
        });
        return;
      }

      const context = tripContextRef.current ?? parsedParams ?? result?.parsedQuery ?? null;
      await runSearch(trimmed, context);
    },
    [parsedParams, result, runSearch],
  );

  const dates = (parsedParams ?? result?.parsedQuery)
    ? formatDateRange(
        (parsedParams ?? result!.parsedQuery).hotels.checkIn,
        (parsedParams ?? result!.parsedQuery).hotels.checkOut,
      )
    : undefined;
  const travellers = (parsedParams ?? result?.parsedQuery)
    ? `${totalPassengers((parsedParams ?? result!.parsedQuery).flights.passengers)} travellers`
    : undefined;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <TripTopBar dates={dates} travellers={travellers} />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[38%] min-w-[300px] max-w-[480px] border-r border-gray-100">
          {error ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-red-500">
              {error}
            </div>
          ) : (
            <ChatPanel
              messages={messages}
              result={result}
              parsedParams={parsedParams}
              loading={phase === "loading"}
              loadingProgress={loadingProgress}
              statusMessage={statusMessage}
              processingSteps={processingSteps}
              onSendMessage={handleSendMessage}
            />
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          {phase === "loading" && !result && <FlightResultsLoading />}
          {result && (
            <TripResultsPanel result={result} searching={phase === "loading"} />
          )}
        </div>
      </div>
    </div>
  );
}

function ChatPageFallback() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <div className="h-14 shrink-0 border-b border-gray-100 bg-gray-50" />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[38%] min-w-[300px] max-w-[480px] border-r border-gray-100 bg-gray-50" />
        <div className="flex-1 overflow-hidden">
          <FlightResultsLoading />
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatPageFallback />}>
      <ChatPageContent />
    </Suspense>
  );
}
