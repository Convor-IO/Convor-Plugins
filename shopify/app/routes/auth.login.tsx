import type {ActionFunctionArgs, LoaderFunctionArgs} from "@remix-run/node";
import {Form, useActionData, useLoaderData} from "@remix-run/react";
import {
  Button,
  Card,
  FormLayout,
  Page,
  AppProvider as PolarisAppProvider,
  Text,
  TextField,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import {useState} from "react";

import {login} from "../shopify.server";

// Convert the shopify-app-remix login errors into a friendly { shop } string
// for the TextField error prop.
function loginErrorMessage(
  errors: Record<string, string> | {shop?: string} | undefined
): {shop?: string} {
  if (!errors) return {};
  // shopify-app-remix returns { shop: "..." } on a missing/invalid shop.
  if ("shop" in errors && typeof errors.shop === "string") {
    return {shop: errors.shop};
  }
  // Fallback: join any string values.
  const values = Object.values(errors).filter(
    (v): v is string => typeof v === "string"
  );
  return values.length ? {shop: values.join(" ")} : {};
}

export const loader = async ({request}: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return {errors, polarisTranslations};
};

export const action = async ({request}: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return {errors};
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const errors = actionData?.errors ?? loaderData.errors;

  return (
    <PolarisAppProvider i18n={loaderData.polarisTranslations}>
      <Page>
        <Card>
          <Form method="post">
            <FormLayout>
              <Text variant="headingMd" as="h2">
                Log in to Convor
              </Text>
              <Text variant="bodyMd" as="p">
                Enter your Shopify store domain to install Convor and configure
                your live-chat widget.
              </Text>
              <TextField
                type="text"
                name="shop"
                label="Shop domain"
                helpText="example.myshopify.com"
                value={shop}
                onChange={setShop}
                autoComplete="on"
                error={errors.shop}
              />
              <Button submit>Log in</Button>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
