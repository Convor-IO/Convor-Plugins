# @convor/widget-react

React wrapper for the [Convor](https://convor.io) live-chat widget.

```tsx
import { ConvorWidget } from "@convor/widget-react";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ConvorWidget slug="my-org" />
      </body>
    </html>
  );
}
```

## Install

```bash
npm install @convor/widget-react
# or
pnpm add @convor/widget-react
```

Peer deps: `react >= 18`, `react-dom >= 18`, `@convor/widget-sdk`.

## API

### `<ConvorWidget />`

```tsx
export interface ConvorWidgetProps {
  /** Required org slug (Settings → Widget). */
  slug: string;
  /** Base URL serving widget.js. Defaults to the Convor CDN. */
  apiBase?: string;
  /** Primary color override. Server config wins for unset fields. */
  primaryColor?: string;
  /** Position override. Server config wins for unset fields. */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "center";
  /** Theme override. Server config wins for unset fields. */
  theme?: "light" | "dark" | "auto";
  /** Max ms to wait for window.ConvorWidget. */
  timeoutMs?: number;
  /** Rendered into the host component; the widget itself injects an iframe. */
  children?: React.ReactNode;
}
```

#### Behavior

- Calls `initConvor(options)` in a `useEffect`, stores the SDK handle in a ref,
  and calls `destroy()` on unmount.
- **Stable.** It does not re-init on every render. Only a `slug` change triggers
  a teardown + re-init; appearance prop changes mid-mount are ignored with a dev
  warning, since appearance config is owned server-side.
- SSR-safe: the effect only runs in the browser, so mounting it in a Next.js
  `app/layout.tsx` is fine.

### `useConvor()`

```tsx
export function useConvor(): ConvorSDK | null;
```

Returns the current SDK handle (or `null` while initializing / after destroy)
from any child component. Uses `useSyncExternalStore`, so it stays in sync:

```tsx
import { useConvor } from "@convor/widget-react";

function SupportButton() {
  const convor = useConvor();
  return <button onClick={() => convor?.openChat()}>Chat with us</button>;
}
```

**Why a module-level handle instead of React context?** The widget is a
singleton — one embed script per page — so a provider adds boilerplate without
value. A module-level ref keeps the API tiny while staying reactive.

## Example

See [`examples/next-app/`](./examples/next-app) for a minimal Next.js (App
Router) integration.

## License

MIT
