---
'eco-routes-cli': patch
---

Move the standalone EVM intent examples to keyless `POST /v4/quotes` before quotes v3
retires on 2026-12-01. Publish the quoted route and reward unchanged instead of
constructing a new reward deadline. Reject expired quotes, mismatched funding or
destination, and unsupported funding transactions before approving tokens. Remove
the local route/reward deadline options; the quote supplies both deadlines.

Pin the test tooling's transitive Handlebars dependency to 4.7.10 to fix the critical
audit advisories blocking CI; the audit gate is unchanged.
