# Knock: the in-app feed, the model, and the limits

Research for [#4](https://github.com/jozsef-leirer/cohort-005-project-fork/issues/4),
part of the map [#1](https://github.com/jozsef-leirer/cohort-005-project-fork/issues/1).

**Date of research:** 2026-11-23. Knock ships changes continuously and its docs are
undated; treat every number here as "as of this date".

**Sources.** Knock's own documentation (`docs.knock.app`, which serves a `.md`
variant of every page), its public API reference (same host, `/api-reference/...`),
its pricing page (`knock.app/pricing`, server-rendered, so the numbers are in the
static HTML), and the source of `@knocklabs/react` / `@knocklabs/react-core` /
`@knocklabs/client` in `github.com/knocklabs/javascript`. No blog posts, no
comparison sites. Where Knock's docs are silent, this document says
**not documented** rather than inferring.

---

## 1. Headline findings

Ordered by how much they would change a decision.

1. **There is no offline, mock, local, or sandbox mode for the in-app feed.**
   Knock's sandbox mode — the one feature that looks like our `.outbox/`
   fallback — explicitly excludes the in-app channel: *"Sandbox mode is
   supported across all channel types (except for in-app)"*
   ([integrations overview](https://docs.knock.app/integrations/overview#sandbox-mode)),
   and the plans page spells out why: *"The in-app channel doesn't support
   sandbox mode. Knock manages in-app delivery, so there's no downstream
   provider handoff to suppress."*
   ([knock-plans](https://docs.knock.app/manage-your-account/knock-plans#faq-sandbox-in-app-feed-messages)).
   There is no documented testing story for the React feed components at all,
   and the `createMockKnock` harness Knock uses internally is **not published**
   (§11). This is the direct opposite of the `app/lib/mailer.server.ts` bar.
   Mitigating facts, all undocumented and established from source: an
   unauthenticated provider makes zero requests and still renders the empty
   feed, nothing throws on a missing key, and `KnockProvider` takes a `host`
   prop — so a no-keys clone is quiet, and a local fake is buildable, by us.

2. **Usage accrues in every environment, including development.**
   *"Regardless of plan, usage may be accrued in any Knock environment."*
   ([knock-plans](https://docs.knock.app/manage-your-account/knock-plans#how-knock-meters-usage)).
   Combined with (1), every notification a developer generates while building
   counts against the 10,000/month allowance.

3. **The free plan puts "Powered by Knock" in the feed.** The pricing
   comparison table lists *"Remove Knock branding"* as **No** on Free, **Yes** on
   Starter ($250/mo) and Enterprise ([pricing](https://knock.app/pricing)). The
   component source confirms what that means in the UI: `NotificationFeed`
   renders a branding footer when the server says it must —
   `{settings?.features?.branding_required && (<div className="rnf-notification-feed__knock-branding"><a href={poweredByKnockUrl} …>{t("poweredBy") || "Powered by Knock"}</a></div>)}`
   ([NotificationFeed.tsx](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx)).
   It is server-driven, so it cannot be removed by a prop — only by building the
   feed headlessly or paying.

4. **Nothing is hard-capped.** *"We don't hard cap your messages. Our priority is
   making sure the service continues to work as you'd expect. If you go over
   your limit, we'll get in touch with you about making sure you have a billing
   method in place next month."* ([pricing](https://knock.app/pricing), FAQ). So
   the ceiling is a conversation, not a 429.

5. **Read state is a first-class server concept and is queryable server-side**,
   not component-only. `seen` / `read` / `interacted` / `archived` are per-message
   engagement statuses with their own timestamps, settable via
   `PUT /v1/messages/{id}/{status}` and filterable on `GET /v1/messages?engagement_status=…`
   ([message statuses](https://docs.knock.app/send-notifications/message-statuses#engagement-status),
   [list messages](https://docs.knock.app/api-reference/messages/list)).

6. **Client-side auth is optional while you build and mandatory in production.**
   Enhanced security mode is off by default and *"a request with your public key
   can act as any user"*; turning it on requires your backend to sign an RS256
   JWT per user
   ([security and authentication](https://docs.knock.app/in-app-ui/security-and-authentication)).
   For a DevUI that switches freely between seeded users, the off-by-default mode
   is actually convenient — and is also the mode Knock tells you not to ship.

7. **Feed items never expire, but your ability to debug them does.** In-app feed
   items are *"available indefinitely"*; message **log** data is pruned after
   **30 days** on all non-Enterprise plans
   ([data retention](https://docs.knock.app/manage-your-account/data-retention)).

8. **Multiple feeds per user are supported; role-scoped feeds are not a concept.**
   You get as many in-app channels as you want, plus filtering by tenant,
   workflow key, and top-level `data` keys — but Knock has no notion of a "role",
   so role scoping has to be modelled by you (see §8).

---

## 2. The model

### Entities

| Knock entity | What it is | Source |
| --- | --- | --- |
| **Workflow** | The unit you build in the dashboard: a trigger step, channel steps, and function steps. *"All Knock workflows consist of three basic parts: A **trigger step** … **Channel steps** … **Function steps**"* | [designing workflows](https://docs.knock.app/designing-workflows/overview#the-workflow-canvas) |
| **Workflow run** | One per recipient per trigger. *"it will produce a **workflow run** for **each recipient** you send in your workflow trigger"* | [designing workflows](https://docs.knock.app/designing-workflows/overview#how-the-knock-notification-engine-works) |
| **Recipient** | A `User` or an `Object`. Has identifiers, properties, preferences, channel data. | [concepts/recipients](https://docs.knock.app/concepts/recipients) |
| **Channel** | A configured provider instance of a channel *type*. The in-app feed is a Knock-managed channel type (`in_app_feed`); no third-party provider is involved. | [preferences overview](https://docs.knock.app/preferences/overview#channels-vs-channel-types) |
| **Message** | *"a notification delivered to a User or an Object on a particular channel"* — the thing a recipient interacts with. | [concepts/messages](https://docs.knock.app/concepts/messages) |
| **Feed** | *"a specialized view of messages delivered to an in-app feed channel"*. Reverse-chronological, with aggregate counts. | [concepts/messages](https://docs.knock.app/concepts/messages), [feeds overview](https://docs.knock.app/in-app-ui/feeds/overview) |
| **Tenant** | An account/workspace/organization. *"Behind the scenes, a tenant is a system-level Object in a special collection called `$tenants`"*. Knock auto-creates a stub tenant for any tenant id you pass. | [tenants](https://docs.knock.app/multi-tenancy/overview) |
| **Audience** | A static or dynamic user segment. Can trigger workflows **on membership change only** — *"It's not yet possible to trigger a workflow for an audience via the API."* | [audiences](https://docs.knock.app/concepts/audiences), [trigger API FAQ](https://docs.knock.app/send-notifications/triggering-workflows/api#faq-trigger-workflow-for-audience) |

Content is authored in Knock's template editor, not in our repo. A feed item
carries *rendered* `blocks` (markdown/text/button-set), so the wording of every
notification lives in the Knock dashboard, not in version control
([in-app API overview](https://docs.knock.app/in-app-ui/api-overview#message-content-blocks-contentblock)).
(Workflows *can* be pulled/pushed as files with the Knock CLI — see §11.)

### The server-side trigger call

`POST /v1/workflows/{workflow_key}/trigger`, authenticated with the **secret**
API key. In the Node SDK:

```js
await knock.workflows.trigger("comment-created", {
  actor: "user_0",
  recipients: ["user_1", "user_2", "user_3"],
  data: { page_name: "Marketing brief", comment_body: "…" },
});
```

([designing workflows](https://docs.knock.app/designing-workflows/overview#how-the-knock-notification-engine-works))

Payload shape, verbatim from the
[trigger API docs](https://docs.knock.app/send-notifications/triggering-workflows/api#trigger-payload):

| Property | Type | Description |
| --- | --- | --- |
| `key`\* | string | The human-readable key of the workflow from the Knock dashboard |
| `actor` | RecipientIdentifier | An identifier of who or what performed this action (optional) |
| `recipients`\* | RecipientIdentifier[] | One or more recipient references of who/what to notify for this workflow |
| `data` | map | A map of properties that are required in the templates in this workflow |
| `cancellation_key` | string | A unique identifier to reference the workflow when canceling |
| `tenant` | string | An optional identifier of the owning tenant object for the notifications generated during this workflow run |
| `settings` | map | An optional map of settings that control how this workflow run is executed |

Response is a single id: `{ "workflow_run_id": "05f8a70d-…" }`.

Other constraints worth knowing:

- **1000 recipients per trigger** max; *"If you need to manage a larger list of
  recipients, you might want to consider using our subscriptions feature"*.
- **No bulk trigger endpoint**: *"It's not currently possible to issue bulk
  trigger requests to the API."*
- `data` payload limit **10MB**; string values over 1024 bytes are truncated *in
  logs*.
- `Idempotency-Key` header dedupes retries for 24 hours.
- A `RecipientIdentifier` is `string | { collection, id } | Record<string, any>`
  — the third form identifies the recipient inline at trigger time
  ([concepts/recipients](https://docs.knock.app/concepts/recipients#recipientidentifier-definition)).
- `settings.sandbox_mode` and `settings.skip_delay` exist for test runs — but see
  §11: `sandbox_mode` does nothing for the in-app channel.

---

## 3. What `@knocklabs/react` actually ships

Per the [React overview](https://docs.knock.app/in-app-ui/react/overview#pre-built-components),
the pre-built in-app notification elements are exactly three:

- `NotificationFeedPopover` — *"a managed popover for displaying a list of notifications"* (positioned by `popper-js`)
- `NotificationFeed` — *"a full-page list of notifications"*
- `NotificationIconButton` — *"for adding a bell icon to your application that shows the current count of unread or unseen notifications"*

Plus `NotificationCell`, `Avatar`, `EmptyFeed`, `UnseenBadge`,
`NotificationFeedHeader` and `NotificationFeedContainer` as the internals you can
reuse or replace
([source tree](https://github.com/knocklabs/javascript/tree/main/packages/react/src/modules/feed/components)).
Everything else in the package is SlackKit / TeamsKit / guides, i.e. not our
problem.

Two context providers wrap them:

- `KnockProvider` — `apiKey`, `user`, `userToken`, `identificationStrategy`,
  `enabled`, `host`, `logLevel`
  ([KnockProvider](https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider)).
- `KnockFeedProvider` — `feedId` (the in-app channel UUID, **required**),
  `colorMode`, `defaultFeedOptions`
  ([KnockFeedProvider](https://docs.knock.app/in-app-ui/react/sdk/components/knock-feed-provider)).

The canonical bell-plus-popover integration, verbatim from the
[feed docs](https://docs.knock.app/in-app-ui/react/feed#rendering-the-component):

```jsx
import {
  KnockProvider, KnockFeedProvider,
  NotificationIconButton, NotificationFeedPopover,
} from "@knocklabs/react";
// Required CSS import, unless you're overriding the styling
import "@knocklabs/react/dist/index.css";

<KnockProvider apiKey={process.env.KNOCK_PUBLIC_API_KEY} user={{ id: user.id }}>
  <KnockFeedProvider feedId={process.env.KNOCK_FEED_CHANNEL_ID}>
    <NotificationIconButton ref={notifButtonRef} onClick={…} />
    <NotificationFeedPopover buttonRef={notifButtonRef} isVisible={isVisible} onClose={…} />
  </KnockFeedProvider>
</KnockProvider>
```

Note the two environment values a working feed needs: a **public API key** and
an **in-app channel UUID**, the latter copied by hand out of the dashboard.

A documentation inconsistency worth flagging to whoever implements: the per-component
SDK reference pages import from `@knocklabs/react-core`
(e.g. [NotificationFeed](https://docs.knock.app/in-app-ui/react/sdk/components/notification-feed)),
while every integration guide imports from `@knocklabs/react`. The guides are
right — `react-core` holds the providers and hooks, `react` holds the rendered
components.

**Headless is a first-class option.** `useAuthenticatedKnockClient`,
`useNotifications`, `useNotificationStore` (a zustand store, with selector
support) and `useKnockFeed` give you items, metadata and every mutation without
any Knock markup
([useNotifications](https://docs.knock.app/in-app-ui/react/sdk/hooks/use-notifications),
[useNotificationStore](https://docs.knock.app/in-app-ui/react/sdk/hooks/use-notification-store),
[custom UI](https://docs.knock.app/in-app-ui/feeds/custom-ui)).
This matters: it is the escape hatch from both the styling problem (§4) and the
branding footer (§1.3).

**There is no pre-built preference component.** The preference centre is a
tutorial you follow, not a component you import: *"This page covers how to build
a `PreferenceCenter` React component with Knock's preferences API and
`@knocklabs/client`"*
([React preferences](https://docs.knock.app/in-app-ui/react/preferences)).
There is a `usePreferences` hook, and a Knock-hosted preference page, but no
drop-in UI.

---

## 4. Themeability against Tailwind 4 + shadcn/ui

Knock gives three levers, in increasing order of effort
([styling](https://docs.knock.app/in-app-ui/feeds/styling#web-react),
[feed docs](https://docs.knock.app/in-app-ui/react/feed#css-customization)):

1. **CSS variables.** *"The feed uses CSS variables that you can override to
   align with your product's design. All variables are prefixed with `--rnf-`."*
2. **Custom CSS.** *"You can completely replace Knock's CSS to tailor the feed's
   look. All feed classes are unique and start with `rnf-`."*
3. **Render props.** `renderItem`, `renderHeader`, `renderLoading`,
   `EmptyComponent`, `avatar`, `archiveButton`, and `children` on
   `NotificationCell`
   ([NotificationFeed props](https://docs.knock.app/in-app-ui/react/sdk/components/notification-feed),
   [NotificationCell props](https://docs.knock.app/in-app-ui/react/sdk/components/notification-cell)).

Plus `colorMode="light" | "dark"` on `KnockFeedProvider` — note this is a
**prop**, not a CSS-variable/`prefers-color-scheme` story, so it must be wired to
whatever drives dark mode in Cadence.

Measured against the published `@knocklabs/react@0.15.1` and the source at
[`a0237b9`](https://github.com/knocklabs/javascript/tree/a0237b90f7e68d03118552430561c6c9e2ef08e7):

- **45** `--rnf-*` custom properties in
  [`theme.css`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/theme.css)
  — spacing 0–8, font sizes xs–3xl, four font weights, three radii, two shadows,
  a gray 100–900 ramp, `--rnf-color-brand-{500,700,900}`, plus
  `--rnf-unread-badge-bg-color`, `--rnf-avatar-bg-color`,
  `--rnf-message-cell-unread-dot-bg-color`, `--rnf-message-cell-hover-bg-color`.
- **91** `--rnf-*` properties once per-component stylesheets are counted
  (`--rnf-avatar-size`, `--rnf-notification-cell-padding`,
  `--rnf-notification-feed-header-height`, …), all defined in `:root`, so all
  globally overridable.
- **53** `.rnf-*` class selectors in `dist/index.css` (66,883 bytes), which also
  carries **378** `--knock-*` tokens generated from Knock's internal
  `@telegraph` design system.
- **Essentially no CSS-in-JS in the feed path.** `@telegraph` components appear
  only in guides / Slack / Teams UI, never under `modules/feed/`. The feed has
  exactly two inline styles: the spinner's `animationDuration` and the popover's
  `visibility`/`opacity` (plus popper's transforms, written in an effect).

Honest read for a Tailwind 4 + shadcn/ui app:

- **In favour** — flat `.rnf-*` classes with no specificity war, tokens that are
  plain `:root` custom properties, and four render props (`renderItem`,
  `renderHeader`, `renderLoading`, `EmptyComponent`) that let you replace every
  row and the whole header with shadcn markup.
- **Against** — the wrapper chrome is fixed. `NotificationFeed` hard-codes three
  nested divs (`rnf-notification-feed`, `rnf-notification-feed__container` — the
  scroll container `useOnBottomScroll` depends on — and
  `rnf-notification-feed__feed-items-container`) with **no `className`, `style`
  or `asChild` escape hatch on any of `NotificationFeed`, `EmptyFeed`,
  `NotificationFeedPopover` or `NotificationIconButton`**. The default header is
  a native `<select>` (visible in the SSR output in §5), which will not match
  shadcn's `Select` without replacing the header. And dark mode is a
  `--${colorMode}` class suffix driven by the provider prop, with
  `.rnf-notification-feed--dark { background-color: #2e2f34; }` hard-coded
  rather than tokenised — so you would be bridging two theming systems rather
  than feeding one.

So "make it look like shadcn" is either (a) a stylesheet plus render props
against fixed chrome, or (b) skip `dist/index.css` entirely and render shadcn
components over the headless hooks. Option (b) also deletes the branding footer.
**Not documented:** any Tailwind-specific guidance, and anything about CSS-layer
or specificity interaction.

---

## 5. SSR under React Router 8

**Knock does not document React Router or Remix at all.** Searching the docs
sitemap and every React page: the only SSR-aware quick start is
[Next.js](https://docs.knock.app/getting-started/quick-start/nextjs), and the only
SSR advice in it is the `"use client"` directive on App Router pages. There is no
statement anywhere in the docs about whether the components are safe to render on
a server outside Next.

So this one had to be answered from the published artifact rather than from prose.
Findings below come from the npm registry metadata and from actually rendering the
published `@knocklabs/react@0.15.1` under Node 22 with no DOM globals — primary
evidence, but **our experiment, not a Knock guarantee**.

### Package facts (npm registry, `@knocklabs/react@0.15.1`)

- `peerDependencies`: `react` and `react-dom` at `^17 || ^18 || ^19` — **React 19
  is supported**, which matters because Cadence is on `react@^19.2.7`.
- `next` (`^13–^16`) and `@tanstack/react-router` (`^1`) are peers too, both
  marked `optional: true` in `peerDependenciesMeta`. **There is no
  `react-router` peer and no `./react-router` subpath export** — only `.`,
  `./next`, `./tanstack`, and `./dist/index.css`. The framework-specific
  entrypoints exist for guides' location sensing, not for the feed, so the plain
  `.` entrypoint is what a React Router app uses.
- Dual ESM/CJS build (`dist/esm/index.mjs`, `dist/cjs/index.js`), typed, with
  `sideEffects` **not declared** — so a bundler cannot safely tree-shake it, and
  the CSS import is a real side effect.
- `"use client";` is the first line of both published entrypoints of
  `@knocklabs/react` (`dist/esm/index.mjs`, `dist/cjs/index.js`), preserved by
  `rollup-preserve-directives` in
  [`packages/react/vite.config.mts`](https://github.com/knocklabs/javascript/blob/a0237b90f7e68d03118552430561c6c9e2ef08e7/packages/react/vite.config.mts).
  `@knocklabs/react-core` carries **no** `"use client"` anywhere, in source or in
  `dist`. Under React Router 8's regular SSR (not RSC) the directive is an inert
  string and is simply ignored either way.
- `sideEffects` is **absent** from `@knocklabs/react` (so no safe tree-shaking)
  but `false` on `@knocklabs/react-core`.
- The source is **SSR-aware by construction**, even though nothing says so in the
  docs. `@knocklabs/client` guards every browser global at the point of use, e.g.
  `if (typeof window !== "undefined" && typeof WebSocket !== "undefined")` before
  constructing the Phoenix socket
  ([api.ts](https://github.com/knocklabs/javascript/blob/a0237b90f7e68d03118552430561c6c9e2ef08e7/packages/client/src/api.ts#L129)),
  and `// Note: here we ensure \`self\` is available (it's not in server rendered envs)`
  before the `BroadcastChannel`
  ([feed.ts](https://github.com/knocklabs/javascript/blob/a0237b90f7e68d03118552430561c6c9e2ef08e7/packages/client/src/clients/feed/feed.ts#L785-L790)).
  `initializeRealtimeConnection` opens with
  `// In server environments we might not have a socket connection`. But: a
  search of the repo's READMEs for "ssr" returns nothing, and there are **no SSR
  tests** — the safety is real but unasserted.
- Runtime deps are heavier than the docs imply: `@popperjs/core`,
  `lucide-react`, two `@radix-ui` packages (`react-dialog`, `react-hover-card`)
  and **eleven `@telegraph/*` packages** (Knock's own design system).
  `@knocklabs/react-core` pulls `@tanstack/react-store`, `swr` and `date-fns`;
  `@knocklabs/client` pulls `phoenix` (the websocket client),
  `eventemitter2`, `nanoid` and `urlpattern-polyfill`. Note that the docs still
  describe the feed store as *"A **zustand** state store"*
  ([FeedStoreState](https://docs.knock.app/in-app-ui/javascript/sdk/types/feed-store-state)) —
  zustand is no longer a dependency; it is `@tanstack/react-store` now. Docs
  drift, harmless, but it means the docs' store description should not be
  trusted for API detail.

### SSR behaviour, measured

Importing the package in bare Node succeeds (73 exports, no DOM access at module
evaluation). Rendering it with **no `window` and no `document`**:

| Rendered tree | `renderToString` | `renderToPipeableStream` |
| --- | --- | --- |
| `KnockProvider enabled={false}` + `KnockFeedProvider` + `NotificationFeed` | 1764 bytes | — |
| `KnockProvider` (enabled, fake `pk_test_` key) + feed | 1764 bytes | 1764 bytes, `onShellReady` fires |
| `KnockProvider` + `NotificationIconButton` | 1145 bytes | — |
| `NotificationFeedPopover`, `isVisible` both `false` and `true` | 1997 / 1998 bytes | — |
| `KnockProvider apiKey={undefined}` + a plain child | 18 bytes, child rendered | — |

Nothing threw. `renderToPipeableStream` is what React Router 8 uses, so the
relevant path is covered. The server-rendered markup is the complete empty-feed
shell:

```html
<div class="rnf-notification-feed rnf-notification-feed--light">
  <header class="rnf-notification-feed__header">
    <div class="rnf-notification-feed__selector">
      <span class="rnf-notification-feed__type">Notifications</span>
      <div class="rnf-dropdown rnf-dropdown--light">
        <select aria-label="Select notification filter">
          <option value="all" selected="">All</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
        …
    <button class="rnf-mark-all-as-read …" disabled="" type="button">Mark all as read…</button>
  </header>
  <div class="rnf-notification-feed__container">
    <div class="rnf-notification-feed__feed-items-container"></div>
    <div class="rnf-empty-feed rnf-empty-feed--light">
      <div class="rnf-empty-feed__inner">
        <h2 class="rnf-empty-feed__header">No notifications yet</h2>
        <p class="rnf-empty-feed__body">We'll let you know when we've got something new for you.</p>
```

Four things fall out of that output:

1. **It is SSR-safe in practice.** No DOM-at-import, no throw, popper included.
2. **The empty state renders on the first pass, not a spinner.** The feed store
   starts at `NetworkStatus.ready`, not `loading`
   ([store.ts](https://github.com/knocklabs/javascript/blob/a0237b90f7e68d03118552430561c6c9e2ef08e7/packages/client/src/clients/feed/store.ts#L35)),
   and `ready` is not "in flight", so `{!requestInFlight && noItems && EmptyComponent}`
   is true immediately. A no-keys clone gets *"No notifications yet"*, not a
   perpetual spinner.
3. **No branding footer appears offline**, because `branding_required` arrives
   from a server call that never happens. Do not conclude from a local render
   that the footer is absent on the free plan — see §1.3.
4. **An invalid `feedId` does not throw**, it logs:
   *"[Knock] [Feed] Invalid or missing feedId provided to the Feed constructor.
   The feed should be a UUID of an in-app feed channel (`in_app_feed`) found in
   the Knock dashboard."* Good for a no-keys clone; noisy in test output.

### The one real SSR hazard: an identify call fires during server render

`useAuthenticatedKnockClient` constructs the client and calls `authenticate()`
*inside `useMemo`*, and `useNotifications` constructs the `Feed` inside a
`useState` initialiser — so both run during render, on the server
([useAuthenticatedKnockClient.ts](https://github.com/knocklabs/javascript/blob/a0237b90f7e68d03118552430561c6c9e2ef08e7/packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts#L122),
[useNotifications.ts](https://github.com/knocklabs/javascript/blob/a0237b90f7e68d03118552430561c6c9e2ef08e7/packages/react-core/src/modules/feed/hooks/useNotifications.ts#L28-L34)).
With the default `identificationStrategy: "inline"` and a `user={{ id }}`
**object**, that means a user upsert on every server render. Measured by stubbing
`globalThis.fetch` around `renderToString` (same harness as above):

| `KnockProvider` props | fetches during SSR |
| --- | --- |
| `user={{ id: "1" }}` (default strategy) | **1** — `PUT https://api.knock.app/v1/users/1` |
| `userId="1"` (string, not object) | 0 |
| `user={{ id: "1" }}` + `identificationStrategy="skip"` | 0 |
| `enabled={false}` | 0 |
| `apiKey="sk_…"` | throws: *"[Knock] You are using your secret API key on the client. Please use the public key."* |

So in a React Router SSR app the documented `user={{ id: user.id }}` snippet
(§3) issues a write to Knock from the server on every page render, in addition to
the one the browser makes on hydration. Knock's own component tests sidestep this
by passing a **string** `userId`
([render.tsx](https://github.com/knocklabs/javascript/blob/a0237b90f7e68d03118552430561c6c9e2ef08e7/packages/react/test/test-utils/render.tsx#L11-L18)),
which is how they run with fake credentials and no network stub. None of this is
documented; the `identificationStrategy` prop is listed with no explanation
beyond *"Defaults to `inline`. Can be set to `skip` to skip inline
identification."*

### Caveats

- SSR gets you the **shell only**. Items are fetched in a client effect, so the
  first paint is always empty-or-spinner and there is no way to hand the feed
  server-loaded data — no `initialItems` prop, no store-hydration API. A React
  Router `loader` cannot prefill the inbox.
- `KnockProvider` accepts a **`host`** prop — *"The Knock API host URL. Defaults
  to the production Knock API."* That is the one documented knob that could point
  the SDK at a local fake. Knock does not document it as a testing technique, and
  there is no documented socket-host override; see §11.
- **Not documented and not tested here:** hydration-mismatch behaviour, and
  whether the `"use client"` boundary is required under a future RSC-mode React
  Router.

---

## 6. Read state

Knock separates **delivery status** (one at a time, Knock-managed) from
**engagement status** (zero or more, partly yours)
([message statuses](https://docs.knock.app/send-notifications/message-statuses)).
For the in-app channel, delivery is trivial — *"In-app messages automatically
skip to the `delivered` status. We always successfully deliver the message to the
Knock Feed API."*

The engagement statuses that make an inbox:

| Status | Timestamp | Who sets it for in-app |
| --- | --- | --- |
| `seen` | `seen_at` | Knock, implicitly: *"the message has been retrieved for display in the recipient's in-app feed at least once"*. Only implicitly managed for in-app. |
| `read` | `read_at` | The React SDK, implicitly: *"In-app — When you're using the Knock ReactFeedProvider SDK"*. |
| `interacted` | `interacted_at` | Knock, for in-app: *"your recipient has explicitly clicked on the notification cell in their feed"*. |
| `archived` | `archived_at` | The recipient, via the archive button. Only implicitly managed for in-app. |
| `link_clicked` | `link_clicked_at` | Only if Knock link tracking is on; a click on the action URL counts as `interacted`, not `link_clicked`. |

*"Engagement statuses are mutually inclusive … an in-app message can have an
engagement status of both `seen` and `marked as read`."*

**Who owns them:** Knock does. They live on the message in Knock's database,
not in our SQLite. Every read/unread flip is a network write.

**Queryable server-side: yes.**

- `GET /v1/users/{user_id}/feeds/{channel_id}` returns `meta.total_count`,
  `meta.unread_count`, `meta.unseen_count` and per-item `read_at` / `seen_at` /
  `archived_at` / `link_clicked_at`, and accepts `status`, `archived`, `source`,
  `tenant`, `has_tenant`, `workflow_categories`, `trigger_data`, `inserted_at.*`,
  cursor pagination and a `mode` of `compact | rich`
  ([list feed items](https://docs.knock.app/api-reference/users/feeds/list_items)).
- `GET /v1/messages` (secret key) filters on `engagement_status`, `channel_id`,
  `tenant`, `source`, `trigger_data`, `workflow_run_id` and dates
  ([list messages](https://docs.knock.app/api-reference/messages/list)).
- Writes: `PUT`/`DELETE /v1/messages/{message_id}/{status}`,
  `POST /v1/messages/batch/{status}`, and
  `POST /v1/channels/{channel_id}/messages/bulk/{action}`
  ([public-key endpoint table](https://docs.knock.app/in-app-ui/security-and-authentication#public-api-key-endpoints)).

The client SDK wraps all of it optimistically: `markAsSeen`, `markAsUnseen`,
`markAsRead`, `markAsUnread`, `markAsArchived`, `markAsUnarchived`,
`markAsInteracted`, and `markAllAsSeen` / `markAllAsRead` / `markAllAsArchived`
— the "all" variants being *"deferred and may take some time to process all items
in the feed"*
([FeedClient reference](https://docs.knock.app/in-app-ui/javascript/sdk/feed-client)).

Two defaults to design around:

- **Opening the popover marks everything `seen`, not `read`.** *"By default the
  feed will mark all items as seen when the feed popover opens. You can change
  this behavior to mark items as read"* via `onOpen`
  ([feed docs](https://docs.knock.app/in-app-ui/react/feed#mark-as-read-behavior)).
  `NotificationIconButton` likewise defaults to an **unseen** badge, so
  `badgeCountType="unread"` is needed for the familiar unread count.
- **Archived items are hidden by default.** *"by default all `archived` messages
  are excluded from the feed"*
  ([in-app API overview](https://docs.knock.app/in-app-ui/api-overview#filtering-in-app-notifications)).

Finally: **messages are immutable once sent.** *"You can update a feed message's
engagement statuses … but its content and other metadata can't be changed once
Knock generates it. If a message becomes out of date, archive it and trigger the
workflow again"*
([feeds FAQ](https://docs.knock.app/in-app-ui/feeds/overview#faq-update-sent-message)).
No pinning either: *"Currently you can't pin messages. The feed will only return
messages in reverse chronological order with no way to change that order."*

---

## 7. Recipients, identification, and token signing

**Three ways to identify**
([identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients)):

- Direct: `PUT /v1/users/{user_id}` (server, secret key).
- Inline: pass a full recipient object in the trigger payload — *"Knock
  guarantees that recipients are identified before executing any other action.
  This enables lazy recipient creation"*. Also available **client-side**:
  *"Client-side identification is handled automatically when you initialize the
  `KnockProvider` with user data provided. When mounted, the provider will
  identify the user in Knock by upserting the provided user information."*
- Bulk: `POST /v1/users/bulk/identify`.

All three upsert: *"any existing data for a recipient is merged during the upsert
operation."*

**Is there a signing requirement?** Only in enhanced security mode, and that mode
is **off by default**
([security and authentication](https://docs.knock.app/in-app-ui/security-and-authentication#authentication-without-enhanced-security)):

> *"Enhanced security mode is off by default, so you can build and test your
> in-app integration with only your public key. While it's off, you can use your
> public key to authenticate all users, and you do not need to implement any
> other security mechanisms. Knock will not reject requests that do not include a
> signed user token."*

With the warning that matters:

> *"Without enhanced security mode, a request with your public key can act as any
> user. Enable it before you release your in-app feed to your users."*

Turning it on means: generate an RSA signing key in the dashboard (shown once),
store it as `KNOCK_SIGNING_KEY`, and sign an **RS256** JWT per user on the server
with at least a `sub` claim (`iat`/`exp` recommended; `signUserToken` from
`@knocklabs/node` defaults to a 3600s expiry). Optional UCAN-style `grants`
(`user/feed_read`, `user/feed_write`, `preferences/read`, …) plus
`explicit_grants: true` can narrow a token to read-only, or to specific tenants
and objects. `onUserTokenExpiring` is the refresh hook. Knock also notes you can
avoid client auth entirely by proxying through your own backend, *"although we
don't recommend this approach as it will add more latency for your users."*

**What identification costs in a seeded-dev-data app.** Cadence's DevUI switches
freely between seeded users with small integer ids. Reading the docs against that:

- Knock recipient ids are *"A string from your system that uniquely represents the
  recipient"* — stringified small integers are fine, and ids are scoped per
  environment, so dev ids never collide with production ones.
- With enhanced security off (the dev default), switching users is just a new
  `user` prop on `KnockProvider`; no token minting and no server round-trip of our
  own. Knock inline-identifies the user from the browser on mount.
- Knock recommends `enabled` over remount for identity churn: *"This is the
  recommended way to gate the provider on a complete identity … rather than
  mounting and unmounting `KnockProvider` as that identity changes"*. When
  `enabled` flips to true, *"Feed components remount and reload their data"*
  ([KnockProvider](https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider#deferring-activity-with-enabled)).
- The real cost is **seeding**: a seeded user has no Knock-side notifications
  until a workflow has actually been triggered for them, and the only way to
  create feed items is to call the live API. There is no fixture format, no
  import of feed items, and no local store (§11). Every seeded inbox is one or
  more billable messages, in whatever environment it is created.

---

## 8. Role-scoped feeds and multiple feeds per user

**Multiple feeds: yes, several ways.**

- Multiple in-app channels. *"By default, Knock will create a single in-app
  channel for you, but you can easily add additional in-app channels should you
  need to support multiple feeds or different types of in-app message
  experiences."*
  ([feeds FAQ](https://docs.knock.app/in-app-ui/feeds/overview#faq-multiple-in-app-feed-channels)).
  The pricing table lists *"Feeds per recipient … Unlimited"* on every plan,
  described as *"One for your notification feed, another for your inbox, a third
  for your in-app toasts"* ([pricing](https://knock.app/pricing)).
- One channel, many filtered views. `defaultFeedOptions` on `KnockFeedProvider`
  (or options on `useNotifications`) accept anything the feed endpoint accepts,
  and *"These filters apply to all feed results, including real-time updates and
  badge counts for unseen or unread notifications"*
  ([filtering feeds](https://docs.knock.app/in-app-ui/feeds/filtering-in-app-feeds)):
  `tenant` (+ `has_tenant: true`), `source` (a workflow key), `trigger_data`,
  `status`, `archived`, `workflow_categories`.

**Role-scoped feeds: no such concept.** Knock has no "role" entity. The three
ways to approximate one, all ours to build:

1. **Trigger-data filtering** — put `role` in `data` and filter
   `trigger_data: { role }`. Constrained: *"Filters use AND logic … Each key
   accepts a single value … You can only filter by top-level keys in your data
   payload … Only exact value matching is supported, including type."* And
   filtering by multiple `source`s is *"not supported"*.
2. **Workflow categories** — `workflow_categories` is a feed filter, and
   categories are also the unit of preference opt-out, so a category per audience
   is the idiomatic Knock move.
3. **Separate in-app channels per role** — clean separation, but a separate
   `feedId`, a separate badge, and every workflow has to name the right channel
   step.

**Tenants are the one built-in scoping axis**, and Cadence has a Team Admin role
with teams, so tenants may genuinely fit. Caveat: *"By default, filtering by
tenant includes all notifications that either: Include the specified tenant [or]
Were sent without a tenant identifier"* — forgetting `has_tenant: true` silently
leaks untenanted items into a tenant view. Also note that per-tenant
*preferences*, *branding*, *translations* and *guides* are **Enterprise-only**,
while tenant data and tenant-scoped triggers work on any plan
([knock-plans FAQ](https://docs.knock.app/manage-your-account/knock-plans#faq-tenants-on-non-enterprise-plan)).
A user token can also be *scoped* to a tenant, so a feed read can be restricted
server-side to the tenants a user belongs to — but only in enhanced security mode
([security and authentication](https://docs.knock.app/in-app-ui/security-and-authentication#scoping-a-token-to-a-tenant)).

Audiences exist but are the wrong tool here: they are triggered by membership
change, and *"It's not yet possible to trigger a workflow for an audience via the
API."*

---

## 9. Preferences and opt-out

Knock's preference machinery is real and reasonably deep
([preferences overview](https://docs.knock.app/preferences/overview)):

> *"A user has a `PreferenceSet`. A `PreferenceSet` is a JSON object that tells
> Knock which channels, categories, and/or workflows a user has opted out of
> receiving. When Knock runs a workflow for a user, we evaluate their
> `PreferenceSet`. A message will not send if the user has opted out of receiving
> it."*

Four keys — `categories`, `channels`, `channel_types`, `workflows` — composable
into a grid. The in-app feed appears as the `in_app_feed` channel type:

```json
{ "categories": { "collaboration": { "channel_types": { "email": true, "in_app_feed": true } } } }
```

Also available: environment-level default preference sets, a documented merge
hierarchy, preference conditions, object preferences, commercial unsubscribe, and
bulk preference setting. Enforcement is engine-side — a channel step skipped by
preferences produces **no message**, and therefore costs nothing: *"If a channel
step is not executed, there is no associated message. A channel step may be
skipped due to user preferences, missing data, or other workflow logic."*
([knock-plans](https://docs.knock.app/manage-your-account/knock-plans#message-counts)).

**UI is not included.** As noted in §3, there is no pre-built React preference
component: the docs walk you through building a `PreferenceCenter` against
`@knocklabs/client`, with a
[`usePreferences`](https://docs.knock.app/in-app-ui/react/sdk/hooks/use-preferences)
hook and a Knock-[hosted preference centre](https://docs.knock.app/preferences/hosted-preference-center)
as the alternatives. Per-tenant preference defaults are Enterprise-only.

Preferences are readable and writable with the **public** key (`GET`/`PUT
/v1/users/{id}/preferences/{id}`), so a preference UI needs no backend proxy —
and, with enhanced security off, no auth either.

---

## 10. The free plan, exactly

Knock renamed the Developer plan: *"Knock offers a Free plan (formerly known as
our Developer plan)"*
([knock-plans](https://docs.knock.app/manage-your-account/knock-plans)). The docs
carry **no numbers at all** and defer to the pricing page: *"See our pricing page
for current pricing, included volumes, and a feature comparison."* The figures
below are from [knock.app/pricing](https://knock.app/pricing), which is
server-rendered (verified by reading the raw HTML), quoted verbatim.

| | Free | Starter | Enterprise |
| --- | --- | --- | --- |
| Price | **$0 / month** | $250 / month + additional usage | Custom |
| Messages sent, included monthly | **up to 10,000** | 50,000 then $0.005/ea | Contact us |
| Guide recipients | up to 500 | 2,500 then $0.05/ea | — |
| Agent credits | up to 500 | 2,000 then $0.01/credit | — |
| Team members | **Unlimited** | Unlimited | Unlimited |
| Isolated environments | **Unlimited** | Unlimited | Unlimited |
| Feeds per recipient | **Unlimited** | Unlimited | Unlimited |
| Feed retention | **Unlimited** | Unlimited | Unlimited |
| Log retention | **30-day retention** | 30-day | 90-day |
| Pre-built components / bring your own | Yes / Yes | Yes / Yes | Yes / Yes |
| Feed API, custom feed filtering | Yes | Yes | Yes |
| **Remove Knock branding** | **No** | Yes | Yes |
| Custom roles and permissions | No | No | Yes |
| Translations (i18n) | No | No | Yes |
| Per-tenant preferences / branding | No | No | Yes |
| Audit logs | No | No | Yes |

Free plan positioning, verbatim: *"For evaluation or small-scale deployments.
Start building for free, no credit card required."* Free also lists *"Unlimited
stored profiles"*, *"Unlimited workflows"*, *"Unlimited broadcasts"*,
*"Unlimited in-app guides"*, *"Unlimited delivery channels"* and *"Built-in
multi-tenancy"*.

**What counts as a message.** *"A single message delivered to a single user on a
single channel. Messages that bounce or fail to send are not included."*
(pricing tooltip) and, in the FAQ, *"if you trigger a messaging workflow that
results in a user receiving an in-app message and an email, that counts as two
messages sent."* The docs agree: *"A message is counted each time a notification
is successfully delivered to a single user on a single channel. A workflow that
notifies a user by both email and in-app results in two messages."* So an in-app
feed item costs exactly as much as an email.

**Development usage counts.** *"Regardless of plan, usage may be accrued in any
Knock environment."* Knock's own suggested mitigations are sandbox mode (not
available for in-app) and channel conditions (*"Any message that satisfies a
channel condition may contribute to usage"*).

**Retention, split two ways**
([data retention](https://docs.knock.app/manage-your-account/data-retention)):
message logs, audit logs, workflow-run logs, webhook delivery logs and source
event logs are **30 days** on all non-Enterprise plans (90 on Enterprise); API
logs are 30 days universally. But *"**In-app feed notifications are available
indefinitely.** Even after your message log data has expired, you can still fetch
the associated `FeedItem` data from the Show feed endpoint … You can also still
use the message status update endpoints to update the status of these feed
items."* So the inbox survives; the debugger does not.

**At the ceiling: nothing breaks.** *"We don't hard cap your messages … If you go
over your limit, we'll get in touch with you about making sure you have a billing
method in place next month."* **Not documented:** any per-unit overage rate for
the Free plan, any warning threshold, any grace period.

**Rate limits are not plan-based.** *"Knock uses a tier system to determine the
rate limit scale for each endpoint"* — five per-endpoint tiers from 1 to 1,000
requests/second, scoped by credential and environment; the page never mentions
plans ([rate limits](https://docs.knock.app/api-reference/overview/rate-limits)).
The feed endpoint is *"Rate limit tier: 2"* and *"This endpoint's rate limit is
always scoped per-user and per-environment. This is true even for requests made
without a signed user token."*
([list feed items](https://docs.knock.app/api-reference/users/feeds/list_items)).
**Not documented:** which tier number maps to which rate — the published table's
label column is empty in both the rendered HTML and the `.md`.

**Environments.** *"Your Knock account starts with a single environment:
production. Enabling environments adds a development environment where you can
build and test changes before you promote them to production."* After that you
can add more and get branches. *"You can't turn environments off after you enable
them."* Each environment has its own API keys and its own isolated users
([environments](https://docs.knock.app/version-control/environments)). Knock
suggests exactly this as the place to keep enhanced security mode off: *"If you
want a separate place to build and test with it turned off, you can enable
environments and keep enhanced security mode off in your development
environment."*

---

## 11. Local dev, tests, and a fresh clone with no API keys

**This is the section the decision should turn on, and the answer is mostly "no".**

### Is there a local, mock, offline or sandbox mode?

**Sandbox mode exists and explicitly excludes in-app.**

> *"Sandbox mode enables you to generate and preview messages for a given channel
> without delivering them. When sandbox is enabled, Knock will never send the
> request to your downstream provider, blocking all delivery. … Sandbox mode is
> supported across all channel types (except for in-app)"*
> — [integrations overview](https://docs.knock.app/integrations/overview#sandbox-mode)

> *"**How can I sandbox in-app feed messages?** The in-app channel doesn't support
> sandbox mode. Knock manages in-app delivery, so there's no downstream provider
> handoff to suppress. Use channel conditions to manage when messages are created
> for in-app steps in your non-production environments."*
> — [knock-plans FAQ](https://docs.knock.app/manage-your-account/knock-plans#faq-sandbox-in-app-feed-messages)

`settings.sandbox_mode` on the trigger call is the same mechanism:
*"Messages are generated but not delivered to the underlying providers."*
For in-app, Knock *is* the provider, so there is nothing to suppress — the feed
item is created and billed either way.

**The Knock CLI is not a local Knock.** It authenticates against your account
with a service token and pushes/pulls *content resources* (workflows, layouts,
templates, partials, translations) as files
([CLI overview](https://docs.knock.app/cli/overview)). `knock workflow run`
generates a real workflow run against a real environment. There is no
`knock serve`, no emulator, no local API. **Not documented:** any self-hosted,
emulated or offline Knock.

**Branches** isolate *content changes* per developer, not data, and still require
the hosted service
([environments](https://docs.knock.app/version-control/environments#enable-environments)).

So the closest thing to our `.outbox/` is: *a separate hosted environment, with
channel conditions, whose messages still count against the quota.*

### Can the React feed component render anything without a network?

Partly, and only as a loading/empty shell.

- `KnockProvider` has an explicit idle mode: *"When `false`, children still
  render but the Knock client stays idle: no identify call, no API requests, and
  no websocket."*
  ([KnockProvider](https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider)).
  So a Cadence build with no `KNOCK_PUBLIC_API_KEY` can mount the tree with
  `enabled={false}` and not explode.
- `NotificationFeed` fetches in an effect —
  `useEffect(() => { feedClient.fetch({ status }); }, [feedClient, status])` —
  renders a spinner while `networkStatus === NetworkStatus.loading`, then
  `EmptyComponent` (`<EmptyFeed />`, an `h2`/`p` pair of translation strings)
  when `!requestInFlight && noItems`
  ([NotificationFeed.tsx](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx),
  [EmptyFeed.tsx](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/EmptyFeed/EmptyFeed.tsx)).
- **An unauthenticated client makes no requests at all.** Every network path in
  the client is gated on `isAuthenticated()`, which is just
  `!!this.userId` (or `!!(userId && userToken)` in enhanced security mode) —
  `Feed.fetch()` logs *"[Feed] User is not authenticated, skipping fetch"*,
  `listenForUpdates()` logs *"skipping listening for updates"*, and
  `useFeedSettings` returns early with the comment
  `// Skip the branding fetch when there's no authenticated user`
  ([feed.ts](https://github.com/knocklabs/javascript/blob/a0237b90f7e68d03118552430561c6c9e2ef08e7/packages/client/src/clients/feed/feed.ts#L550-L553),
  [useFeedSettings.ts](https://github.com/knocklabs/javascript/blob/a0237b90f7e68d03118552430561c6c9e2ef08e7/packages/react-core/src/modules/feed/hooks/useFeedSettings.ts#L23-L29)).
  Knock's own component playground leans on exactly this:
  `<KnockProvider apiKey={""} userId={""}><KnockFeedProvider feedId={""}>`
  ([App.tsx](https://github.com/knocklabs/javascript/blob/a0237b90f7e68d03118552430561c6c9e2ef08e7/packages/react/src/App.tsx#L7-L8),
  run with `yarn dev:local`). So "no keys" is a silent, safe state — it just has
  nothing in it.
- **Nothing throws on a bad key or a dead network.** `KnockProvider`
  unconditionally returns its subtree with no error path; `authenticate()`'s
  inline identify is `.catch()`-wrapped and `Feed.fetch()` sets
  `NetworkStatus.error` on the store rather than throwing. The only render-time
  throw is the `sk_` secret-key guard (§5). (`useKnockClient` /
  `useKnockFeed` throw on misuse — *"must be used within a KnockProvider"* — but
  that is a wiring error, not a runtime one.)
- But `KnockFeedProvider` requires a real `feedId`, and the components take their
  items only from the feed client's store. **There is no published way to seed
  that store with fixtures.** A no-keys clone gets an empty bell and an empty
  feed — not a believable inbox.

### There *is* a `createMockKnock`, and you cannot import it

Knock's own repo contains a mock harness —
[`packages/client/test/test-utils/mocks.ts`](https://github.com/knocklabs/javascript/blob/a0237b90f7e68d03118552430561c6c9e2ef08e7/packages/client/test/test-utils/mocks.ts),
~288 lines, exporting `createMockKnock`, `createMockApiClient`,
`mockNetworkSuccess`, `mockNetworkError`, `mockNetworkFailure`,
`createMockFeed`, `createMockFeedItem`, `createMockFeedMetadata`,
`createWebSocketMock` and `createBroadcastChannelMock`. It is `vitest`-coupled
(`import { vi } from "vitest"`) and works by spying on `knock.client()`:

```ts
export const createMockKnock = (apiKey = "pk_test_12345") => {
  const knock = new Knock(apiKey);
  const mockApiClient = createMockApiClient();
  vi.spyOn(knock, "client").mockReturnValue(/* … */);
  vi.spyOn(knock, "log").mockImplementation(() => {});
  return { knock, mockApiClient };
};
```

**It is not published.** `@knocklabs/react` ships only
`["dist", "README.md"]`; `@knocklabs/react-core` ships `dist` + `src`;
`@knocklabs/client` ships `dist` + `src` + a `test/` folder that contains
**only `README.md`** (swept in by npm's README glob), and its `exports` map
exposes nothing but `.` and `./package.json`. So there is no import path to it,
deep or otherwise — using it means **copying the file into our repo** and keeping
it in step with Knock's internals by hand.

Combined with the documented `host` prop on `KnockProvider` (§5), this is the
raw material for a dev/test mode — but it is raw material we would own and
maintain, not a supported feature.

**Not documented** (established from source, not prose): all of the above.
Knock's published docs say nothing about what happens with a missing or invalid
`apiKey`, nothing about `isAuthenticated` gating, and nothing about mocks.

### Is there a documented testing approach?

For **workflows**, yes, and it is entirely hosted
([testing workflows](https://docs.knock.app/send-notifications/testing-workflows)):
a dashboard test runner (*"Run a test"*, with recipient/actor/tenant/data,
sandbox and skip-delay settings, and single-step runs), the
[workflow debugger](https://docs.knock.app/send-notifications/debugging-workflows),
[API logs](https://docs.knock.app/developer-tools/api-logs), and
`knock workflow run` from the CLI. All of it requires credentials and a network.
Note also that *"The workflow test runner uses the last saved version of the
workflow, not the last committed version"*, whereas API triggers *"always use the
last committed version"* — so a test run and a real trigger can disagree.

**How Knock tests its own components** (not documented anywhere, read from the
repo) is instructive, because it is the closest thing to a sanctioned approach:
vitest 4 + jsdom + `@testing-library/react`, no MSW, no nock. Two strategies —
`react-core` tests `vi.mock("@knocklabs/client")` and inject `createMockKnock`;
`packages/react` component tests use the **real** providers with fake
credentials and **no network stub at all**, which stays quiet only because they
pass a string `userId` (§5). Notably, there is **no `NotificationFeed.test.tsx`
unit test** — the only test of the feed component itself is an integration smoke
test against the live API with credentials from Knock's 1Password vault
([integration/tests/react/feed/NotificationFeed.test.tsx](https://github.com/knocklabs/javascript/blob/a0237b90f7e68d03118552430561c6c9e2ef08e7/integration/tests/react/feed/NotificationFeed.test.tsx)),
whose entire body is `it("should render", () => { render(<Feed />); })`.

For the **React components**, in the published docs, nothing. The docs site has exactly five pages
matching "test" or "debug" in its sitemap
([sitemap.xml](https://docs.knock.app/sitemap.xml)) —
`send-notifications/testing-workflows`, `send-notifications/debugging-workflows`,
`template-editor/testing-and-debugging`, `in-app-ui/guides/debugging-guides`,
`integrations/email/knock-test` — and **none** is about testing an application
that embeds the feed. There is no documented mock provider, no test-utils
entrypoint, no MSW handler set, and no guidance on Vitest or Testing Library.

### Verdict against the `mailer.server.ts` bar

`app/lib/mailer.server.ts` writes JSON to `.outbox/` when `POSTMARK_API_TOKEN` is
unset, so a fresh clone runs and tests assert on files. Knock has **no
equivalent**, and — unlike email — the in-app feed's *read* path is also remote:
the component cannot render seeded notifications out of our SQLite, because its
items come from Knock.

Matching the bar therefore requires us to build it. Three shapes, in increasing
cost:

1. **Trigger-side fallback only** (the direct analogue): a `notifier.server.ts`
   that writes `.outbox/`-style JSON instead of calling `workflows.trigger` when
   `KNOCK_SECRET_API_KEY` is absent. Cheap, and it makes the *send* side
   testable — but the inbox stays empty, so the feature still cannot be looked at
   or tested end-to-end without keys.
2. **A local feed adapter**: define our own feed-item type, read it either from
   Knock or from a seeded SQLite table behind one interface, and render it with
   our own shadcn components over a `useNotificationStore`-shaped value. The only
   shape that gives a believable seeded inbox with no keys — and it means using
   Knock headlessly, i.e. buying the infrastructure and not the UI. A cheaper
   variant for *tests only*: copy `createMockKnock` into the repo and/or point
   `KnockProvider`'s `host` at a local fake, accepting that both are
   unsupported and will drift.
3. **A shared hosted dev environment**: committed public key and channel id, one
   Knock development environment for everyone. Works, but a fresh clone now needs
   credentials, dev usage bills against the 10,000, and tests hit the network.
   Exactly what `mailer.server.ts` was written to avoid.

---

## 12. What Knock's docs do not say

Collected so a later reader does not re-search for them:

- **No mock/offline/emulator mode for the in-app channel.** Searched the docs
  sitemap and every feed and testing page; sandbox mode is the only candidate and
  it excludes in-app by design.
- **No testing guidance for the React SDK.** No published test-utils export, no
  fixture format, no Vitest/Testing-Library page. (A `createMockKnock` exists in
  the repo's `test/` folder; it is not published and not documented.)
- **No SSR statement of any kind.** The source is full of `typeof window`
  guards, but no README, doc page or test asserts SSR support.
- **No warning that the documented `user={{ id }}` prop causes a user upsert
  during server render**, nor any explanation of `identificationStrategy`
  beyond "defaults to `inline`".
- **No `className` / `asChild` on the feed components** — not a silence so much
  as an absence, but the docs never say the chrome is unstyleable.
- **No way to import or seed feed items.** Feed items are only produced by
  triggering a workflow or running a broadcast.
- **No React Router / Remix integration page.** The only SSR-aware quick start is
  Next.js (see §5).
- **No Tailwind guidance**, and nothing about CSS layers or specificity.
- **No free-plan overage rate**, warning threshold, or grace period.
- **No mapping from rate-limit tier numbers to rates** — the published table's
  label column is empty.
- **No role concept.** Role-scoped feeds must be modelled with categories,
  trigger data, tenants or extra channels.
- **No behaviour spec for a missing or invalid public API key** while the
  provider is enabled.

---

## 13. Implications for Cadence

Not a recommendation — the map owns that — but the constraints a design has to
absorb if Knock is chosen:

- **The dev/test story must be built by us.** Plan for a seam
  (`notifier.server.ts`) on the trigger side from day one, and decide
  consciously whether the inbox renders from Knock or from a local adapter. This
  is the single biggest cost Knock imposes on this codebase.
- **Budget the 10,000.** Seeding and development both consume it; there is no
  in-app sandbox.
- **Expect "Powered by Knock"** in the pre-built feed on the free plan, or go
  headless.
- **Notification copy leaves the repo** and lives in Knock's template editor
  (workflows can be pulled as files via the CLI; rendered content cannot).
- **Read state lives in Knock**, so every mark-as-read is a network write, and
  optimistic/offline behaviour is the SDK's rather than ours.
- **Pass a string `userId`, not a `user` object**, or set
  `identificationStrategy="skip"` — otherwise every SSR render issues a
  `PUT /v1/users/:id` from the server (§5). Identify Cadence users from the
  server-side notifier instead, where it belongs.
- **The feed cannot be server-loaded.** No `initialItems`, no store hydration,
  so a React Router `loader` cannot prefill the inbox and the first paint is
  always the empty state. An unread badge in the sidebar on first render would
  have to come from our own data, not from Knock.
- **Naming collision**: `sonner`'s `<Toaster>` already owns "in-app
  notification" in `app/routes/layout.app.tsx`, and Knock additionally overloads
  "in-app" to cover feeds *and* guides (banners/modals/cards). The glossary will
  need to disambiguate.
- **Roles need a mapping decision**: workflow categories (which double as the
  preference-opt-out unit) are the most idiomatic; tenants fit Team Admin and
  teams; trigger-data filtering is the weakest (AND-only, exact-match,
  top-level-keys-only).
