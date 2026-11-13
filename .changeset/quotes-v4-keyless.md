---
'eco-routes-cli': minor
---

`QUOTES_API_URL` now takes an eco-quotes host (such as `https://quotes.eco.com`) and calls the
keyless `{host}/v4/quotes` endpoint; quote-service v3 URLs (`/api/v3/...`) are rejected at
configuration time because quotes v3 retires on 2026-12-01. `QUOTES_PREPROD` is removed (the
preprod quote service no longer exists); set `ECO_ENV=staging` or
`QUOTES_API_URL=https://quotes.stag.eco.com` instead.

Pin the test tooling's transitive Handlebars dependency to 4.7.10 to fix the critical
audit advisories blocking CI; the audit gate is unchanged.
