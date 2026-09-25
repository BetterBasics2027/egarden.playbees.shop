# egarden.playbees.shop

Playbees and KiddyDoo wholesale catalogs: a phone-first price list with an order-request cart and a
downloadable PDF per brand. Static site on GitHub Pages; no build step here.

This repo is the published output only. The catalog data, photos and PDFs are generated elsewhere and
copied in; edit the source project, rebuild, then copy the site files here and bump `?v=N` in
`index.html`.

- `intake/` — Google Apps Script that turns order requests into Sheet rows + email.
- `config.js` — order endpoint URL and contact block.
- `tools/harness.html` — phone-frame preview for screenshots (never submits an order).

The 67-item Toy Preview show catalog that lived here before 2026-09-25 is tagged
`show-catalog-2026-09-14`.
