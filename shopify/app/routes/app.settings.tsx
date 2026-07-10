import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useFetcher, useLoaderData } from "@remix-run/react";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Layout,
  Link,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useState } from "react";

import { authenticate } from "../shopify.server";

// ---------------------------------------------------------------------------
// Convor widget config — the single source of truth for the app.
// Stored as a shop metafield (namespace "convor", key "widget") so the Theme
// App Extension's app-embed block can read it back at render time.
// ---------------------------------------------------------------------------

export const CONVOR_METAFIELD_NAMESPACE = "convor";
export const CONVOR_METAFIELD_KEY = "widget";
const CONVOR_DASHBOARD_URL = "https://convor.io/dashboard";

// Default widget CDN. Overridable per-save in case a merchant is on a
// dedicated Convor region.
export const DEFAULT_API_BASE = "https://cdn.convor.io";

export type ConvorWidgetConfig = {
  slug: string;
  apiBase: string;
};

export function isConvorWidgetConfig(
  value: unknown,
): value is ConvorWidgetConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.slug === "string" && typeof v.apiBase === "string";
}

function parseConfig(raw: string | null | undefined): ConvorWidgetConfig {
  if (!raw) return { slug: "", apiBase: DEFAULT_API_BASE };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isConvorWidgetConfig(parsed)) return parsed;
  } catch {
    // fall through to default
  }
  return { slug: "", apiBase: DEFAULT_API_BASE };
}

// ---------------------------------------------------------------------------
// GraphQL — fetch existing config so the form is pre-filled.
// ---------------------------------------------------------------------------

