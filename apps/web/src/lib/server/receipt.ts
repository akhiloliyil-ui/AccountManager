import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { ReceiptReading } from "@gpa/core";

/** Through Vercel AI Gateway: authenticates with OIDC on Vercel, or AI_GATEWAY_API_KEY elsewhere. */
export const RECEIPT_MODEL = process.env.GPA_RECEIPT_MODEL || "anthropic/claude-sonnet-5.5";

const schema = z.object({
  store: z.string().nullable().describe("Store or merchant name as printed at the top, or null"),
  date: z.string().nullable().describe("Purchase date as YYYY-MM-DD, or null if not legible"),
  currency: z.string().nullable().describe("Three-letter currency code, e.g. AED or INR, or null if not printed"),
  total: z.number().nullable().describe("The final amount paid, after discounts and VAT"),
  items: z
    .array(
      z.object({
        name: z.string().describe("Product name as printed, expanded if abbreviated"),
        quantity: z.number().describe("Count, or weight in kg for loose items; 1 if not shown"),
        unitPrice: z.number().nullable().describe("Price per unit or per kg, or null"),
        lineTotal: z.number().describe("Amount for this line; negative for discounts"),
      }),
    )
    .describe("Every purchased line in order. Leave out subtotal, VAT, total, payment and change lines."),
});

const INSTRUCTIONS = `You read photographed supermarket receipts from the UAE and India.
Return only what is printed. Amounts are numbers in major units (12.50, not 1250).
If the photo isn't a receipt, return an empty items list and null for the rest.`;

/** Reads a receipt photo into structured data. Throws when the model can't be reached. */
export async function readReceipt(image: Uint8Array, model: LanguageModel = RECEIPT_MODEL): Promise<ReceiptReading> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema }),
    system: INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Read this receipt." },
          { type: "file", mediaType: "image", data: image },
        ],
      },
    ],
    abortSignal: AbortSignal.timeout(60_000),
  });
  return output;
}
