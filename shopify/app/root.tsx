import {json, type LinksFunction} from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
} from "@remix-run/react";
import {
  Button,
  Card,
  Frame,
  Page,
  AppProvider as PolarisAppProvider,
  Layout as PolarisLayout,
  Text,
} from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import {AppProvider as ShopifyAppProvider} from "@shopify/shopify-app-remix/react";

export const links: LinksFunction = () => [
  {rel: "stylesheet", href: polarisStyles},
];

export const loader = async () =>
  json({
    apiKey: process.env.SHOPIFY_API_KEY ?? "",
  });

// Frame CSP: Shopify requires us to frame-ancestors the admin so the embedded
// app renders inside the Shopify admin iframe. The Remix server sets the real
// headers via addDocumentResponseHeaders (shopify.server.ts); this is the
// client-side entry that mounts Polaris + App Bridge outlet tree.
export function Layout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  // NOTE: we intentionally do NOT wrap Outlet in <Frame> here. Each route
  // renders its own <Page> (Polaris), and the App Bridge <TitleBar> /
  // ResourcePicker etc. are pulled in per-route via @shopify/app-bridge-react.
  // The AppProvider i18n is all that's needed at the root.
  const {apiKey} = useLoaderData<typeof loader>();

  return (
    <ShopifyAppProvider apiKey={apiKey} i18n={polarisTranslations}>
      <Outlet />
    </ShopifyAppProvider>
  );
}

// Shopify-friendly error boundary rendered when a route throws.
export function ErrorBoundary() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : "Unexpected error";

  return (
    <PolarisAppProvider i18n={polarisTranslations}>
      <Frame>
        <Page>
          <PolarisLayout>
            <PolarisLayout.Section>
              <Card>
                <Text variant="headingMd" as="h2">
                  Something went wrong
                </Text>
                <Text variant="bodyMd" as="p" tone="critical">
                  {message}
                </Text>
                <Button url="/app" variant="primary">
                  Back to Convor settings
                </Button>
              </Card>
            </PolarisLayout.Section>
          </PolarisLayout>
        </Page>
      </Frame>
    </PolarisAppProvider>
  );
}
