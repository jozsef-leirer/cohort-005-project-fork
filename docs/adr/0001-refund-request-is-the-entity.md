# A Refund Request is the entity; a Refund is its outcome

A single `refunds` row stood for both a learner's ask and the money that may eventually move. We split them: a learner raises a **Refund Request**, a person approves or declines it, and an approved request produces a **Refund** of the full Amount Paid. `GLOSSARY.md` carries the vocabulary; what is recorded here is why a Refund is never partial.

## Considered options

- **One row meaning both.** What we had. It forced `amount_refunded` to be nullable to express "asked but not yet granted", and left the status enum doing double duty as the state of a request and the existence of a refund.
- **Partial refunds, with their own amount.** Rejected. Nothing asked for them, and they turn a three-state review into an amount negotiation. Declining is the lever for "this doesn't fully deserve a refund". Reviving partials means reintroducing a stored amount and revisiting this decision deliberately.

## Consequences

A Refund has no row of its own: it is an approved Refund Request plus the purchase's immutable `amount_paid`. Nothing stores the refunded sum, because a second copy could disagree with the first. Reviving partial refunds would mean reintroducing a stored amount, so the schema makes that a deliberate decision rather than a drift.
