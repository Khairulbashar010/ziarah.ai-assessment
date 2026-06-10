import { describe, expect, it } from "vitest";
import {
  formatDateLong,
  formatDateRange,
  formatDateShort,
  formatDuration,
  formatSegmentSchedule,
  formatTime,
  nightsBetween,
} from "@/lib/utils/dates";

describe("nightsBetween", () => {
  it("returns at least 1 night", () => {
    expect(nightsBetween("2026-12-20", "2026-12-20")).toBe(1);
  });

  it("counts nights between check-in and check-out", () => {
    expect(nightsBetween("2026-12-20", "2026-12-27")).toBe(7);
  });
});

describe("formatDateShort", () => {
  it("formats a date in en-GB short style", () => {
    expect(formatDateShort("2026-12-20")).toMatch(/20 Dec/);
  });
});

describe("formatDateLong", () => {
  it("formats a date in en-GB long style", () => {
    expect(formatDateLong("2026-12-20")).toMatch(/20 December 2026/);
  });
});

describe("formatDateRange", () => {
  it("joins short dates with an en dash", () => {
    const range = formatDateRange("2026-12-20", "2026-12-27");
    expect(range).toContain("–");
    expect(range).toMatch(/20 Dec/);
    expect(range).toMatch(/27 Dec/);
  });
});

describe("formatTime", () => {
  it("formats ISO time in 24-hour en-GB style", () => {
    expect(formatTime("2026-12-20T08:30:00Z")).toMatch(/\d{2}:\d{2}/);
  });
});

describe("formatSegmentSchedule", () => {
  it("omits day range when departure and arrival share a day", () => {
    const schedule = formatSegmentSchedule(
      "2026-12-20T08:00:00Z",
      "2026-12-20T14:00:00Z",
      "DXB",
      "LHR",
    );
    expect(schedule).toContain("DXB →");
    expect(schedule).toContain("LHR");
    expect(schedule).not.toContain("·");
  });

  it("includes day range when departure and arrival differ", () => {
    const schedule = formatSegmentSchedule(
      "2026-12-20T12:00:00Z",
      "2026-12-22T12:00:00Z",
      "DXB",
      "LHR",
    );
    expect(schedule).toContain("·");
    expect(schedule).toContain("–");
  });
});

describe("formatDuration", () => {
  it("formats minutes only", () => {
    expect(formatDuration(45)).toBe("45m");
  });

  it("formats hours only", () => {
    expect(formatDuration(120)).toBe("2h");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(150)).toBe("2h 30m");
  });
});
