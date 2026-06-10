import { describe, it, expect } from "vitest";
import { toUserErrorMessage, toUserStatusMessage } from "./user-messages";

describe("toUserErrorMessage", () => {
  it("maps quorum failures to a friendly message", () => {
    expect(
      toUserErrorMessage("Fewer than 2 of 3 providers succeeded", 503),
    ).toMatch(/couldn't pull together enough/i);
  });

  it("maps parse failures without exposing API details", () => {
    expect(
      toUserErrorMessage(
        "Could not parse query and OPENAI_API_KEY is not set",
        422,
      ),
    ).toMatch(/couldn't quite understand/i);
    expect(toUserErrorMessage("Could not parse query and OPENAI_API_KEY is not set")).not
      .toContain("OPENAI");
  });

  it("maps HTTP status fallbacks", () => {
    expect(toUserErrorMessage("Search failed (500)", 500)).toMatch(/something went wrong/i);
    expect(toUserErrorMessage("Request timed out", 504)).toMatch(/longer than expected/i);
  });
});

describe("toUserStatusMessage", () => {
  it("rewrites technical status copy", () => {
    expect(toUserStatusMessage("Serving cached results...")).toBe(
      "Loading your recent options...",
    );
    expect(toUserStatusMessage("Your trip is ready!")).toBe("Your trip is ready!");
  });
});
