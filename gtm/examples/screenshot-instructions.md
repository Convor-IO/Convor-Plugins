# Convor Widget in GTM — UI walkthrough

A step-by-step textual walkthrough of every Google Tag Manager screen you'll
touch to install the Convor widget template and go live. If you can't (or don't
want to) watch a video, follow this top to bottom.

> This document describes the GTM web UI as of 2026. Button labels occasionally
> change between GTM releases; the locations stay the same.

---

## Part A — Import the template

You only do this **once per container**.

### A1. Download the template file

1. In this repo, open [`gtm/template.tpl`](../template.tpl).
2. Click **Raw** (or **Download**), and save the file as `template.tpl` somewhere
   you can find it. Keep the `.tpl` extension.

### A2. Open Templates

1. Sign in at [tagmanager.google.com](https://tagmanager.google.com/).
2. Open the container you want to add Convor to.
3. In the left-hand navigation, click **Templates** (a jigsaw-puzzle icon,
   grouped under *Workspace*).

   The screen has two panels: **Tag Templates** (top) and **Variable Templates**
   (bottom). You want the top one.

### A3. Create a new template and import

1. In the **Tag Templates** panel, click the **New** button (top-right of that
   panel).
2. The **Template Editor** opens. It has three tabs on the left:
   *Fields*, *Code*, *Permissions*.
3. In the top-right toolbar, click the **⋮ (More actions)** button.
4. Click **Import**.
5. In the file dialog, pick the `template.tpl` you downloaded in A1.
6. The editor reloads showing the Convor fields (Organization slug, Widget
   script base URL, Appearance overrides) and the *Convor Widget* title.
7. Click **Save** (top-right).
8. Click **Close** (top-left ← arrow, or the editor's Close button).

You're back on the Templates list. **Convor Widget** now appears under *Tag
Templates*. The template is installed — you won't need to repeat Part A.

---

## Part B — Create a tag

You do this once to actually place Convor on the site.

### B1. Start a new tag

1. In the left navigation, click **Tags**.
2. Click **New** (top-right of the Tags list).

   A new tag card appears with two boxes to fill: **Tag Configuration** and
   **Triggering**.

### B2. Pick the Convor Widget tag type

1. Click anywhere in the **Tag Configuration** box.
2. The *Choose tag type* panel slides in from the right.
3. Scroll to the **Custom** section. You'll see **Convor Widget**.
4. Click **Convor Widget**.

   The tag configuration now shows the Convor fields.

### B3. Fill in the fields

1. **Organization slug** *(required)* — type your Convor org slug, e.g.
   `acme-store`. This is the public slug from the Convor dashboard
   (**Settings → Widget**). Lowercase letters, numbers, and dashes.
2. **Widget script base URL** — leave this **blank** for the production default
   (`https://cdn.convor.io`). Only fill it in if Convor Support gave you a
   different CDN host.
3. **Appearance overrides** (a collapsed *Zippy* section — click the header to
   expand). All three fields are **optional** and blank by default, meaning
   "use whatever's set in the Convor dashboard":
   - **Primary color** — hex color like `#4366f5`.
   - **Position** — *Bottom right* / *Bottom left* / *Use dashboard default*.
   - **Theme** — *Light* / *Dark* / *Auto (follow OS)* / *Use dashboard default*.

   Leave them blank unless you specifically want this tag to override the
   dashboard.

### B4. Choose a trigger

1. Click anywhere in the **Triggering** box.
2. The *Choose a trigger* panel slides in.
3. Pick **All Pages** (the first option in most containers).

   This makes Convor load on every page. If you only want it on part of the
   site (e.g. a specific path), create a more specific trigger instead.

### B5. Name and save

1. Click **Save** (top-right).
2. Name the tag — e.g. **Convor Widget** — and confirm.
3. The tag appears in your Tags list with a *New* badge.

---

## Part C — Test in Preview mode

**Always do this before publishing.**

### C1. Enter Preview

1. Click **Preview** (top-right of the GTM window, next to Submit).
2. GTM opens **Tag Assistant** in a new tab and asks for your site URL.
3. Enter your site URL (e.g. `https://example.com`) and click **Connect**.
4. Tag Assistant opens your site in another tab with an overlay. The Tag
   Assistant tab lists every tag and whether it fired.

### C2. Confirm the tag fired

1. On the Tag Assistant tab, look at the **Tags Fired** section for the page
   load (the *Container Loaded* / *Page View* event).
2. Find **Convor Widget**. Its status should be **Tag Fired** (green).
3. Click the **Convor Widget** row to inspect: you should see the resolved
   `?key=<your-slug>` and that *gtmOnSuccess* ran.

### C3. Confirm the widget actually loaded

1. On your site tab, open the browser DevTools → **Network** tab.
2. Filter for `widget`. You should see a request to
   `https://cdn.convor.io/widget.js?key=<your-slug>` returning **200**.
3. The Convor chat bubble should be visible in the corner of the page.

If the bubble doesn't appear:

- Confirm the slug matches the dashboard (**Settings → Widget**).
- Check that your site's domain is in the widget's **Allowed domains** list in
  the Convor dashboard — the widget won't render on unlisted domains.
- Re-check that the trigger actually matched this page.

---

## Part D — Publish

1. Close the Tag Assistant tab(s).
2. Back in GTM, click **Submit** (top-right).
3. Optionally name the version (e.g. *Add Convor widget*) and add a note.
4. Click **Publish**.

GTM shows a success summary. The Convor widget is now live on every page that
matches your trigger.

---

## Updating later

- **Change the slug or appearance?** Edit the *Convor Widget* tag, save, and
  **Submit → Publish** again.
- **New template version?** Re-import `template.tpl` over the existing template
  in **Templates → Convor Widget → ⋮ → Import** (your existing tags keep their
  field values).
