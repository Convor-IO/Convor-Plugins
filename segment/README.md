# @convor/segment-bridge

Client-side bridge that forwards [Segment](https://segment.com) `analytics.js`
`identify()` / `track()` calls into the [Convor](https://convor.io) live-chat
widget's visitor SDK.

For sites already using Segment's `analytics.js` (or `@segment/analytics-next`),
this bridge lets you:

- Load the Convor widget as if it were a Segment destination.
- Pipe visitor identity and events from Segment into Convor — so your agents
  see who the visitor is and what they've done, without a separate tracking
  integration.

> **This is a client-side wrapper, not a Segment cloud destination.** Segment
> cloud destinations require a formal partnership and Segment platform setup.
> This bridge works immediately on any Segment-using site by hooking into the
> in-page `analytics.js` emitter.

## Install

```bash
npm install @convor/segment-bridge
# or
pnpm add @convor/segment-bridge
```

## Quick start (npm)

```ts
import { initConvorSegmentBridge } from "@convor/segment-bridge";

// After your Segment analytics.js snippet has been included on the page.
await initConvorSegmentBridge({ slug: "my-org" });

// Existing Segment calls now flow into Convor:
analytics.identify("user-123", { email: "sam@example.com", plan: "pro" });
analytics.track("checkout", { total: 42 });
```

The bridge resolves once both the Convor widget and Segment `analytics.js` are
ready and the forwarding listeners are attached. You don't have to `await` it —
the listeners attach as soon as both globals are available.

## Quick start (snippet, no build step)

Grab the self-contained `<script>` from [`snippet.html`](./snippet.html) and
paste it into your `<head>` **before** your Segment analytics.js snippet. Replace
`ORG_SLUG` with your Convor org slug. That's it — no npm install required.

## API

### `initConvorSegmentBridge(options): Promise<void>`

```ts
export interface ConvorSegmentBridgeOptions {
  /** Required org slug (Settings → Widget in the Convor dashboard). */
  slug: string;
  /** Base URL serving widget.js. Default "https://cdn.convor.io". */
  apiBase?: string;
  /** Forward analytics.identify() → window.Convor.identify(). Default true. */
  forwardIdentify?: boolean;
  /** Forward analytics.track() → window.Convor.track(). Default true. */
  forwardTrack?: boolean;
  /** Max ms to wait for window.Convor. Default 10000. */
  widgetTimeoutMs?: number;
  /** Max ms to wait for window.analytics. Default 15000. */
  analyticsTimeoutMs?: number;
}

export function initConvorSegmentBridge(
  options: ConvorSegmentBridgeOptions,
): Promise<void>;
```

#### Behavior

- **SSR-safe.** Rejects with a clear error if `window`/`document` are missing.
  Guard the call on the server:
  ```ts
  if (typeof window !== "undefined") {
    await initConvorSegmentBridge({ slug: "my-org" });
  }
  ```
- **Idempotent.** Calling it twice reuses the existing widget script tag and
  does not double-attach listeners.
- **Waits for late globals.** If Segment's `analytics.js` (or the Convor
  widget) hasn't loaded yet when the bridge initializes, it polls until both
  are available, then attaches — within the configured timeouts.

### `teardownConvorSegmentBridge(): void`

Detaches the Segment listeners installed by `initConvorSegmentBridge`. The
widget itself is left running; remove the widget separately if needed.

## How it bridges — the Segment hook

The Convor widget exposes a visitor SDK on `window.Convor` with `identify(attrs)`
and `track(event, props?)`. Segment's `analytics.js` global is a
`component-emitter`: every time you call `analytics.identify()` or
`analytics.track()`, it emits a matching event that any listener can observe.

The bridge subscribes via:

```ts
analytics.on("identify", (...args) => { /* → window.Convor.identify(...) */ });
analytics.on("track",    (...args) => { /* → window.Convor.track(...)     */ });
```

…then forwards each normalized payload into the Convor visitor SDK.

### Two Segment runtimes, one normalizer

Segment has two analytics.js implementations, and they emit **different
argument shapes** for the same events. The bridge normalizes both:

| Runtime | Emitted shape | Example |
|---|---|---|
| Classic `analytics.js` (the snippet) | raw method args | `emit("identify", userId, traits, options)` |
| `@segment/analytics-next` | single context object | `emit("identify", { type, event: { userId, traits } })` |

So `analytics.identify("user-123", { email: "a@b.com" })` reaches Convor as
`window.Convor.identify({ userId: "user-123", email: "a@b.com" })`, and
`analytics.track("signup", { plan: "pro" })` reaches it as
`window.Convor.track("signup", { plan: "pro" })` — regardless of which Segment
runtime the host site uses.

### Waiting for `analytics.js` to load

Segment's analytics.js loads asynchronously. Its snippet installs a stub
`window.analytics` with a `push`-based queue *before* the real library loads;
the real `.on()` appears once analytics.js initializes. The bridge polls for
`window.analytics` (with an `on` method) and attaches the moment it's ready,
so calls made after initialization are all forwarded. For the snippet form,
place the bridge **before** `analytics.load(...)` so even the earliest calls
are captured.

## License

MIT
