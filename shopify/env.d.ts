/// <reference types="@remix-run/node" />
/// <reference types="vite/client" />

interface ProcessEnv {
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  SCOPES: string;
  SHOP_CUSTOM_DOMAIN?: string;
}
