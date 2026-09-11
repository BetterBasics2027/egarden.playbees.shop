# egarden.playbees.shop

Interactive wholesale catalog for Playbees (eGarden Division), built from the printed
**Playbees Wholesale Catalog 2027**. Static site on GitHub Pages; no build step.

- `tools/extract_catalog.py` — regenerates `data/catalog.json`, `img/`, `fonts/` from the
  source HTML in Downloads. Re-run after the printed catalog changes, then `verify_prices.py`.
- `tools/verify_prices.py` — asserts the site's prices and counts match the PDF.
- `intake/` — Google Apps Script that turns order requests into Sheet rows + email.
- `config.js` — order endpoint URL and contact block.

Custom domain: the CNAME is set through the Pages API once the GoDaddy record
`egarden CNAME betterbasics2027.github.io` exists (a CNAME file committed earlier would
redirect the github.io preview to a domain that does not resolve yet).
