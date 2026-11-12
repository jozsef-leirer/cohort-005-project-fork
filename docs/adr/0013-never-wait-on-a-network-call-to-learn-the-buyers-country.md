# Never wait on a network call to learn the buyer's country

Purchasing-power prices depend on where the buyer is, but no page may block on
finding out. `resolveCountry` tries two sources only — a dev session override,
then the `CF-IPCountry` header Cloudflare attaches — and returns `null` when
neither answers. A `null` country prices at full price (Tier 1). There is no
geolocation lookup, and `app/lib/country.server.test.ts` holds this in place with
a test asserting `fetch` is never called.

A country lookup sat on the render path of the course list, the purchase page and
every lesson page of a discounted purchase. A third-party endpoint on that path
makes page load depend on someone else's uptime and rate limit, for a guess we
were going to make anyway.

## Considered Options

- **Look the address up on ip-api.com's free endpoint when the header is
  missing.** This is what we did before. Rejected: it put a plain-HTTP call to a
  third party, limited to 45 requests a minute, on the critical path of pages
  that render fine without it.
- **Bundle a MaxMind GeoLite2 database.** Rejected: a licence key, tens of
  megabytes, and a monthly update, to resolve a country we already get free from
  Cloudflare in production.

## Consequences

A buyer who reaches Cadence without passing through Cloudflare is quoted full
price, which overcharges exactly the learners purchasing-power pricing exists
for. That is an accepted cost, not an oversight: the fix is to make sure traffic
comes through Cloudflare, not to add a lookup. Note this decides only how a
country is *resolved* — once a purchase is made, the country is recorded on it
and read back from there (ADR 0009).
