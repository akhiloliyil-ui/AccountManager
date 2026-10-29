import { describe, expect, it } from "vitest";
import { matchProduct, parseOfferText } from "./index";

const flyer = `LULU WEEKLY SAVER
Valid 29 Oct - 4 Nov 2026
Al Rawabi Fresh Milk 2L AED 9.75 10.50
India Gate Basmati Rice 5kg
AED 36.00
Chicken Breast 2 for 50.00
Ariel Laundry Detergent 3kg 25% off 45.00
Noor Sunflower Oil 1.5L Buy 1 Get 1 Free 16.50
Page 2`;

describe("parseOfferText", () => {
  const offers = parseOfferText(flyer);

  it("finds every priced line and skips headings", () => {
    expect(offers.map((o) => o.line)).toEqual([3, 5, 6, 7, 8]);
  });

  it("reads a was/now price cut", () => {
    expect(offers[0]).toMatchObject({
      name: "Al Rawabi Fresh Milk 2L",
      priceFils: 975,
      regularFils: 1050,
      promo: { type: "price_cut", priceFils: 975 },
    });
  });

  it("takes the name from the line above a bare price", () => {
    expect(offers[1]).toMatchObject({ name: "India Gate Basmati Rice 5kg", priceFils: 3600 });
    expect(offers[1]!.promo).toBeUndefined();
  });

  it("reads multi-buy, percent-off and BOGO", () => {
    expect(offers[2]).toMatchObject({ name: "Chicken Breast", promo: { type: "multi_buy", qty: 2, priceFils: 5000 } });
    expect(offers[3]).toMatchObject({ priceFils: 4500, promo: { type: "percent_off", percent: 25 } });
    expect(offers[4]).toMatchObject({ name: "Noor Sunflower Oil 1.5L", promo: { type: "bogo" } });
  });
});

describe("matchProduct", () => {
  const products = [
    { id: "milk", name: "Fresh full-cream milk", brand: "Al Rawabi" },
    { id: "rice", name: "Basmati rice", brand: "India Gate" },
    { id: "chicken", name: "Chicken breast fillets", brand: "Al Ain" },
    { id: "oil", name: "Sunflower oil", brand: "Noor" },
  ];

  it("matches by brand and name words", () => {
    expect(matchProduct("Al Rawabi Fresh Milk 2L", products)?.productId).toBe("milk");
    expect(matchProduct("India Gate Basmati Rice 5kg", products)?.productId).toBe("rice");
    expect(matchProduct("Chicken Breast", products)?.productId).toBe("chicken");
  });

  it("returns null for unrelated lines", () => {
    expect(matchProduct("Samsung Galaxy Phone", products)).toBeNull();
  });
});
