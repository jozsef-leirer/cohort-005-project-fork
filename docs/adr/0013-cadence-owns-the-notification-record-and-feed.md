# Cadence owns the Notification record and renders its own Notification Feed

Cadence stores every Notification in its own table and renders the Notification Feed itself; a third-party notification service, if one is ever added, is a delivery and templating layer behind that, never the source of truth and never the UI. The forcing requirement is that a fresh clone with no credentials must show a working, populated Notification Feed, and `npm run test` must cover the catalogue's audience rules without touching the network. Every hosted vendor's React feed component fetches its own data from the vendor's cloud and renders nothing without a key, so buying one as the source of truth would make the keyless path impossible.

The keyed and keyless paths split at a transport seam modelled on `app/lib/mailer.server.ts`: the trigger always writes the Notification row, then hands it to a transport that is the vendor when its key is in the environment and a silent no-op when it is not. Keyless is a permanently supported mode — local development, CI and anyone following the course without signing up for anything — not a scaffold to be removed.

## Considered Options

- **The vendor owns the record and the feed component**, the shape every vendor's documentation assumes. Rejected: it leaves a keyless clone with nothing to look at and the test suite with nothing to assert against.
- **Two feed UIs** — ours when keyless, the vendor's when keyed. Rejected: it doubles the work, and the UI every contributor actually sees would be the one the vendor never exercises.
- **An `.outbox/`-style artifact for the local transport**, mirroring the mailer exactly. Rejected: an email leaves no trace without one, but a Notification's trace is the row, which the feed renders and tests read.

## Consequences

What is left for a notification service to do is delivery to other channels, templating and realtime transport — a real but much smaller purchase than "a notifications platform", and possibly not worth making yet. Matching the app's existing look means a headless integration rather than a drop-in component.

Tests assert on stored Notifications after calling a trigger with a `createTestDb()` database, which requires every Notification Type in the catalogue to fire from a function a test can call. Triggers that today sit inside route modules closing over the shared `db` — the role change in `app/routes/admin.users.tsx` is the clearest — have to move before they can be covered.

The rendered Notification Feed is deliberately not covered by `npm run test`. This repo has no DOM test environment and no component-testing library, and introducing one is a project-wide testing decision, not a notifications one. The feed is verified by prototype and by looking at it in a keyless clone.
