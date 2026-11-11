# Refund Eligibility is tested when a learner asks, never when a Platform Admin judges

Refund Eligibility gates whether a learner may raise a Refund Request. It is not re-run when a Platform Admin reviews one: they are shown the learner's progress as it stands and decide, and nothing in the code can stop them approving. A Refund Blocker is a reason you may not ask — not a verdict on whether you deserve your money back.

## Considered options

- **Re-run the test at review time and refuse to approve a blocked request.** Rejected because the clock keeps running while a request waits in the queue. A learner who asks on day 13 and is reviewed on day 16 comes back `WindowClosed` and becomes permanently un-approvable, punished for how long we took. The test also reports `AlreadyRequested` against the very request under review, because `getOpenRequest` finds it — so this option needs a special case carved into the eligibility test that exists solely to serve the gate.
- **Re-run it as a warning rather than a block.** Rejected as noise. The Platform Admin is already shown watched seconds and completed lessons as they stand now; restating those same facts under a blocker name gives the screen two vocabularies for one thing.

## Consequences

Approval is a human judgement with no machine veto, so the review screen has to show the Platform Admin enough to exercise it: watch time and completion, computed from the same helpers the eligibility test uses, so their numbers and the numbers that gated the request can never disagree. Nothing prevents a Platform Admin approving a request from a learner who has since finished the whole course. That is the discretion, not a hole in it.
