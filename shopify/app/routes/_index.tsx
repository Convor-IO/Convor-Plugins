import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Shopify opens the app with ?shop=... — preserve it through the redirect.
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // No shop param: send into the embedded app, which will bounce to /auth/login.
  return redirect("/app");
};
