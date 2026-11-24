// Print the actual localized website guides for the Marketplace review package.
// Local QA only; never fetch or mutate a production service.
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const base = new URL(process.env.CONVOR_GUIDE_URL ?? "http://localhost:18219");
if (!["localhost", "127.0.0.1"].includes(base.hostname))
  throw new Error("Use the local website preview");
const marketplace = process.env.CONVOR_MARKETPLACE_PDF === "1";
const destination = resolve(
  marketplace
    ? "dist/prestashop-marketplace/seller-guides"
    : "dist/prestashop-marketplace",
);
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const locale of ["en", "pl"]) {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 1200 },
      locale: locale === "pl" ? "pl-PL" : "en-US",
      colorScheme: "light",
    });
    await page
      .context()
      .route("**/*", (route) =>
        new URL(route.request().url()).origin === base.origin
          ? route.continue()
          : route.abort(),
      );
    const response = await page.goto(
      new URL(`/${locale}/docs/integrations/prestashop-integration`, base).href,
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );
    if (response?.status() !== 200)
      throw new Error("Guide could not be loaded");
    const article = page.locator("article#nd-page");
    await article.waitFor();
    const title = await article.locator("h1").innerText();
    if (locale === "pl" && !title.includes("Czat na żywo"))
      throw new Error("Polish guide missing");
    const screenshots = article.locator('img[src*="prestashop"]');
    if ((await screenshots.count()) !== 8)
      throw new Error("Guide missing screenshots");
    for (const img of await screenshots.all()) {
      await img.scrollIntoViewIfNeeded();
      await img.evaluate((el) => el.decode());
    }
    await page.evaluate(
      ({ marketplace, locale }) => {
        const article = document.querySelector("article#nd-page");
        if (!article) throw new Error("Article missing");
        // Print the real article, not navigation, feedback or unrelated CTAs.
        const print = article.cloneNode(true);
        const prose = print.querySelector(".prose");
        if (!prose) throw new Error("Guide body missing");
        // Retain the MDX body and its final removal paragraph. The next
        // elements are website-only signup, feedback and prev/next controls.
        const lastParagraph = [...prose.children]
          .filter((el) => el.tagName === "P")
          .at(-1);
        if (!lastParagraph) throw new Error("Guide text missing");
        while (lastParagraph.nextElementSibling)
          lastParagraph.nextElementSibling.remove();
        while (prose.nextElementSibling) prose.nextElementSibling.remove();
        // Zoomable screenshots are button children in the web guide.
        // Retain the actual images when discarding interactive UI.
        for (const button of print.querySelectorAll("button")) {
          const image = button.querySelector("img");
          if (image) button.replaceWith(image);
        }
        print
          .querySelectorAll("nav,button, [data-analytics-intent=signup]")
          .forEach((el) => {
            el.remove();
          });
        for (const link of print.querySelectorAll("a[href]")) {
          const url = new URL(link.href, location.href);
          if (marketplace) {
            // Seller guide: no off-platform promotional/download/support links.
            if (url.pathname === "/downloads/prestashop/convor.zip") {
              const item = link.closest("li");
              if (!item) throw new Error("Download instruction missing");
              item.textContent =
                locale === "pl"
                  ? "Pobierz archiwum ZIP z PrestaShop Marketplace. Nie rozpakowuj go przed przesłaniem."
                  : "Download the module ZIP from PrestaShop Marketplace. Do not unpack it before uploading.";
            } else {
              link.replaceWith(document.createTextNode(link.textContent ?? ""));
            }
          } else if (url.origin === location.origin) {
            link.href = "https://convor.io" + url.pathname + url.hash;
          }
        }
        document.body.replaceChildren(print);
        document.documentElement.classList.remove("dark");
      },
      { marketplace, locale },
    );
    await page.addStyleTag({
      content: `
      @page { size: A4; margin: 15mm 16mm 18mm; }
      html, body { background: white !important; color: #15233a !important; overflow: visible !important; height:auto !important; }
      article#nd-page { display:block !important; padding:0 !important; margin:0 !important; max-width:100% !important; width:100% !important; font-size:11pt; line-height:1.5; }
      article h1 { font-size:25pt; margin-bottom:8pt; }
      article h2 { font-size:16pt; margin-top:15pt; break-after:avoid; }
      article h3 { font-size:12pt; break-after:avoid; }
      article img { max-width:100% !important; max-height:135mm !important; height:auto !important; object-fit:contain; }
      article figure, article pre { break-inside:avoid; }
      article pre { white-space:pre-wrap; overflow-wrap:anywhere; font-size:9pt; }
      article a { color:#4155a0 !important; text-decoration:underline; }
      article p, article li { orphans:3; widows:3; }
      article [class*="sticky"] { position:static !important; }
    `,
    });
    await page.evaluate(async () => {
      for (const image of document.querySelectorAll("article img")) {
        image.loading = "eager";
        await image.decode();
      }
      await document.fonts.ready;
    });
    await page.pdf({
      path: join(
        destination,
        marketplace
          ? `readme_${locale}.pdf`
          : `convor-prestashop-guide-${locale}.pdf`,
      ),
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="font-size:9px;color:#64748b;width:100%;padding:0 16mm;text-align:right">Convor &nbsp; · &nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    console.log("Exported actual guide", locale);
    await page.close();
  }
} finally {
  await browser.close();
}
