# Refunding a Team Licence deletes its unclaimed seats

An approved Refund Request on a Team Licence deletes the licence's unredeemed seats rather than marking them void. Redemption checks that a code exists, that nobody has redeemed it, that the learner is not already enrolled, and that their country matches the purchaser's — it has never had cause to ask whether the money behind the code is still ours. A code that no longer exists cannot be redeemed by a check nobody remembered to write.

This is ADR 0002's argument applied to the seat side, and it is here for the same reason: without it, a buyer can take ten seats, hand out no codes, get refunded in full, and leave ten working codes behind.

## Considered options

- **A `voidedAt` column on the seat.** Preserves the record of a seat that was bought and never used, which instructor-facing figures might one day want. Rejected because correctness would then depend on every redemption path filtering on it, and nothing in the type system enforces that. The cost of one path forgetting is a free course funded by money we gave back.
- **Leaving the codes live, and relying on the Team Seats Claimed blocker.** Rejected because that blocker is tested only when a learner asks, never when a Platform Admin approves (ADR 0003). It can say nothing about what happens after approval, which is exactly when the codes become dangerous.

## Consequences

Somebody holding a code that was distributed before the refund is told the code does not exist. That is true but unexplained, and it is the price of deleting rather than flagging — there is no voided seat left to explain itself with.

Seats claimed before approval are untouched, and the people holding them keep their courses. Normally a licence with claimed seats cannot be refunded at all, but a seat claimed in the gap between a request and its review slips through, because eligibility is not re-tested at review. The review screen shows live seat counts so the Platform Admin can see it; nothing in the code prevents it.
