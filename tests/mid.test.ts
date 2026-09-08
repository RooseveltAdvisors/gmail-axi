import { describe, expect, it } from "vitest";
import { parseMessageId } from "../src/mid.js";

describe("Message-ID parsing", () => {
  it.each([
    ["abc@example.com", "<abc@example.com>"],
    ["<abc@example.com>", "<abc@example.com>"],
    ["%3Cabc%40example.com%3E", "<abc@example.com>"],
    ["neomd://mid/%3Cabc%40example.com%3E", "<abc@example.com>"],
    ["neomd://mid/%3Cabc%40example.com%3E?folder=archive", "<abc@example.com>"],
  ])("normalizes %s", (input, expected) => {
    expect(parseMessageId(input)).toBe(expected);
  });

  it("rejects malformed values", () => {
    expect(() => parseMessageId("neomd://thread/abc")).toThrow();
    expect(() => parseMessageId("<abc@example.com")).toThrow();
  });
});
