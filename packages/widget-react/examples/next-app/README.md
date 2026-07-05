# Convor + Next.js example

Minimal Next.js (App Router) app showing how to mount the Convor widget.

The widget is mounted once in `app/layout.tsx` so it appears on every route:

```tsx
import { ConvorWidget } from "@convor/widget-react";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ConvorWidget slug="demo" primaryColor="#3b82f6" position="bottom-right" />
      </body>
    </html>
  );
}
```

Any child component can trigger the chat via `useConvor()`:

```tsx
import { useConvor } from "@convor/widget-react";

export function SupportButton() {
  const convor = useConvor();
  return <button onClick={() => convor?.openChat()}>Chat with us</button>;
}
```

These are the relevant files only — not a full installable app. To run it inside
the monorepo, copy these into a Next.js scaffold or wire it into your own app.
