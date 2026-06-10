"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TripTopBar } from "@/components/layout/trip-top-bar";
import { ChatPanel } from "@/components/chat/chat-panel";
import { INITIAL_PROCESSING_STEPS } from "@/components/chat/processing-steps";
import { FlightResultsLoading } from "@/components/flights/flight-results-loading";

function TripWorkspaceLoadingContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <TripTopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[38%] min-w-[300px] max-w-[480px] border-r border-gray-100">
          <ChatPanel
            messages={
              query
                ? [
                    { id: "loading-user", role: "user", content: query },
                    { id: "loading-assistant", role: "assistant", content: "" },
                  ]
                : []
            }
            loading
            loadingProgress={0}
            statusMessage="Starting your trip search..."
            processingSteps={INITIAL_PROCESSING_STEPS}
            onSendMessage={() => {}}
          />
        </div>
        <div className="flex-1 overflow-hidden">
          <FlightResultsLoading />
        </div>
      </div>
    </div>
  );
}

export function TripWorkspaceLoading() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen flex-col overflow-hidden bg-white">
          <TripTopBar />
          <div className="flex flex-1 overflow-hidden">
            <div className="w-[38%] min-w-[300px] max-w-[480px] border-r border-gray-100 p-6">
              <div className="ml-auto h-16 w-4/5 animate-pulse rounded-2xl bg-purple-100" />
            </div>
            <div className="flex-1 overflow-hidden">
              <FlightResultsLoading />
            </div>
          </div>
        </div>
      }
    >
      <TripWorkspaceLoadingContent />
    </Suspense>
  );
}
