import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { readReceipt } from "./receipt";

const reply = (json: unknown) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(json) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
      warnings: [],
    }),
  });

describe("receipt reader", () => {
  it("returns the model's structured reading, sending the photo as an image", async () => {
    const model = reply({ store: "Lulu", date: "2026-10-28", currency: "AED", total: 17.9, items: [{ name: "Milk", quantity: 2, unitPrice: 8.95, lineTotal: 17.9 }] });
    const reading = await readReceipt(new Uint8Array([0xff, 0xd8, 0xff]), model);
    expect(reading).toMatchObject({ store: "Lulu", total: 17.9, items: [{ name: "Milk", quantity: 2 }] });
    const prompt = model.doGenerateCalls[0]!.prompt;
    expect(JSON.stringify(prompt)).toContain('"type":"file"');
  });

  it("rejects replies that don't fit the schema", async () => {
    await expect(readReceipt(new Uint8Array([1]), reply({ store: 5, items: "none" }))).rejects.toThrow();
  });
});
