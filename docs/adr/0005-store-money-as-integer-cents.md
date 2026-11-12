# Store every amount of money as integer cents

Every amount Cadence stores — `courses.price`, `purchases.amount_paid`, `refunds.amount_refunded` — is a whole number of cents in an `integer` column, and cents become dollars only at the edge, on the way to a screen or an input — `formatPrice(cents)` in almost every case. A floating-point dollar amount drifts under arithmetic (a 30% purchasing-power discount on $79.00 is not exactly representable), and SQLite has no true decimal type to fall back on. Discounts are worked out in cents and rounded once, with `Math.round`, at the point of sale.

## Considered Options

- **`real` columns holding dollars.** Rejected: rounding errors show up in totals and refunds.
- **Decimal strings.** Rejected: every comparison and sum would need parsing, and SQLite would sort them as text.

## Consequences

Any new money column must be an integer of cents, and any new screen must go through `formatPrice`. The two deliberate exceptions are `formatMoney` in `app/lib/analytics.ts`, which rounds to whole dollars for charts, and the price input in `app/routes/instructor.$courseId.tsx`, which needs an editable dollar value. Neither stores a float. Moving away from this later means migrating every money column and every place that compares amounts.