const GET_WIDGET_METAFIELD = `#graphql
  query ConvorGetWidgetConfig {
    shop {
      metafield(namespace: "${CONVOR_METAFIELD_NAMESPACE}", key: "${CONVOR_METAFIELD_KEY}") {
        value
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(GET_WIDGET_METAFIELD);
  const body = (await response.json()) as {
    data?: {
      shop?: { metafield?: { value: string | null } | null } | null;
    };
    errors?: Array<{ message: string }>;
  };

  if (body.errors && body.errors.length > 0) {
    throw new Error(
      `Failed to load Convor settings: ${body.errors.map((e) => e.message).join(", ")}`,
    );
  }

  const config = parseConfig(body.data?.shop?.metafield?.value ?? null);

  return json({
    config,
    dashboardUrl: CONVOR_DASHBOARD_URL,
  });
};

// ---------------------------------------------------------------------------
// Action — save the slug via metafieldsSet.
// ---------------------------------------------------------------------------

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const slug = String(formData.get("slug") ?? "").trim();
  const apiBase =
    String(formData.get("apiBase") ?? "").trim() || DEFAULT_API_BASE;

  // Server-side validation. The slug becomes the data-key attribute on the
  // public widget script, so we guard against obviously bad input.
  if (!slug) {
    return json(
      { ok: false, error: "Please enter your Convor org slug.", slug, apiBase },
      { status: 400 },
    );
  }
  // Convor slugs are lowercase alphanumeric + dashes, e.g. "acme-store".
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) {
    return json(
      {
        ok: false,
        error:
          "Slug must be lowercase letters, numbers, and dashes (max 64 chars).",
        slug,
        apiBase,
      },
      { status: 400 },
    );
  }
  try {
    new URL(apiBase);
  } catch {
    return json(
      { ok: false, error: "API base must be a valid URL.", slug, apiBase },
      { status: 400 },
    );
  }

  const value = JSON.stringify({ slug, apiBase } satisfies ConvorWidgetConfig);

  // metafieldsSet requires the ownerId of the resource the metafield belongs
  // to. We're storing per-shop widget config, so we resolve the shop GID.
  const shopResponse = await admin.graphql(
    `#graphql
      query ConvorShopId {
        shop { id }
      }
    `,
  );
  const shopBody = (await shopResponse.json()) as {
    data?: { shop?: { id?: string } | null };
    errors?: Array<{ message: string }>;
  };
  if (shopBody.errors && shopBody.errors.length > 0) {
    return json(
      {
        ok: false,
        error: shopBody.errors.map((e) => e.message).join("; "),
        slug,
        apiBase,
      },
      { status: 502 },
    );
  }
  const ownerId = shopBody.data?.shop?.id;
  if (!ownerId) {
    return json(
      {
        ok: false,
        error: "Could not resolve the shop ID.",
        slug,
        apiBase,
      },
      { status: 502 },
    );
  }

  const response = await admin.graphql(
    `#graphql
      mutation ConvorSetWidgetConfig($metafieldsSetInput: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafieldsSetInput) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        metafieldsSetInput: [
          {
            namespace: CONVOR_METAFIELD_NAMESPACE,
            key: CONVOR_METAFIELD_KEY,
            type: "json",
            value,
            // Attach to the shop itself — the app-embed block reads it via
            // shop.metafields.convor.widget.
            ownerId,
          },
        ],
      },
    },
  );

  const body = (await response.json()) as {
    data?: {
      metafieldsSet?: {
        metafields: Array<{
          id: string;
          namespace: string;
          key: string;
          value: string;
        }>;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  // Top-level GraphQL transport errors (auth, rate limit, etc.).
  if (body.errors && body.errors.length > 0) {
    return json(
      {
        ok: false,
        error: body.errors.map((e) => e.message).join("; "),
        slug,
        apiBase,
      },
      { status: 502 },
    );
  }

  const userErrors = body.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    return json(
      {
        ok: false,
        error: userErrors.map((e) => e.message).join("; "),
        slug,
        apiBase,
      },
      { status: 422 },
    );
  }

  return json({ ok: true, slug, apiBase, error: null });
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const fetcher = useFetcher<typeof action>();
  const saveResult = fetcher.data ?? actionData;
  const shopify = useAppBridge();

  const [slug, setSlug] = useState(loaderData.config.slug);
  const [apiBase, setApiBase] = useState(loaderData.config.apiBase);

  const isSaving = fetcher.state !== "idle" && fetcher.formMethod === "POST";

  // Toast on successful save / error.
  useEffect(() => {
    if (!saveResult) return;
    if (saveResult.ok) {
      shopify.toast.show("Convor settings saved. Activate the app embed.", {
        duration: 4000,
      });
    } else if (saveResult.error) {
      shopify.toast.show(saveResult.error, {
        isError: true,
        duration: 5000,
      });
    }
  }, [saveResult, shopify]);

  return (
    <Page>
      <TitleBar title="Convor settings" />
      <Layout>
        <Layout.Section>
          <fetcher.Form method="post">
            <BlockStack gap="500">
              {saveResult && !saveResult.ok && saveResult.error ? (
                <Banner tone="critical">{saveResult.error}</Banner>
              ) : null}

              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h2">
                      Connect your Convor account
                    </Text>
                    <Text variant="bodyMd" as="p">
                      Enter the org slug from{" "}
                      <Link
                        url={loaderData.dashboardUrl}
                        target="_blank"
                        removeUnderline
                      >
                        your Convor dashboard
                      </Link>{" "}
                      (Settings → Widget). All appearance customization — color,
                      position, greeting — is managed there, so there&apos;s
                      nothing to duplicate here.
                    </Text>
                  </BlockStack>

                  <FormLayout>
                    <TextField
                      label="Convor org slug"
                      name="slug"
                      value={slug}
                      onChange={setSlug}
                      autoComplete="off"
                      helpText="Lowercase letters, numbers, and dashes. Example: acme-store"
                      placeholder="acme-store"
                    />
                    <TextField
                      label="Widget CDN base URL"
                      name="apiBase"
                      value={apiBase}
                      onChange={setApiBase}
                      autoComplete="off"
                      helpText={`Defaults to ${DEFAULT_API_BASE}. Only change this if Convor support told you to.`}
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              <InlineStack align="end">
                <Button submit variant="primary" loading={isSaving}>
                  Save settings
                </Button>
              </InlineStack>
            </BlockStack>
          </fetcher.Form>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                Activate the widget
              </Text>
              <Text variant="bodyMd" as="p">
                Saving stores your slug. The widget itself is injected by the{" "}
                <strong>Convor Widget</strong> app embed block — turn it on in
                your theme:
              </Text>
              <BlockStack gap="200">
                <Text variant="bodyMd" as="p">
                  1. Online Store → Themes → Customize
                </Text>
                <Text variant="bodyMd" as="p">
                  2. App embeds → toggle <strong>Convor</strong> on
                </Text>
                <Text variant="bodyMd" as="p">
                  3. Save
                </Text>
              </BlockStack>
              <Button
                url={loaderData.dashboardUrl}
                target="_blank"
                variant="plain"
              >
                Open Convor dashboard
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
