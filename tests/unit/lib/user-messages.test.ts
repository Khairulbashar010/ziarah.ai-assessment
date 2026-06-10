import { describe, it, expect } from "vitest";
import {
  USER_ERRORS,
  USER_SUCCESS,
  toUserErrorMessage,
  toUserStatusMessage,
} from "@/lib/user-messages";

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
    expect(toUserErrorMessage("search failed")).toBe(USER_ERRORS.generic);
    expect(toUserErrorMessage("invalid request", 422)).toBe(USER_ERRORS.parse);
    expect(toUserErrorMessage("could not understand trip")).toBe(USER_ERRORS.parse);
    expect(toUserErrorMessage("global timed out")).toBe(USER_ERRORS.timeout);
    expect(toUserErrorMessage("provider timeout")).toBe(USER_ERRORS.timeout);
    expect(toUserErrorMessage("quorum not met")).toBe(USER_ERRORS.quorum);
  });

  it("maps 404 and trip-not-found errors", () => {
    expect(toUserErrorMessage("Trip not found", 404)).toBe(USER_ERRORS.notFound);
    expect(toUserErrorMessage("trip not found")).toBe(USER_ERRORS.notFound);
  });

  it("maps 400 errors to parse guidance", () => {
    expect(toUserErrorMessage("Bad request", 400)).toBe(USER_ERRORS.parse);
  });

  it("passes through non-technical custom messages", () => {
    expect(toUserErrorMessage("Please choose different dates.")).toBe(
      "Please choose different dates.",
    );
  });

  it("hides technical messages behind the generic error", () => {
    expect(toUserErrorMessage("Sabre auth failed (401)")).toBe(USER_ERRORS.generic);
    expect(toUserErrorMessage("streaming response interrupted")).toBe(USER_ERRORS.generic);
    expect(toUserErrorMessage("internal server error")).toBe(USER_ERRORS.generic);
    expect(toUserErrorMessage("step failed → retry")).toBe(USER_ERRORS.generic);
    expect(toUserErrorMessage("")).toBe(USER_ERRORS.generic);
  });

  it("handles non-string error values", () => {
    expect(toUserErrorMessage(new Error("OPENAI_API_KEY missing"))).toBe(USER_ERRORS.generic);
    expect(toUserErrorMessage(null)).toBe(USER_ERRORS.generic);
  });
});

describe("USER_SUCCESS", () => {
  it("exports stable success copy", () => {
    expect(USER_SUCCESS.tripReady).toMatch(/ready/i);
    expect(USER_SUCCESS.tripUpdated).toMatch(/updated/i);
    expect(USER_SUCCESS.pricesRefreshed).toMatch(/refreshed/i);
  });
});

describe("toUserStatusMessage", () => {
  it("rewrites technical status copy", () => {
    expect(toUserStatusMessage("Serving cached results...")).toBe(
      "Loading your recent options...",
    );
    expect(toUserStatusMessage("Showing cached prices — refreshing shortly...")).toBe(
      "Showing recent prices — we'll refresh them shortly...",
    );
    expect(toUserStatusMessage("Searching our flight and hotel inventory...")).toBe(
      "Searching flights and hotels...",
    );
    expect(toUserStatusMessage("Still searching our inventory...")).toBe(
      "Still searching for the best options...",
    );
    expect(toUserStatusMessage("Extracting dates, route, and travelers...")).toBe(
      "Reading your dates, route, and travellers...",
    );
    expect(toUserStatusMessage("Searching flight inventory...")).toBe(
      "Searching for flights...",
    );
    expect(toUserStatusMessage("Flight options matched to your trip")).toBe(
      "Found flights that match your trip",
    );
    expect(toUserStatusMessage("Hotel stays matched to your trip")).toBe(
      "Found hotels that match your trip",
    );
    expect(toUserStatusMessage("Your trip is ready!")).toBe("Your trip is ready!");
  });
});

describe("USER_ERRORS", () => {
  it("exports stable error copy", () => {
    expect(USER_ERRORS.emptyQuery).toMatch(/where you'd like to go/i);
    expect(USER_ERRORS.notFound).toMatch(/couldn't find that trip/i);
    expect(USER_ERRORS.parse).toMatch(/couldn't quite understand/i);
  });
});
