/**
 * Convor — Wix dashboard page (settings panel).
 *
 * This is the page a merchant sees when they open the Convor app from their
 * Wix dashboard. It lets them enter their Convor org slug and save it. The
 * save call goes to the backend web module (`../backend/settings.web.js`),
 * which embeds the widget loader via the Wix Embedded Scripts API.
 *
 * The panel is intentionally minimal — no color/position/greeting controls.
 * Those live server-side in the Convor dashboard and are fetched at runtime by
 * the widget, so duplicating them here would just create drift.
 */
import {
  Card,
  Cell,
  FormField,
  Input,
  Layout,
  Loader,
  Page,
  TextButton,
  Toast,
  WixDesignSystemProvider,
} from "@wix/design-system";
import {useEffect, useState} from "react";
import {
  clearSettings,
  getSettings,
  saveSettings,
} from "../backend/settings.web";

type Status = "loading" | "ready" | "saving" | "saved" | "error";

export default function Settings() {
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((res) => {
        setSlug(res?.slug ?? "");
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
        setToast("Couldn't load your current settings. Try again.");
      });
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    saveSettings({slug})
      .then(() => {
        setStatus("saved");
        setToast("Saved. Your chat bubble is now live.");
      })
      .catch((err: unknown) => {
        setStatus("ready");
        setToast(err instanceof Error ? err.message : "Save failed.");
      });
  }

  function handleClear() {
    setStatus("saving");
    clearSettings()
      .then(() => {
        setSlug("");
        setStatus("ready");
        setToast("Convor widget removed from your site.");
      })
      .catch(() => {
        setStatus("ready");
        setToast("Couldn't remove the widget. Try again.");
      });
  }

  return (
    <WixDesignSystemProvider>
      <Page>
        <Page.Header
          title="Convor Live Chat"
          subtitle="Connect your Convor org to embed the live-chat widget."
        />
        <Page.Content>
          {status === "loading" ? (
            <Layout>
              <Cell>
                <Loader />
              </Cell>
            </Layout>
          ) : (
            <Layout>
              <Cell span={8}>
                <Card>
                  <Card.Header
                    title="Convor org slug"
                    subtitle="Found in your Convor dashboard under Settings → Widget."
                  />
                  <Card.Content>
                    <form onSubmit={handleSave}>
                      <FormField label="Org slug" required>
                        <Input
                          value={slug}
                          onChange={(e) =>
                            setSlug(e.target.value.trim().toLowerCase())
                          }
                          placeholder="acme-store"
                          disabled={status === "saving"}
                          maxLength={64}
                        />
                      </FormField>
                      <div style={{marginTop: 18}}>
                        <TextButton
                          type="submit"
                          disabled={status === "saving"}
                        >
                          {status === "saving" ? "Saving…" : "Save"}
                        </TextButton>
                        {slug && (
                          <TextButton
                            type="button"
                            onClick={handleClear}
                            disabled={status === "saving"}
                            style={{marginLeft: 12}}
                          >
                            Remove from site
                          </TextButton>
                        )}
                      </div>
                    </form>
                  </Card.Content>
                </Card>
              </Cell>
              <Cell span={4}>
                <Card>
                  <Card.Header title="Where do I find my slug?" />
                  <Card.Content>
                    Sign in to your Convor dashboard and open
                    <strong> Settings → Widget</strong>. Copy the
                    <strong> Org slug</strong> value and paste it here. All
                    appearance (colors, position, greeting) is configured there
                    — not in Wix.
                  </Card.Content>
                </Card>
              </Cell>
            </Layout>
          )}
        </Page.Content>
        {toast && (
          <Toast key="settings-feedback" onDismiss={() => setToast(null)}>
            {toast}
          </Toast>
        )}
      </Page>
    </WixDesignSystemProvider>
  );
}
