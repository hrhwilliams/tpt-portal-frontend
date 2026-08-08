import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import Combobox, { type Match } from "./Combobox.svelte";

afterEach(cleanup);

const MATCHES: Match[] = [
  { key: "a", label: "Alpha", count: 3 },
  { key: "b", label: "Bravo", count: 1 },
];

function setup(
  search: (query: string, signal: AbortSignal) => Match[] | Promise<Match[]>,
  extraProps: Record<string, unknown> = {},
) {
  return render(Combobox, { props: { value: "", search, ...extraProps } });
}

describe("Combobox", () => {
  it("does not search below minLength", async () => {
    const search = vi.fn().mockResolvedValue(MATCHES);
    setup(search);
    const input = screen.getByRole("combobox");
    await fireEvent.input(input, { target: { value: "a" } });
    await new Promise((r) => setTimeout(r, 250));
    expect(search).not.toHaveBeenCalled();
  });

  it("debounces and searches once the query reaches minLength", async () => {
    const search = vi.fn().mockResolvedValue(MATCHES);
    setup(search);
    const input = screen.getByRole("combobox");
    await fireEvent.input(input, { target: { value: "al" } });
    expect(search).not.toHaveBeenCalled();
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1), { timeout: 500 });
    expect(search).toHaveBeenCalledWith("al", expect.any(AbortSignal));
    await screen.findByText("Alpha");
  });

  it("navigates matches with arrow keys and selects with Enter", async () => {
    const search = vi.fn().mockResolvedValue(MATCHES);
    setup(search);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "al" } });
    await screen.findByText("Alpha");

    await fireEvent.keyDown(input, { key: "ArrowDown" });
    await fireEvent.keyDown(input, { key: "ArrowDown" });
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("Bravo");
  });

  it("shows no-match text only after the search settles", async () => {
    let resolveSearch!: (v: Match[]) => void;
    const search = vi.fn(() => new Promise<Match[]>((r) => (resolveSearch = r)));
    setup(search, { noMatchText: "Nothing here." });
    const input = screen.getByRole("combobox");
    await fireEvent.input(input, { target: { value: "zz" } });

    await waitFor(() => expect(search).toHaveBeenCalledTimes(1), { timeout: 500 });
    expect(screen.queryByText("Nothing here.")).toBeNull();

    resolveSearch([]);
    await screen.findByText("Nothing here.");
  });

  it("aborts the in-flight request when a newer query supersedes it", async () => {
    const signals: AbortSignal[] = [];
    const search = vi.fn((_query: string, signal: AbortSignal): Promise<Match[]> => {
      signals.push(signal);
      return new Promise<Match[]>(() => {});
    });
    setup(search);
    const input = screen.getByRole("combobox");

    await fireEvent.input(input, { target: { value: "al" } });
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1), { timeout: 500 });

    await fireEvent.input(input, { target: { value: "alp" } });
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2), { timeout: 500 });

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });
});
