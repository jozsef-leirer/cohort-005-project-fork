# Send transactional email through Postmark, and write to an outbox when there is no token

Cadence sends refund mail through Postmark's HTTP API, behind a `MailTransport`
interface in `app/lib/mailer.server.ts`. The transport is chosen at call time:
with `POSTMARK_SERVER_TOKEN` set, every message is delivered; without one — local
development and the test suite — each message is written to `.outbox/` as a JSON
file instead. Postmark separates transactional from marketing mail by default and
needs no SPF, DKIM or sender reputation of our own. The outbox means a developer
can read exactly what a learner would have received without a token, a staging
account, or a mocked `fetch`.

## Considered Options

- **Keep building the message and logging it, until volume is known.** This is
  what we did before, and the cost was a promise we could not keep: a learner was
  told "we will email you again when it is done" and nothing was ever sent.
- **Run our own SMTP server.** Rejected: SPF, DKIM and sender reputation are a
  standing operational burden, and refund mail is exactly the kind that must not
  land in spam.
- **Mock the transport in tests instead of writing files.** Rejected: the outbox
  is the same code path in development as in tests, and the files can be read
  after the fact.

## Consequences

Without `POSTMARK_SERVER_TOKEN` the app silently sends nothing, which is right for
development and wrong in production — a deploy that forgets the variable looks
healthy. `.outbox/` accumulates files and is never pruned. A Postmark rejection
throws, so a failed send surfaces as a failed request rather than a lost email.
