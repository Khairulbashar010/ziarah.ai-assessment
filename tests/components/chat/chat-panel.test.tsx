/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { INITIAL_PROCESSING_STEPS } from "@/components/chat/processing-steps";
import { mockParsedQuery, mockTripSearchResponse } from "../fixtures/trip-mocks";

describe("ChatPanel", () => {
  const baseMessages = [
    { id: "u1", role: "user" as const, content: "Dubai to London" },
    {
      id: "a1",
      role: "assistant" as const,
      content: "Here is your trip plan.",
      params: mockParsedQuery,
    },
  ];

  it("renders user and assistant messages with trip bullets", () => {
    render(
      <ChatPanel
        messages={baseMessages}
        result={mockTripSearchResponse()}
        parsedParams={mockParsedQuery}
        onSendMessage={vi.fn()}
      />,
    );
    expect(screen.getByText("Dubai to London")).toBeTruthy();
    expect(screen.getByText(/Route:/)).toBeTruthy();
    expect(screen.getByText(/Budget:/)).toBeTruthy();
    expect(screen.getByText(/Children/)).toBeTruthy();
    expect(screen.getByText("Here is your trip plan.")).toBeTruthy();
  });

  it("shows processing steps while loading latest assistant message", () => {
    render(
      <ChatPanel
        messages={[
          { id: "u1", role: "user", content: "Search" },
          { id: "a1", role: "assistant", content: "" },
        ]}
        loading
        loadingProgress={40}
        statusMessage="Searching our flight inventory"
        processingSteps={INITIAL_PROCESSING_STEPS}
        onSendMessage={vi.fn()}
      />,
    );
    expect(screen.getByText("Planning your trip...")).toBeTruthy();
    expect(screen.getByText("Understanding your trip")).toBeTruthy();
  });

  it("shows no-budget action chips when budget set but no flights", () => {
    render(
      <ChatPanel
        messages={baseMessages}
        result={mockTripSearchResponse({
          flights: { totalOffers: 0, truncated: false, withinBudget: false, offers: [] },
        })}
        parsedParams={mockParsedQuery}
        onSendMessage={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Increase budget" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change dates" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Increase budget" }));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Increase budget to $");
  });

  it("shows default action chips and fills draft on chip click", () => {
    render(
      <ChatPanel
        messages={baseMessages}
        result={mockTripSearchResponse()}
        parsedParams={mockParsedQuery}
        onSendMessage={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Looks good" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Looks good");
    fireEvent.click(screen.getByRole("button", { name: "Adjust budget" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("Increase budget");
  });

  it("sends message on submit and clears draft", () => {
    const onSendMessage = vi.fn();
    render(
      <ChatPanel
        messages={baseMessages}
        result={mockTripSearchResponse()}
        onSendMessage={onSendMessage}
      />,
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Change dates to March" } });
    fireEvent.click(screen.getAllByRole("button").find((b) => b.querySelector(".lucide-arrow-up"))!);
    expect(onSendMessage).toHaveBeenCalledWith("Change dates to March");
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("submits on Enter and blocks while loading", () => {
    const onSendMessage = vi.fn();
    render(
      <ChatPanel
        messages={baseMessages}
        loading
        onSendMessage={onSendMessage}
      />,
    );
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveProperty("disabled", true);
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("shows tip when params available and not loading", () => {
    render(
      <ChatPanel
        messages={baseMessages}
        parsedParams={mockParsedQuery}
        onSendMessage={vi.fn()}
      />,
    );
    expect(screen.getByText(/increase budget to \$7000/i)).toBeTruthy();
  });

  it("fills Change dates chip prompt", () => {
    render(
      <ChatPanel
        messages={baseMessages}
        result={mockTripSearchResponse()}
        parsedParams={mockParsedQuery}
        onSendMessage={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change dates" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Change dates to ");
  });

  it("shows Search flights button when results available", () => {
    render(
      <ChatPanel
        messages={baseMessages}
        result={mockTripSearchResponse()}
        onSendMessage={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Search flights/i })).toBeTruthy();
  });

  it("omits budget bullet when no budget set", () => {
    const noBudgetParams = { ...mockParsedQuery, budget: undefined };
    render(
      <ChatPanel
        messages={[
          { id: "u1", role: "user", content: "Trip" },
          {
            id: "a1",
            role: "assistant",
            content: "Plan",
            params: noBudgetParams,
          },
        ]}
        parsedParams={noBudgetParams}
        onSendMessage={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Budget:/)).toBeNull();
  });

  it("uses parsedQuery from result when parsedParams omitted", () => {
    render(
      <ChatPanel
        messages={baseMessages}
        result={mockTripSearchResponse()}
        onSendMessage={vi.fn()}
      />,
    );
    expect(screen.getByText(/increase budget to \$7000/i)).toBeTruthy();
  });

  it("does not submit on Shift+Enter", () => {
    const onSendMessage = vi.fn();
    render(
      <ChatPanel
        messages={baseMessages}
        onSendMessage={onSendMessage}
      />,
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("renders all processing step statuses", () => {
    const steps = [
      { id: "1", label: "Done step", status: "done" as const },
      { id: "2", label: "Active step", status: "active" as const },
      { id: "3", label: "Pending step", status: "pending" as const },
    ];
    render(
      <ChatPanel
        messages={[
          { id: "u1", role: "user", content: "Go" },
          { id: "a1", role: "assistant", content: "" },
        ]}
        loading
        processingSteps={steps}
        onSendMessage={vi.fn()}
      />,
    );
    expect(screen.getByText("Done step")).toBeTruthy();
    expect(screen.getByText("Active step")).toBeTruthy();
    expect(screen.getByText("Pending step")).toBeTruthy();
  });
});
