/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ChatLoading from "@/app/chat/[id]/loading";

describe("ChatLoading", () => {
  it("renders loading trip workspace message", () => {
    render(<ChatLoading />);
    expect(screen.getByText("Loading trip workspace...")).toBeTruthy();
  });
});
