# @convor/widget-sdk

Framework-agnostic TypeScript SDK for embedding the [Convor](https://convor.io)
live-chat widget.

```ts
import { initConvor } from "@convor/widget-sdk";

const convor = await initConvor({ slug: "my-org" });
convor.openChat();
convor.track("signup", { plan: "pro" });
```

## Install

```bash
npm install @convor/widget-sdk
# or
pnpm add @convor/widget-sdk
```

## API

### `initConvor(options): Promise<ConvorSDK>`

Injects the Convor embed script (`<apiBase>/widget.js`) into `document.head`,
waits for `window.ConvorWidget` to be ready, and resolves a typed handle.

```ts
export interface ConvorOptions {
  /** Required org slug (Settings → Widget). */
  slug: string;
  /** Base URL serving widget.js. Default "https://cdn.convor.io". */
  apiBase?: string;
  /** Primary color override, passed as data-primary-color. Server config wins. */
  primaryColor?: string;
  /** Position override, passed as data-position. Server config wins. */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "center";
  /** Theme override, passed as data-theme. Server config wins. */
  theme?: "light" | "dark" | "auto";
  /** Max ms to wait for window.ConvorWidget. Default 10000. */
  timeoutMs?: number;
}
```

#### Behavior

- **SSR-safe.** Throws a clear error if `window`/`document` are missing.
  Guard the call yourself when running on the server:
  ```ts
  if (typeof window !== "undefined") {
    await initConvor({ slug: "my-org" });
  }
  ```
- **Idempotent.** Calling `initConvor` twice reuses the existing embed script
  tag (matched by `src`) and resolves the cached handle.
- **Pass-through.** The methods on the returned handle (`identify`, `track`, …)
  forward to the visitor SDK global `window.Convor`. If that global isn't ready
  yet — or has been destroyed — they **no-op and log a warning in dev**.

### `ConvorSDK`

```ts
export interface ConvorSDK {
  destroy(): void;
  identify(attrs: Record<string, unknown>): void;
  track(event: string, props?: Record<string, unknown>): void;
  setAttributes(attrs: Record<string, unknown>): void;
  openChat(): void;
  closeChat(): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  off(event: string, cb: (...args: unknown[]) => void): void;
}
```

`destroy()` removes the injected script tag and calls `window.Convor.destroy()`
if present. Safe to call multiple times.

## License

MIT
