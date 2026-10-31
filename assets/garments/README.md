# Approved overlays

Live product previews require an authorized transparent PNG or WebP in this folder and a matching entry in `index.json`. Use the exact discovered `productKey`. No live assets are bundled or represented as licensed merchant imagery.

```json
{
  "productKey": "merchant.example:sku-123",
  "file": "sku-123.png",
  "sourceUrl": "https://merchant.example/products/sku-123",
  "accessBasis": "Describe the actual permission or license",
  "method": "Manually isolated front-view product photo; inspected",
  "anchors": {"leftShoulder": [0.28, 0.18], "rightShoulder": [0.72, 0.18], "hem": [0.5, 0.91]}
}
```

Anchor coordinates are normalized within the transparent asset. Inspect the result before adding it. Model photographs must never be pasted whole onto the user. The bundled demo overlay is an original SVG illustration, not a merchant product or a successful live try-on gate.
