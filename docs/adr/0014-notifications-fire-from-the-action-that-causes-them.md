# Notifications fire from the action that causes them

Every Notification is written by the same function that performs the action it is about, inside that action's transaction. `createComment` writes the Discussion Question Notifications, `updateUserRole` writes the role-change Notification, `approveRefundRequest` writes the buyer's. Each calls a notifier from `app/lib/notifications.server.ts` — one per Notification Type, owning that Type's audience rule and its frozen sentence — and routes gain no knowledge of notifications at all.

The forcing argument is that a Notification nobody fired is invisible. Nothing in the app shows an absence, so any design where a caller *can* forget to dispatch will eventually have one that does — and `createComment` was copy-pasted into `app/routes/courses.$slug.lessons.$lessonId.tsx` and `app/routes/instructor.questions.tsx`, so two of the seven Types already had two places to forget. Making the Notification a consequence of the write rather than a second thing the caller must remember removes the failure mode instead of documenting it.

## Considered Options

- **Fire inline from each route action**, matching how `sendEmail` is called today. Rejected: it multiplies the Type-5 trigger across both comment entry points, and a future third one silently notifies nobody.
- **A domain event bus** — routes emit `DiscussionQuestionAsked`, a subscriber turns events into Notifications. Rejected: it buys decoupling this app has nothing to decouple. One process, one synchronous SQLite handle, one subscriber, and no second consumer anywhere in the catalogue. It also turns "did this fire?" into a question about wiring rather than about a function call.
- **Return the Notifications as data and let the route write them**, extending the pattern where `raiseRefundRequest` returns an `email` the route sends. Rejected for the same forgettability reason, and because [ADR 0013](./0013-cadence-owns-the-notification-record-and-feed.md) requires tests to assert on *stored* Notifications after calling a function with a `createTestDb()` database — which only holds if the function stores them.

## Consequences

The audience rules now run inside the write path, so `app/lib/comments.server.ts` has to know what an Instructor is. This is the real price of the decision and the thing a reviewer will question.

Four writers have to move out of route modules before they can be called with a test database: `createComment` (de-duplicated into a single `app/lib/comments.server.ts` serving both call sites), `updateCourseStatus` into `app/lib/courses.server.ts`, and `updateUserRole` into `app/lib/users.server.ts`. They adopt the `{ ok, status, error }` result convention that `refunds.server.ts` already uses, in place of the bare `throw new Error` they use today — a change to error handling in two routes that are otherwise unrelated to notifications. The extracted module must carry the `.server` suffix: `app/lib/comments.ts` is client-safe, and putting a database writer there would pull `better-sqlite3` into the browser bundle that `app/db/index.ts` is carefully written to stay out of.

Five of the seven actions have no transaction today and gain one, so that "the Notification rows share the action's transaction" stays a rule without exceptions. Notifiers are therefore synchronous and take the `Db | Tx` union: better-sqlite3 transactions cannot `await`.

That same constraint settles delivery. The transport from ADR 0013 is handed the committed rows *after* the transaction returns, un-awaited, with failures logged and never thrown — a third-party HTTP call can neither slow nor fail a user's request. A dropped delivery costs realtime only; the row is committed and the feed renders it either way. Keyless the transport is a no-op, so local development and CI never exercise the floating promise at all.

For a release, `app/routes/admin.refunds.tsx` will handle messaging two ways at once: notifications dispatched inside the action function, email still returned as data for the route to send. This is deliberate — migrating the existing Postmark email is out of scope — and should be read as a boundary, not an oversight.
