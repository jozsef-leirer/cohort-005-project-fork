# Cadence ships in-app notifications with no third-party notification service

Cadence integrates no hosted notification service. Every job one could have done here was taken by a decision made earlier on the notifications map: Cadence owns the Notification record and renders its own Notification Feed (ADR 0013), the wording of each Notification is a string literal frozen at fire time by one of seven notifiers in `app/lib/notifications.server.ts` (ADR 0014), channels beyond the Notification Feed — email, push, mobile, Slack — are out of scope for this effort, and realtime is Cadence's own in-process Server-Sent Events stream. Realtime was the last job standing; with it in-house, there is no remaining function a vendor performs, and a free tier is a price rather than a job.

## Considered Options

- **Knock**, the capability winner of the research. A genuinely free 10,000 messages/month with no hard cap, server-owned read state and indefinite retention. Rejected: its React feed component renders nothing without a key, so it cannot satisfy the requirement that a fresh clone with no credentials shows a working Notification Feed; its free plan carries a server-driven, unremovable "Powered by Knock" footer; and after ADR 0013 there would be no component to mount it on anyway.
- **Courier**, the leader of the non-Knock field. Rejected for the same keyless failure — no vendor in the field ships an offline or no-credentials mode for its React feed component.
- **Integrate a vendor anyway, against future channels.** Rejected: it buys an `.env` key, a vendor account and a dependency that does nothing today, for channels this effort has ruled out of scope. If email notifications ever arrive, the near-at-hand answer is the Postmark transport Cadence already has in `app/lib/mailer.server.ts`, not a new platform.
- **Build the transport seam empty** — a `NotificationTransport` interface with a no-op default and an environment variable nothing reads, mirroring the mailer exactly. Rejected as speculative generality: it would be the only part of the spec with no behaviour behind it, and the first implementer would have to invent a payload shape for a consumer that does not exist.

## Consequences

The seam is a named location rather than an abstraction. ADR 0014's post-commit hand-off — committed rows handed off after the transaction, un-awaited, never throwing — is a real structural feature that the Server-Sent Events emit already occupies, and it has exactly the properties a delivery transport would need. A future channel is added there, beside the emit, with `app/lib/mailer.server.ts` as the pattern to copy. Nothing is built for it in advance: no interface, no no-op implementation, no environment variable.

`README.md` still tells a reader to sign up for a free Knock Developer account "when you build notifications" and to put its keys in `.env`. That line is now advice about a service this repo never calls, and should be removed when the notifications spec is implemented.

The research that produced this decision is not wasted — it is what killed the purchase. Knock was investigated and found to be the best vendor available; the wider landscape was investigated and found to contain no vendor with a keyless mode at all. That second finding is what made the keyless-clone requirement fatal to every candidate rather than to one.
