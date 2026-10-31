import test from "node:test";
import assert from "node:assert/strict";
import { productsFrom } from "../workers/discovery/runner.mjs";
test("ProductGroup extraction skips restricted prices and retains consumer variants", () => {
  const group = {
    "@type": "ProductGroup",
    category: "Hoodies",
    hasVariant: [
      {
        "@type": "Product",
        name: "Hoodie / Corporate",
        offers: { price: "42.00" },
      },
      {
        "@type": "Product",
        name: "Hoodie / Consumer",
        offers: {
          price: "57.00",
          url: "https://shop.example/products/hoodie?variant=2",
        },
      },
    ],
  };
  const result = productsFrom(
    `<script type="application/ld+json">${JSON.stringify(group)}</script>`,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].category, "Hoodies");
  assert.equal(result[0].offers.price, "57.00");
  assert.match(result[0].offers.url, /variant=2/);
});
test("Malformed JSON-LD and non-product pages cannot become verified listings", () => {
  assert.deepEqual(
    productsFrom('<script type="application/ld+json">not json</script>'),
    [],
  );
  assert.deepEqual(
    productsFrom(
      '<script type="application/ld+json">{"@type":"WebSite","name":"Search"}</script>',
    ),
    [],
  );
});
