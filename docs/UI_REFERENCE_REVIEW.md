# Vesti interface review

Reviewed 31 October 2026 before UI implementation. Mobbin screenshots were inspected directly. These are web references, not evidence of an extension or working clothing AR system.

## Shopping panel references

| Reference | Observed screen | Adaptation for Vesti | Does not transfer |
| --- | --- | --- | --- |
| [Selfridges](https://mobbin.com/screens/a22d22a5-0901-4a64-b5e4-ec3bf6fc2eb4) | Clothing search with large images, category filters, title and price beneath | Product photo leads each result; filters collapse above the list | Desktop multicolumn grid and permanent filter sidebar exceed the panel width |
| [Klarna](https://mobbin.com/screens/35cf8624-dbaf-4865-a0b6-1a2a3fabde74) | Product cards with merchant names and visible active price filter | Keep merchant and observed price together; show active currency | Payment instalments, reviews, discounts have no supporting Vesti evidence |
| [Amazon](https://mobbin.com/screens/71bb8092-ea62-4e96-ab8a-564168ea4d77) | Horizontal result rows, images beside descriptions, colour filters | A compact row fits a narrow panel; evidence reasons follow the title | Dense advertising and ratings would obscure match provenance |

## Fitting room references

| Reference | Observed screen | Adaptation for Vesti | Does not transfer |
| --- | --- | --- | --- |
| [Synthesia](https://mobbin.com/screens/2deafa13-1850-4ab3-986e-b0dc1ec0650f) | Dominant camera area with a bottom capture control and top exit | Keep the camera as the main workspace and a clear return action | Recording and avatar generation are outside scope |
| [Substack](https://mobbin.com/screens/8394135e-486f-4549-8a65-61689974e662) | Preview with camera and mirror controls below | Put camera and mirror toggles below the preview, with text labels | Microphone and recording controls are unnecessary |
| [Magnific](https://mobbin.com/screens/438a1eba-7f2f-42d0-af8c-98dd3f18b403) | Large visual workspace, settings panel and framing guides | Separate garment adjustments from the preview; use framing guidance | This is a generated scene tool, not a webcam or clothing tracker |

The search returned adjacent web patterns. It did not establish a dedicated extension layout or clothing AR reference. Placement and behavior below are Vesti design decisions, not observed behavior in those products.

## Shared visual system

Warm ivory background (#f5f3ed), near-black text (#20241f), forest green actions (#244c3d), soft sage surfaces (#e3e9df), and muted orange for demo labels. System sans-serif body text; Georgia display headings. Four-pixel spacing scale, 12px card radii, 44px primary controls, 14px minimum body copy. Visible focus rings, text status labels, polite live announcements, and reduced-motion support. Photos show products; illustrations always carry a demo label.

The panel uses one column at 320-440px. The fitting room uses a large preview with a 320px product/adjustment sidebar at laptop widths, stacking below 900px. User need: shopping should stay beside the video; body preview needs enough space to step back and adjust.

## Annotated wireframes

```text
EXTENSION · 360px
┌────────────────────────────────────┐
│ vesti                     Settings │  Persistent identity and pairing
│ From your screen. Into your style. │
│ [Select a garment]                 │  Keyboard crosshair + pointer
│ [Selected crop + click marker]     │  Preview expires after five minutes
│ ① Identify  ② Search  ③ Rank        │  Live stage and Cancel
│ [Category] [Colour] [Confirm]      │  Only when uncertain; user provenance
│ Similar finds             Filters │  Filters rerank, Search again rediscovers
│ ┌──────┐ Merchant · checked time   │
│ │image │ Title / observed price    │  Unknown price remains unknown
│ └──────┘ Match reasons             │
│ [Try on] [View at retailer ↗]      │  Preview unavailable has explanation
│ [Evidence for this search]         │  Fresh and demo evidence stay separate
└────────────────────────────────────┘

FITTING ROOM · laptop / wide desktop
┌───────────────────────────────────────────────────────────────────┐
│ vesti / fitting room                       [Return to video ↗]   │
├──────────────────────────────────────────┬────────────────────────┤
│                                          │ Selected product       │
│         Camera consent / preview         │ Merchant and price     │
│       shoulder and hip framing guide     │ Similar match reasons  │
│                                          │ [View at retailer ↗]   │
│   Tracking lost → hide garment promptly  │                        │
│                                          │ Scale        ───●──    │
│                                          │ Vertical     ──●───    │
│                                          │ [Reset adjustments]    │
├──────────────────────────────────────────┤                        │
│ [Enable / Stop camera] [Mirror]           │ Appearance preview,    │
│ Local processing · tracking status · FPS │ not a fit prediction   │
└──────────────────────────────────────────┴────────────────────────┘
```

Journey: select garment → capture → identify → confirm if uncertain → search → review → create single-use handoff → fitting room → explicit camera consent → adjust → retailer. Product identity and video return URL persist through the handoff.

Loading keeps focus and shows Cancel. Ambiguity shows editable category/colour before discovery. Service failures name the stage and offer reselection or an explicitly labelled demo. Camera denial explains browser permission recovery; no-camera and busy-device messages differ. Tracking loss hides the asset. Missing approved assets keep the retailer link and explain preview availability. Demo listings have no counterfeit merchant purchase links.
