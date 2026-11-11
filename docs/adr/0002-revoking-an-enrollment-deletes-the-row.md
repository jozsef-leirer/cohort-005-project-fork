# Revoking an enrollment deletes the row

An approved Refund Request revokes the learner's Enrollment, and we do that by deleting the `enrollments` row rather than setting a `revoked_at` flag on it. There are nineteen places that query `enrollments`, across access control, dashboards and instructor analytics; a flag would mean every one of them had to remember to filter, and the cost of one that forgets is a learner keeping a course they were refunded for.

## Considered options

- **A `revoked_at` column.** Preserves the history of the enrollment and reads more like the domain — Enrollment Revoked as a state rather than an absence. Rejected because correctness here depends on every current and future read site filtering correctly, and nothing in the type system enforces that.

## Consequences

The approved Refund Request is the only record that the learner ever had the course; `enrollments` carries no history of revocation. Instructor analytics counts enrollments live, so a refunded learner silently drops out of historical enrollment figures. Revenue figures are read from `purchases` and are unaffected — which means a refunded purchase still counts as revenue. That is a separate gap, not something this decision introduced.
