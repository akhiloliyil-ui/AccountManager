import { describe, expect, it } from "vitest";
import { matchReceipt } from "./receipt";

const catalog = {
  stores: [
    { id: "lulu", name: "Lulu", color: "#000" },
    { id: "carrefour", name: "Carrefour", color: "#000" },
  ],
  products: [
    { id: "milk", name: "Fresh Milk 2L", brand: "Al Rawabi" },
    { id: "rice", name: "Basmati Rice 5kg", brand: "India Gate" },
    { id: "bananas", name: "Bananas", brand: undefined },
  ],
};

describe("receipt matching", () => {
  it("finds the store and the catalogue product for each line", () => {
    const m = matchReceipt(
      {
        store: "LULU HYPERMARKET LLC - AL BARSHA",
        date: "2026-10-28",
        currency: "AED",
        total: 61.4,
        items: [
          { name: "AL RAWABI FRESH MILK 2L", quantity: 2, unitPrice: 8.95, lineTotal: 17.9 },
          { name: "INDIA GATE BASMATI 5KG", quantity: 1, unitPrice: null, lineTotal: 34.5 },
          { name: "PLASTIC BAG", quantity: 1, unitPrice: 0.25, lineTotal: 0.25 },
          { name: "", quantity: 1, unitPrice: null, lineTotal: 3 },
          { name: "DISCOUNT", quantity: 1, unitPrice: null, lineTotal: -2 },
        ],
      },
      catalog,
    );
    expect(m).toMatchObject({ storeId: "lulu", date: "2026-10-28", currency: "AED", totalMinor: 6140 });
    expect(m.lines.map((l) => [l.productId, l.unitMinor, l.lineMinor])).toEqual([
      ["milk", 895, 1790],
      ["rice", 3450, 3450],
      [null, 25, 25],
    ]);
  });

  it("copes with unknown stores, odd dates and a missing total", () => {
    const m = matchReceipt({ store: "Corner Grocery", date: "28/10/2026", currency: "dirham", total: null, items: [{ name: "Bananas", quantity: 0, unitPrice: null, lineTotal: 4.5 }] }, catalog);
    expect(m).toMatchObject({ storeId: null, date: null, currency: null, totalMinor: 450 });
    expect(m.lines[0]).toMatchObject({ productId: "bananas", quantity: 1, unitMinor: 450 });
  });
});
