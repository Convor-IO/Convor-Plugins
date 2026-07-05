import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authenticate so the embedded app installs / refreshes the session, then
  // land the merchant on the only screen that matters: settings.
  await authenticate.admin(request);
  const url = new URL(request.url);
  return redirect(`/app/settings${url.search}`);
};

export default function AppIndex() {
  // This component never renders — the loader always redirects. Keeping a
  // default export so Remix treats this as a layout-leaf route.
  return null;
}
