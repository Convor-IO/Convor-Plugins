import type { LoaderFunctionArgs } from "@remix-run/node";

import { authenticate } from "../../shopify.server";

// shopify-app-remix catch-all for the OAuth flow. Handles:
//   /auth                → kicks off the embedded-install / reauth handshake
//   /auth/callback       → exchanges the code for an access token
//   /auth/callback/inline → same, inline (no full-page redirect)
// authenticate.admin() drives all of these based on the path/params.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AuthCallback() {
  // Should never render — authenticate.admin redirects on success.
  return null;
}
