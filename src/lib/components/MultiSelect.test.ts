import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/svelte";
import MultiSelect from "./MultiSelect.svelte";

afterEach(cleanup);

const OPTIONS = [
  { value: "none", label: "none", exclusive: true },
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
];

async function open(selected: string[]) {
  render(MultiSelect, { props: { id: "t", options: OPTIONS, selected } });
  await fireEvent.click(screen.getByRole("button", { expanded: false }));
}

const box = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

describe("MultiSelect exclusive option", () => {
  it("clears the others when ticked and grays them out", async () => {
    await open(["a", "b"]);
    await fireEvent.click(box("none"));
    expect(box("none").checked).toBe(true);
    expect(box("Alpha").checked).toBe(false);
    expect(box("Alpha").disabled).toBe(true);
    expect(box("Bravo").disabled).toBe(true);
  });

  it("frees the others once unticked", async () => {
    await open(["none"]);
    await fireEvent.click(box("none"));
    expect(box("Alpha").disabled).toBe(false);
  });
});
