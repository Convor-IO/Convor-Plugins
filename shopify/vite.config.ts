import {vitePlugin as remix} from "@remix-run/dev";
import {installGlobals} from "@remix-run/node";
import {defineConfig, type UserConfig} from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals({nativeFetch: true});

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the
// remix server. The CLI will eventually stop passing in HOST, so we can remove
// this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  // Use Reflect.deleteProperty instead of the `delete` operator (biome:
  // noDelete). `process.env` is a real object, so this fully removes HOST.
  Reflect.deleteProperty(process.env, "HOST");
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

// `hmr` accepts an object; inferring from Vite here would pull in
// platform-specific types. The shape is stable across versions.
let hmrConfig:
  | {
      protocol: string;
      host: string;
      port: number;
      clientPort: number;
    }
  | false;

if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = false;
}

export default defineConfig({
  server: {
    allowedHosts: [host, "editor-vsnet-jill-house.trycloudflare.com"],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_lazyRouteDiscovery: true,
        v3_singleFetch: false,
        v3_routeConfig: false,
      },
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
}) satisfies UserConfig;
