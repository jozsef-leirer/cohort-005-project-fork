# The hosted notification service landscape beyond Knock

Research for [#5](https://github.com/jozsef-leirer/cohort-005-project-fork/issues/5), part of the
map [#1](https://github.com/jozsef-leirer/cohort-005-project-fork/issues/1).

- **Checked**: 2026-11-23. Vendor pricing and docs move; re-verify figures before signing anything.
- **Scope**: credible hosted notification-infrastructure vendors that ship a **React in-app
  feed/inbox component** and a **server-side trigger API**. Knock is deliberately *not* researched
  here — [#4](https://github.com/jozsef-leirer/cohort-005-project-fork/issues/4) owns it. Knock
  appears only where a comparison row needs a reference point.
- **Sources**: each vendor's own docs, pricing page, GitHub org and npm registry. Third-party
  sources are used nowhere as evidence; the two places where only a third party had the fact are
  marked **[non-primary]** and should be treated as unconfirmed. Where a vendor's docs are silent,
  this document says **not documented** rather than guessing.
- **Where this file lives**: `docs/research/` is new. There was no existing convention for research
  notes (`docs/` previously held only `docs/agents/issue-tracker.md`), so this directory was created
  for it.

---

## The headline

**No vendor in this landscape documents an offline or no-credentials mode for its React feed
component.** Every candidate's inbox component requires a live connection to the vendor's API, and
in most cases a server-minted token as well, before it will render anything. Several vendors ship a
*sandbox* or *test environment* — SuprSend ([docs](https://docs.suprsend.com/docs/inbox-quick-start)),
Courier ([docs](https://www.courier.com/docs/workspaces/environments)) — but a sandbox is still a
network call to the vendor's cloud, which is not what `app/lib/mailer.server.ts` does.

That matters for how this decision gets framed. Cadence's email layer doesn't meet its own bar
because Postmark provides an offline mode; it meets the bar because the *codebase* defines a
`MailTransport` interface and picks `outboxTransport(".outbox")` when `POSTMARK_SERVER_TOKEN` is
absent. The seam is ours, not Postmark's. So the real question to ask of each vendor is not "does it
have a mock mode" (none do) but **"how cheaply can we put our own seam in front of it?"** — and that
splits cleanly in two:

- **The server-side trigger** is easy to seam for every candidate. Each is a single
  `POST`-a-workflow-id-and-a-recipient call, trivially hidden behind a `NotificationTransport`
  interface with an `.outbox/`-style no-op implementation. This half of the problem is solved for
  all of them.
- **The React feed component** is the hard half, and it is hard for *all* of them, because the
  component owns its own data fetching and realtime socket. The only documented escape is mocking
  the SDK module in tests — which Courier is alone in actually writing down
  ([docs](https://www.courier.com/docs/sdk-libraries/courier-react-web), a `jest.mock` of
  `useCourier`). For dev, the generic answer across all vendors is that the inbox stays empty or
  errors without credentials, so Cadence would need its own fallback surface.

Secondary headline: **MagicBell is alive.** The ticket's framing invited the possibility that it had
gone quiet; it has not. Status page reported all-systems-operational on 2026-11-23
([status.magicbell.com](https://status.magicbell.com/)) and the `magicbell-js` repo was pushed
2026-11-10 (verified via GitHub API). What it *does* have is a very small team and the smallest free
tier in the field.

---

## Comparison table

Vendors as rows. Knock's row is reference-only, from its pricing page and React overview; #4 owns
the detail.

| | Free tier | Past the limit | React feed component | SSR | Trigger API | Read-state | Preferences | Client auth | No-network dev/test | Health signal |
|---|---|---|---|---|---|---|---|---|---|---|
| **Knock** *(ref. only)* | 10,000 messages/mo, unlimited seats + profiles, 30-day log retention | No hard cap; "we'll get in touch with you about making sure you have a billing method in place next month" | `@knocklabs/react` — pre-styled (`NotificationFeed`, `NotificationFeedPopover`) **and** headless hooks | not documented on the React overview page | — | — | — | — | — | — |
| **Novu** | 10,000 workflow runs/mo, unlimited subscribers, 5 workflows, 3 seats, 2 envs, **24h activity-feed retention**, 60 RPS | **Hard block — HTTP `402`** until the period resets or you upgrade | `@novu/react` v3.21.0 — pre-styled `<Inbox>` **and** headless hooks (`useNotifications`, `usePreferences`) | **not documented** | `POST /v1/events/trigger`; `novu.trigger({workflowId, to, payload})` | read / seen / archived as distinct flags; "seen" auto-set after 1s visible and irreversible | 3-layer (workflow → subscriber global → subscriber per-workflow); critical workflows hidden from prefs | `subscriberId` + optional HMAC `subscriberHash`; **inbox won't load if HMAC is on and the hash is absent** | **None.** `npx novu dev` is a *tunnel to Novu Cloud*, not offline; the local Studio app was removed | 40,417 stars, pushed 2026-11-23, releases the same day. Seed $6.6M (2022), no later round documented. Homepage now leads with AI agents |
| **Courier** | 10,000 sends/mo, 30-day message history; **Inbox included on free** | No overage path documented for free; the documented path is "add a credit card" | `@trycourier/courier-react` v9.3.x — pre-styled `<CourierInbox>`, `<CourierPreferences>` **and** `useCourier()` headless | **Documented, and client-only**: components "render client-side only", add `"use client"` | `POST /send` with a `message` object (`to`, `template` *or* inline `content`, `data`, `routing`) | read / unread / archived; `inbox.read()`, `readAll()`, `archive()`; **`totalUnreadCount` available** | Subscription topics + sections; `default_state` incl. `REQUIRED`; hosted + embeddable preference center | **Mandatory** short-lived JWT from `POST /auth/issue-token`, minted by your backend. No publishable browser key | Test *environment* with a Test API key (still networked). **Only vendor that documents SDK mocking for unit tests** | Repo `courier-web` pushed 2026-11-16; React 9.3.4/9.3.5 shipped 2026-11-09. Old `courier-react` repo **archived** 2026. Series B $35M (2022), nothing since. Heavy AI-agent positioning |
| **MagicBell** | **1,000 deliveries/mo**, 1 project, unlimited users + seats | Overage billed per-delivery on *paid* tiers; **free-tier behaviour not documented** | `@magicbell/react` v1.14.0 — pre-styled (`FloatingInbox`, `Inbox`, `UserPreferences`) with importable CSS; two earlier packages **deprecated** | **not documented** | `POST /broadcasts` (`title`, `content`, `recipients` ≤1000, `overrides`); Project JWT | `mark-read` / `mark-unread` / `mark-seen` / `archive` / archive-all, **`GET /notifications/unread-count`**; realtime via **Ably** | Categories → channels, each with an `enabled` flag; `PUT /v2/channels/user_preferences` | Project JWT (server) + User JWT (HMAC-SHA256, minted by your backend). Legacy v1 HMAC header "highly recommended", not enforced | **not documented** — no mock or sandbox mode found | Alive: status green 2026-11-23, `magicbell-js` pushed 2026-11-10 (31 stars). **~4-person team**; YC / Cherry / Connect backing, amount undisclosed. No changelog page (404); older platform SDKs stale |
| **SuprSend** | 10,000 notifications/mo, **unlimited seats**, unlimited channels, 30-day retention; feed carries **SuprSend branding** on free | **Soft cap** — "We do not stop processing and sending your notification requests… we will alert and contact you" | `@suprsend/react` v1.6.0 (pre-styled Inbox/Feed/Preferences) + `@suprsend/react-core` (headless hooks) | **not documented** | `POST https://hub.suprsend.com/trigger/`; `workflows.trigger()`; **workflow-as-code via CLI** (`suprsend workflow push`) and a management API | seen / read / unread / archived; `markAsSeen`, `markAsRead`, `markAllAsRead`; server-side `PATCH /v1/bulk/message/`; `unSeenCount` client-side | Three levels: channel prefs, categories, per-category per-channel opt-out; mandatory channels. **Root categories can't be opted out** | `publicApiKey` + `distinct_id`; ES256 JWT **required only when Enhanced Security Mode is on** (sandbox doesn't check tokens at all) | Sandbox / Staging / Prod workspaces + Test Mode (all networked). No-network render **not documented** | React SDK ships monthly (v1.6.0, 2026-11-17); CLI and docs pushed 2026-11-23. **But `@suprsend/node-sdk` is v1.15.1 from 2026-05-19** — the server SDK you'd actually use is 6 months stale. Funding and HQ **not documented** on their own site |
| **Engagespot** | Free-forever "Launch": 10,000 triggers/mo, 2 envs, 2 seats, 7-day retention — **could not verify against the vendor's own page** (see reservations) | **not documented** | `@engagespot/react-component` v3.0.1 (pre-styled) + `@engagespot/react-hooks` / `@engagespot/core` (headless) | **not documented** | `POST https://api.engagespot.co/v3/notifications` carrying a `workflow` identifier | `markAsRead(id)` → `POST /notifications/:id/click`; `markAllAsRead()` | `preferences.getPreferences()` / `setPreferences()`, per channel | `userId` required; `userToken` JWT **only if "secure auth" is enabled** — their docs admit that otherwise "unauthorized access to your users' inbox messages is possible" | **not documented** | **Weak.** The entire public GitHub org has been dormant since **2025-01-25** (verified via API across all 100 repos). react-component v3.0.1 was built with npm 11.0.0 / Node 20.18.1, consistent with early 2025. Pricing page 404s to automated fetch. Seed-stage **[non-primary]** |
| **Pingram** *(ex-NotificationAPI)* | 3,000 emails, 100 SMS, 100 voice min/mo. **No in-app quota documented** — the free tier is shaped by email/SMS/voice, not in-app events | **not documented** for the free tier | `@notificationapi/react` v1.7.0 (pre-styled provider + bell/feed) + `notificationapi-js-core` (headless) | **Documented**: `'use client'` plus dynamic import to avoid SSR issues | `https://api.notificationapi.com/{clientId}` — send / schedule / identify / in-app | `markInAppNotificationsAsSeen`; `/enduser` routes cover unread count and mark-read | `/enduser` preferences routes; `set-preferences` | `clientId:userId` or `clientId:userId:hashedUserId` (Basic). Whether the hashed form is *required* for the React component is **not documented** | **not documented** (only a `debug` logging prop) | Rebranded Jan 2026; `notificationapi.com` 301s to `pingram.io`. Repos active (react SDK pushed 2026-10-31, `pingram-go` 2026-11-23) but the JS client SDK repo is **archived**. ~849 npm downloads/week — tiny adoption. Self-described bootstrapped and profitable, founded 2020 |
| **Notiflows** *(2026 entrant)* | 10,000 deliveries/mo, unlimited projects / workflows / seats | FAQ entry exists; **answer text not retrievable — treat as not documented** | `@notiflows/react` **v0.2.2** — `FeedRoot` / `FeedTrigger` / `FeedContent` / `BellButton` plus `useFeed`, `useNotificationStatus` | **Documented**: `'use client'` for the Next App Router, server-generated `userKey` | **not documented** — a visual workflow builder is the stated model; no REST trigger shape published | `useNotificationStatus` exists; method names **not documented** | **not documented** | `apiKey` + `userId` + **mandatory** `userKey` JWT signed server-side with an Application Signing Key | Marketing claims a sandbox; a component-level mock is **not documented** | Public since ~March 2026 **[non-primary]**. Funding, team and HQ **not documented anywhere**, including their own About page. SDK is pre-1.0 |

---

## Outright disqualifications

These are ruled out on documented capability, not on preference.

**OneSignal — disqualified on capability.** It has push notifications and *in-app messages*, and
those are not the same thing as an inbox. OneSignal's own in-app messages are "pop-up interstitials"
that are "pulled at session start" and "display inside your app while the user is actively using it"
([onesignal.com/in-app](https://onesignal.com/in-app)) — ephemeral, not a stored list a user can
reopen. There is no mark-as-read, no archive, and no feed UI anywhere in their in-app docs. The Web
SDK reference enumerates its features as push, slidedown prompts, identity, tags, custom events,
privacy controls and outcomes — **no inbox, message center or feed**
([documentation.onesignal.com/docs/web-sdk-reference](https://documentation.onesignal.com/docs/web-sdk-reference)).
`react-onesignal` v3.5.5 is a thin push wrapper
([npm](https://www.npmjs.com/package/react-onesignal)). Read/unread state is explicitly in scope for
this map (#1), and OneSignal cannot express it.

**Beamer and Frill — disqualified on shape.** Both are broadcast changelog/feedback widgets, not
per-user trigger-driven notification feeds. Beamer documents no framework SDKs
([help.userflow.com/beamer/docs/developer-documentation](https://help.userflow.com/beamer/docs/developer-documentation));
Frill is an ideas/roadmap/announcements board ([frill.co/product/widget](https://frill.co/product/widget)).
Neither has a server-side API for triggering a notification to one named recipient.

**Braze and Iterable — disqualified on fit.** Both have feed-like primitives (Braze Content Cards,
Iterable embedded messages and mobile Inbox) but are enterprise CRM suites with campaign-shaped
pricing and no free tier of the kind this map asks for. Braze's web story is event-listener based
(`subscribeToContentCardsEvents`,
[docs](https://www.braze.com/docs/developer_guide/content_cards)), not a drop-in React package;
Iterable's web SDK exposes message-fetch methods, not a feed component
([github.com/Iterable/iterable-web-sdk](https://github.com/Iterable/iterable-web-sdk)).

**Customer.io — near miss, dismissed on shape.** It genuinely added a headless, developer-facing
in-app inbox in 2026: notifications arrive as JSON and you build the UI
([docs.customer.io](https://docs.customer.io/messaging/channels/in-app/inbox/get-started/)). But it
is a marketing-automation platform first, there is no pre-built React feed component to drop in, and
its free-tier terms for this use are not documented. If Cadence ends up building its own inbox UI
anyway, this deserves a second look; as "hosted SaaS with a React feed component" it does not
qualify.

**Notiflows — not disqualified, but do not adopt.** It matches the category's shape well and
documents SSR and mandatory JWT signing better than some incumbents. It is also roughly eight months
old, pre-1.0 (`@notiflows/react` v0.2.2), publishes no funding, team size or location even on its own
About page, and its stated limits and sandbox could not be verified. Watch list.

### Serious reservations, short of disqualification

**Engagespot.** The public GitHub org has not been pushed to since **2025-01-25** — that is the
newest `pushed_at` across all of its repos, verified directly against the GitHub API, nearly two
years dark. `@engagespot/react-component` sits at v3.0.1, built with npm 11.0.0 and Node 20.18.1,
consistent with an early-2025 publish. Their pricing page returns 404 to automated fetches, so the
free-tier figures in the table are from a search index and are **unverified against the vendor's own
page**. Combined with a default auth mode their own docs describe as allowing "unauthorized access to
your users' inbox messages", this is not a vendor to bet a spec on without first checking by hand
whether the React SDK is maintained from a private repo.

**Pingram.** Founded 2020 and plausibly stable, but mid-rebrand from NotificationAPI as of January
2026, with ~849 npm downloads/week and an archived JS client SDK repo. More pointedly for Cadence:
its free tier is denominated in emails, SMS and voice minutes with **no documented in-app
notification quota at all** — for an in-app-inbox-only use case, nobody has written down what you
get.

**SuprSend's server SDK.** `@suprsend/node-sdk` is v1.15.1, published **2026-05-19** (verified
against the npm registry and the repo's `pushed_at`). The React SDK ships monthly; the Node SDK that
Cadence's loaders and actions would import has not shipped in six months. The trigger API is a plain
`POST`, so this is survivable — but it is a signal about where attention goes.

**Novu's 24-hour activity-feed retention** on the free tier, and its **hard `402` block** at 10,000
workflow runs. A traffic spike silently stops producing notifications rather than degrading, and
there is a one-day window in which to debug anything.

**MagicBell's 1,000 deliveries/month** is 10× smaller than every other free tier here, from a team
whose own About page names about four people.

---

## The self-hosting question (Novu)

The map's standing preference permits self-hosting **only if it is clearly simpler than hosted**. On
Novu's own documentation it is clearly *not*, and the argument is short.

Self-hosted Novu Community requires four application services (API, Worker, WebSocket, Dashboard)
plus **MongoDB** — with production guidance of "M20 or higher on MongoDB Atlas" — plus **two Redis
instances** (one cache, one queue with AOF enabled), plus **S3-compatible object storage** at 10 GB
minimum ([overview](https://docs.novu.co/community/self-hosting-novu/overview),
[deploy-with-docker](https://docs.novu.co/community/self-hosting-novu/deploy-with-docker)). The
Docker quick-start is one curl command, but the same page warns "we made some choices that may not be
optimal for production" and notes that by default anyone who can reach the dashboard can
self-register an account.

Set that against what Cadence is: a SQLite-and-Drizzle app whose entire persistence story is one
file. Adopting self-hosted Novu would mean the notification *sidecar* has a heavier operational
footprint — a document database, two caches and an object store — than the product it serves. On top
of that, Community edition drops social login, SAML/OIDC, MFA and RBAC, carries no compliance
attestations, and gets community-Discord support with no SLA
([docs.novu.co/community](https://docs.novu.co/community),
[self-hosted vs cloud](https://docs.novu.co/community/self-hosted-and-novu-cloud)).

It is also worth noting that self-hosting does **not** buy the thing Cadence actually wants. The
`.outbox/` property is "dev and tests touch no network and need no credentials." A locally hosted
Novu stack is still a network service that needs provisioning, seeding and a secret key; swapping
`api.novu.co` for `localhost:4000` does not give Vitest a credential-free path.

**Recommendation: hosted only.** Self-hosting clears neither the simplicity bar nor the dev-mode bar.

---

## What this does not settle

- **Knock's own numbers** belong to [#4](https://github.com/jozsef-leirer/cohort-005-project-fork/issues/4).
  The only Knock facts recorded here are its free tier (10,000 messages/mo, unlimited seats and
  stored profiles, 30-day log retention, no hard cap —
  [knock.app/pricing](https://knock.app/pricing)) and that `@knocklabs/react` ships both pre-styled
  feed components and headless hooks
  ([docs.knock.app](https://docs.knock.app/in-app-ui/react/overview)).
- **SSR under React Router 8 specifically** is documented by nobody. Courier states its components
  render client-side only; Pingram and Notiflows document a Next.js `'use client'` recipe. Novu,
  MagicBell and SuprSend say nothing about SSR at all. React Router 8 has no RSC `'use client'`
  boundary, so the practical question is whether these components touch `window` during the initial
  render — answerable only by trying it, which is prototype work, not research.
- **Whether a client-only inbox is acceptable at all.** If the chosen component can only render
  client-side, the inbox becomes a hydration-time surface in an otherwise server-rendered app. That
  is a design decision for the inbox-surface ticket, not a vendor fact.
- **The real dev-mode design.** Given that no vendor offers one, the shape of Cadence's own seam — a
  `NotificationTransport` interface mirroring `MailTransport`, plus some fallback for the feed
  component — is a design question this survey can only frame.

---

## On the narrow criteria, ranked

Judged only against the criteria in #5, and setting Knock aside:

1. **Courier** — the only candidate that documents its SSR boundary, documents how to mock its SDK in
   unit tests, mints client tokens through a mandatory and clearly specified server flow, exposes a
   server-side unread count, includes the Inbox on the free tier, and shipped React releases nine
   days before this was written. Its weaknesses are a 2022-era last funding round and a conspicuous
   pivot toward agent messaging.
2. **SuprSend** — the most generous free tier (soft cap, unlimited seats, 30-day retention), the best
   preference model, workflow-as-code via CLI, and the best-maintained React SDK in the field. Dinged
   for the stale Node SDK, the branding on the free-tier feed, undocumented SSR, and a company that
   publishes nothing about itself.
3. **Novu** — the most alive codebase by a wide margin (40k stars, same-day commits) and a strong
   component with a real theming API. Dinged hardest on the free tier's 24-hour retention and hard
   `402`, undocumented SSR, and a company repositioning around AI agents.
4. **MagicBell** — technically clean, with the most complete read-state API surface including a
   server-side unread count, but a 1,000/month free tier and a four-person team make it a thin reed
   for a platform decision.
5. **Engagespot / Pingram / Notiflows** — each has a real React inbox, and each has a company-health
   or documentation problem serious enough that choosing one would need a reason beyond the feature
   table.

Nothing here argues against Knock. It argues that the field is narrower than it looks, that the
differences that matter are maintenance posture and client-auth shape rather than feature
checklists, and that **the no-network dev story is Cadence's problem to solve for every single
candidate**.
