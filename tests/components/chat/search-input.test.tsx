/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchInput } from "@/components/chat/search-input";

describe("SearchInput", () => {
  it("renders landing variant with custom placeholder", () => {
    render(
      <SearchInput
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="Plan a trip"
        variant="landing"
      />,
    );
    expect(screen.getByPlaceholderText("Plan a trip")).toBeTruthy();
  });

  it("calls onChange when typing", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Tokyo" } });
    expect(onChange).toHaveBeenCalledWith("Tokyo");
  });

  it("submits on button click when value is non-empty", () => {
    const onSubmit = vi.fn();
    render(<SearchInput value="Paris" onChange={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("does not submit when value is empty", () => {
    const onSubmit = vi.fn();
    render(<SearchInput value="  " onChange={vi.fn()} onSubmit={onSubmit} />);
    expect(screen.getByRole("button")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits on Enter without Shift", () => {
    const onSubmit = vi.fn();
    render(<SearchInput value="Dubai" onChange={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: false });
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("does not submit on Shift+Enter", () => {
    const onSubmit = vi.fn();
    render(<SearchInput value="Dubai" onChange={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows loader and disables input when loading", () => {
    render(
      <SearchInput value="Trip" onChange={vi.fn()} onSubmit={vi.fn()} loading variant="chat" />,
    );
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button")).toHaveProperty("disabled", true);
  });
});
