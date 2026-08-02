import { describe, expect, it } from "vitest";
import { toon } from "../src/toon.js";

describe("TOON output", () => {
  it("serializes compact object collections", () => {
    expect(toon({ count: 2, messages: [{ id: "a", subject: "Hello", has_attachments: false }, { id: "b", subject: "A, comma", has_attachments: true }] })).toBe(
      'count: 2\nmessages[2]{id,subject,has_attachments}:\n  a,Hello,false\n  b,"A, comma",true\n',
    );
  });

  it("quotes actionable strings and preserves multiline content", () => {
    expect(toon({ help: ["Run `gmail-axi doctor`"], body: "first\nsecond" })).toBe(
      'help[1]: "Run `gmail-axi doctor`"\nbody: "first\\nsecond"\n',
    );
  });

  it("uses canonical list rows for nested values", () => {
    expect(toon({ messages: [{ id: "a", labels: ["INBOX", "IMPORTANT"] }] })).toBe(
      "messages[1]:\n  - id: a\n    labels[2]: INBOX,IMPORTANT\n",
    );
  });
});
