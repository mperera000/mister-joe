import { describe, expect, it } from "vitest";
import { cleanup } from "./cleanup";

const none = { removeFillers: true, dictionary: [], snippets: [] };

// What the real on-device engine heard for the bundled sample clip.
const SAMPLE =
  "Hey, it's Mr. Joe, um, remind me to send the budget to Priya by Friday. New paragraph, also, ah, send the notes to my email.";

describe("cleanup", () => {
  it("removes filler words and handles 'new paragraph'", () => {
    expect(cleanup(SAMPLE, none)).toBe(
      "Hey, it's Mr. Joe, remind me to send the budget to Priya by Friday.\n\nAlso, send the notes to my email.",
    );
  });

  it("keeps fillers when that's turned off", () => {
    expect(cleanup("so, um, yes", { ...none, removeFillers: false })).toBe("So, um, yes");
  });

  it("applies dictionary fixes", () => {
    const out = cleanup(SAMPLE, { ...none, dictionary: [{ from: "Mr. Joe", to: "Mister Joe" }] });
    expect(out).toContain("Mister Joe");
    expect(out).not.toContain("Mr. Joe");
  });

  it("expands snippets", () => {
    const out = cleanup(SAMPLE, { ...none, snippets: [{ trigger: "my email", text: "joe@example.com" }] });
    expect(out).toContain("send the notes to joe@example.com.");
  });

  it("matches whole phrases only", () => {
    const out = cleanup("I love jam and pajamas", { ...none, dictionary: [{ from: "jam", to: "JAM" }] });
    expect(out).toBe("I love JAM and pajamas");
  });

  it("handles a leading filler and capitalizes", () => {
    expect(cleanup("um, so we ship today", none)).toBe("So we ship today");
  });

  it("drops stutters and stray commas", () => {
    expect(cleanup("send it to the the team, uh.", none)).toBe("Send it to the team.");
  });

  it("supports new line", () => {
    expect(cleanup("milk new line eggs new line bread", none)).toBe("Milk\nEggs\nBread");
  });

  it("returns empty for silence", () => {
    expect(cleanup("   ", none)).toBe("");
  });
});
