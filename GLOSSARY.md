# Cadence

Cadence is a course platform: learners buy courses, work through them, and can ask for their money back. This glossary fixes the language the product, the code, and anything we send to a learner all use.

## Language

### Who's who

**Platform Admin**:
A member of Cadence staff who runs the platform. Only a Platform Admin decides a Refund Request, approving or declining it, and that power is nothing to do with any team. Never their own, though: a Platform Admin who asks for a Refund is judged by a different one.
_Avoid_: Admin (ambiguous — say which), Reviewer, Staff, Moderator, Superuser

**Team Admin**:
A learner who manages a Team Licence and its Seats. They have no say over Refund Requests. They may raise one on a licence they bought, as any buyer may, but they never decide it — not even their own.
_Avoid_: Admin (ambiguous — say which), Team owner, Manager, Team lead

### Money going back

**Refund**:
Money Cadence sends back to a learner for a course they bought, always the full Amount Paid — there is no such thing as a partial Refund. The canonical term for the whole subject; nothing else in Cadence means this.
_Avoid_: Reversal, Chargeback, Cancellation, Return, Money back

**Refund Request**:
A learner's ask for a Refund, with the reason they gave. It is reviewed by a person and ends up either approved or declined; a Refund only exists once a request is approved.
_Avoid_: Refund, Reversal request, Chargeback, Cancellation

**Chargeback**:
A learner going to their own bank or card issuer to forcibly claw back a payment, bypassing Cadence entirely. A real and distinct event with its own fees and dispute process — Cadence does not handle these today. Never a word for a Refund.
_Avoid_: using this for anything a learner does inside Cadence

### The state of a request

A Refund Request is always in exactly one of three states. Name the state; never describe a request as merely "pending".

**Awaiting Review**:
Submitted by the learner, not yet looked at by a person.
_Avoid_: Pending, Pending chargeback, Open, Waiting

**Approved**:
A person has agreed to the request. The Refund is owed, and may not have reached the learner's card yet.
_Avoid_: Accepted, Complete, Paid

**Declined**:
A person has refused the request. No Refund is owed and no money moves. Always carries a Decline Reason.
_Avoid_: Rejected, Denied, Cancelled

**Decline Reason**:
The Platform Admin's explanation for declining a Refund Request, written to be read by the learner. Distinct from the learner's own reason for asking.
_Avoid_: Reason (ambiguous — that is the learner's), Note, Rejection note

### Money

**Amount Paid**:
What a learner actually handed over for a purchase, after any purchasing-power discount. Fixed at the moment of purchase, and the sole amount a Refund ever returns — never the course's current price.
_Avoid_: Refundable amount, Amount refunded, Price, Course price

### Buying for other people

**Team Licence**:
A purchase of a course made to give other people access to it, cut into Seats. The buyer may never watch the course themselves. Distinct from a copy a learner buys for themselves, and the same person can hold both for the same course.
_Avoid_: Team purchase, Bulk purchase, Group buy, Site licence

**Seat**:
One place on a Team Licence, claimed by redeeming a code. Unclaimed until somebody redeems it, claimed from that moment on, and claiming it enrolls them. A single claimed Seat is what stops a Team Licence being refunded.
_Avoid_: Coupon (that is the code that claims a Seat, not the Seat itself), Licence, Invite, Voucher

**Seat Voided**:
What becomes of a Team Licence's unclaimed Seats when its Refund Request is approved: they stop working, because the money that bought them has gone back. Voided rather than Revoked — nothing had been granted to anybody. Claimed Seats are untouched.
_Avoid_: Revoked (that is what happens to an Enrollment), Cancelled, Expired, Disabled

### Whether a learner can ask

**Refund Eligibility**:
The full test of whether a learner may raise a Refund Request on a purchase: the Refund Window, how much of the course they have watched, how much of it they have completed, and whether a team licence is involved — a learner using a seat their team bought cannot ask for a Refund, and nor can the buyer once seats on that licence have been claimed. The whole test, not any one part of it.
_Avoid_: Refund window (that is only one part), Refund policy, Cancellation rules

**Refund Blocker**:
The single reason a learner may not raise a Refund Request, named and worded once so the page and the server say the same thing. A learner who cannot ask is always told which one applies; silence is never the answer. Tested only when a learner asks, never when a reviewer judges a request already raised — a Blocker is a reason you may not ask, not a verdict on the request.
_Avoid_: Error, Validation failure, Ineligible (that is the state, not the reason)

**Refund Window**:
The fourteen whole days after a purchase during which a Refund Request may be raised. One part of Refund Eligibility, never a synonym for it.
_Avoid_: Refund period, Cancellation window, Cooling-off period

### What a learner loses

**Enrollment Revoked**:
The end of a learner's access to a course, caused by an approved Refund Request and immediate on approval. A learner who gets their money back does not keep the course. What they watched and completed is left untouched: access ends, the record of their progress does not.
_Avoid_: Cancelled, Unenrolled, Access removed
