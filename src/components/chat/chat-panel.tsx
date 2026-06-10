"use client";

import { useState } from "react";
import { ArrowUp, Sparkles, Check, Circle, Loader2 } from "lucide-react";
import { getAirportByCode } from "@/lib/geo/airports";
import { resolveFlightAirportCode } from "@/lib/geo/resolve-flight-airport";
import type { ChatMessage } from "@/lib/chat/messages";
import type { TripSearchParams, TripSearchResponse } from "@/lib/types/trip";
import { formatDateLong, nightsBetween } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import type { ProcessingStep } from "@/components/chat/processing-steps";

export type { ProcessingStep };

type ChatPanelProps = {
  messages: ChatMessage[];
  result?: TripSearchResponse | null;
  parsedParams?: TripSearchParams | null;
  loading?: boolean;
  loadingProgress?: number;
  statusMessage?: string;
  processingSteps?: ProcessingStep[];
  onSendMessage: (message: string) => void;
};

function TripSummaryBullets({ params }: { params: TripSearchParams }) {
  const originCode = resolveFlightAirportCode(params.flights.origin);
  const destCode = resolveFlightAirportCode(params.hotels.destinationCode);
  const origin = getAirportByCode(originCode);
  const dest = getAirportByCode(destCode);
  const nights = nightsBetween(params.hotels.checkIn, params.hotels.checkOut);

  const bullets = [
    `Route: ${origin?.city ?? params.flights.origin} (${originCode}) to ${params.hotels.destination} (${destCode})`,
    `Dates: ${formatDateLong(params.hotels.checkIn)} – ${formatDateLong(params.hotels.checkOut)} (${nights} nights)`,
    `Travelers: ${params.flights.passengers.adults} Adults${params.flights.passengers.children ? `, ${params.flights.passengers.children} Children` : ""}`,
    params.budget
      ? `Budget: $${params.budget.maxTotal.toLocaleString()} ${params.budget.currency}`
      : null,
    "Purpose: Family holiday / Winter wonderland vibes",
  ].filter(Boolean);

  return (
    <ul className="space-y-2 text-sm leading-relaxed text-gray-700">
      {bullets.map((b) => (
        <li key={b} className="flex gap-2">
          <span className="text-gray-400">•</span>
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

function ProcessingStepsList({ steps }: { steps: ProcessingStep[] }) {
  return (
    <div className="space-y-2.5">
      {steps.map((step) => (
        <div
          key={step.id}
          className={cn(
            "flex items-center gap-3 text-sm transition-colors duration-300",
            step.status === "done" && "text-gray-700",
            step.status === "active" && "text-purple-700",
            step.status === "pending" && "text-gray-400",
          )}
        >
          {step.status === "done" ? (
            <Check className="h-4 w-4 shrink-0 text-emerald-500" />
          ) : step.status === "active" ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-500" />
          ) : (
            <Circle className="h-4 w-4 shrink-0" />
          )}
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function AssistantMessage({
  message,
  loading,
  processingSteps,
  statusMessage,
  loadingProgress,
}: {
  message: ChatMessage;
  loading?: boolean;
  processingSteps: ProcessingStep[];
  statusMessage?: string;
  loadingProgress?: number;
}) {
  return (
    <div className="mb-6 flex justify-start">
      <div className="max-w-[95%] space-y-3 rounded-2xl rounded-tl-sm border border-gray-100 bg-gray-50 px-4 py-4">
        {message.params && <TripSummaryBullets params={message.params} />}
        {message.content && (
          <p className="text-sm leading-relaxed text-gray-700">{message.content}</p>
        )}
        {loading && processingSteps.length > 0 && (
          <div className="space-y-3 border-t border-gray-200/80 pt-3">
            <p className="text-sm font-medium text-gray-900">Planning your trip...</p>
            <ProcessingStepsList steps={processingSteps} />
            <p className="text-xs text-gray-500">
              {statusMessage ?? "Searching our flight and hotel inventory..."}
              {loadingProgress && loadingProgress > 0 ? ` · ${loadingProgress}%` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatPanel({
  messages,
  result,
  parsedParams,
  loading,
  loadingProgress = 0,
  statusMessage,
  processingSteps = [],
  onSendMessage,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");

  const params = parsedParams ?? result?.parsedQuery;
  const hasFlightResults = Boolean(result && result.flights.offers.length > 0);
  const noBudgetResults = Boolean(params?.budget && result && !hasFlightResults);

  const actionChips = noBudgetResults
    ? ["Increase budget", "Change dates"]
    : ["Looks good", "Change dates", "Adjust budget"];

  const chipPrompts: Record<string, string> = {
    "Looks good": "Looks good",
    "Change dates": "Change dates to ",
    "Adjust budget": "Increase budget to $",
    "Increase budget": "Increase budget to $",
  };

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed || loading) return;
    onSendMessage(trimmed);
    setDraft("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.map((message, index) => {
          const isLatestAssistant =
            message.role === "assistant" && index === messages.length - 1;

          if (message.role === "user") {
            return (
              <div key={message.id} className="mb-6 flex justify-end">
                <div className="max-w-[90%] rounded-2xl rounded-tr-sm bg-purple-600 px-4 py-3 text-sm leading-relaxed text-white shadow-sm">
                  {message.content}
                </div>
              </div>
            );
          }

          return (
            <AssistantMessage
              key={message.id}
              message={message}
              loading={Boolean(loading && isLatestAssistant)}
              processingSteps={processingSteps}
              statusMessage={statusMessage}
              loadingProgress={loadingProgress}
            />
          );
        })}

        {!loading && result && messages.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {actionChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setDraft(chipPrompts[chip] ?? chip)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-xs font-medium hover:border-purple-300 hover:bg-purple-50",
                    chip === "Increase budget"
                      ? "border-purple-300 bg-purple-50 text-purple-800"
                      : "border-gray-200 text-gray-700",
                  )}
                >
                  {chip}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!result || noBudgetResults}
              className={cn(
                "flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-purple-500/20",
                (!result || noBudgetResults) && "opacity-80 shadow-none",
              )}
            >
              <Sparkles className="h-4 w-4" />
              Search flights
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 p-4">
        <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Modify this trip or ask for something new..."
            rows={2}
            className="w-full resize-none bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
            disabled={loading}
          />
          <button
            type="button"
            onClick={submit}
            disabled={loading || !draft.trim()}
            className="rounded-full bg-accent p-2 text-white transition-opacity disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
        {params && !loading && (
          <p className="mt-2 text-xs text-gray-500">
            Tip: say &quot;increase budget to $7000&quot; to refine this trip, or &quot;from Dubai to
            Paris instead&quot; to start fresh.
          </p>
        )}
      </div>
    </div>
  );
}
