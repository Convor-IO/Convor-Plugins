import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, devices } from "@playwright/test";

const required = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};
const wp = required("WP_URL");
const api = required("CONVOR_API_URL");
const dashboard = required("CONVOR_DASHBOARD_URL");
for (const url of [wp, api, dashboard]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Only local fixtures are supported");
}
// Use the shared publication roster, never a separate set of invented names.
const peopleDir = path.resolve(required("CONVOR_PUBLICATION_PEOPLE_DIR"));
const { marketingPerson } = await import(
  pathToFileURL(path.join(peopleDir, "index.mjs")).href
);
const operatorPerson = marketingPerson("anna-kowalska");
const server =
  process.env.CONVOR_QA_SERVER_CONTAINER ??
  "convor-feat-wordpress-finalization-1806-dev-server-1";
if (server !== "convor-feat-wordpress-finalization-1806-dev-server-1")
  throw new Error("Dedicated WordPress publication server required");

// Run the canonical SaaS publication seed in the actual isolated server.
// The temporary copy is outside both Git checkouts and removed after use.
const applyPublicationRoster = () => {
  const tmp = execFileSync(
    "docker",
    ["exec", server, "mktemp", "-d", "/tmp/wordpress-publication.XXXXXXXX"],
    { encoding: "utf8" },
  ).trim();
  if (!/^\/tmp\/wordpress-publication\.[A-Za-z0-9]+$/.test(tmp))
    throw new Error("Unexpected temporary fixture directory");
  try {
    execFileSync("docker", [
      "exec",
      server,
      "mkdir",
      "-p",
      `${tmp}/tests/fixtures`,
    ]);
    execFileSync("docker", [
      "cp",
      peopleDir,
      `${server}:${tmp}/tests/fixtures/marketing-people`,
    ]);
    for (const directory of ["apps", "packages"])
      execFileSync("docker", [
        "exec",
        server,
        "ln",
        "-s",
        `/app/${directory}`,
        `${tmp}/${directory}`,
      ]);
    execFileSync(
      "docker",
      [
        "exec",
        "-w",
        "/app/apps/server",
        "-e",
        `OBJECT_STORAGE_PUBLIC_BASE_URL=${dashboard}/api/storage/local/public`,
        server,
        "/app/scripts/compose-pnpm.sh",
        "exec",
        "tsx",
        `${tmp}/tests/fixtures/marketing-people/apply.ts`,
        required("CONVOR_ORG_ID"),
        locale,
        required("CONVOR_PROJECT_ID"),
      ],
      { stdio: "inherit", timeout: 120_000 },
    );
  } finally {
    execFileSync("docker", ["exec", server, "rm", "-rf", "--", tmp]);
  }
};
const output = path.resolve(required("CONVOR_DOCS_SCREENSHOTS"));
const locale = process.env.DOCS_LOCALE === "pl" ? "pl" : "en";
const folder = path.join(output, locale);
await mkdir(folder, { recursive: true });
const container = process.env.WP_QA_CONTAINER ?? "convor-wordpress-1806-wp-1";
if (!/^convor-wordpress-[0-9]+-wp-1$/.test(container))
  throw new Error("Dedicated WordPress fixture required");
const wpEval = (code) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-e",
      "WP_QA_USER",
      "-e",
      "WP_QA_LOCALE",
      "-e",
      "WP_DOCS_KEY",
      container,
      "php",
      "-r",
      `require "/var/www/html/wp-load.php"; ${code}`,
    ],
    {
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        WP_QA_USER: required("WP_ADMIN_USER"),
        WP_QA_LOCALE: locale === "pl" ? "pl_PL" : "en_US",
      },
    },
  ).trim();
// A screenshot must not contain the complete widget key. Measure the actual
// visible key glyphs without touching the DOM; redact only those pixels before
// writing the PNG, preserving the installation example and surrounding UI.
async function captureInstallationCard(
  page,
  field,
  snippet,
  key,
  clip,
  destination,
) {
  const input = await field.evaluate((el) => {
    const style = getComputedStyle(el);
    const bounds = el.getBoundingClientRect();
    if (el.scrollLeft !== 0) throw new Error("Unexpected scrolled key field");
    const x =
      bounds.x +
      parseFloat(style.borderLeftWidth) +
      parseFloat(style.paddingLeft);
    const right = bounds.right - parseFloat(style.borderRightWidth) - 1;
    return {
      x,
      y: bounds.y + parseFloat(style.borderTopWidth) + 1,
      width: right - x,
      height:
        bounds.height -
        parseFloat(style.borderTopWidth) -
        parseFloat(style.borderBottomWidth) -
        2,
      size: parseFloat(style.fontSize),
      replacement: "convor_wpk_...",
    };
  });
  const code = await snippet.evaluate((el, key) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const regions = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const value = node.textContent;
      const start = value.indexOf(key);
      if (start < 0) continue;
      const range = document.createRange();
      if (value[start + key.length] !== '"')
        throw new Error("Unexpected embed key delimiter");
      range.setStart(node, start);
      range.setEnd(node, start + key.length + 1);
      const style = getComputedStyle(el);
      for (const rect of range.getClientRects()) {
        regions.push({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          size: parseFloat(style.fontSize),
          replacement: regions.length === 0 ? 'convor_wpk_..."' : "",
        });
      }
    }
    if (!regions.length)
      throw new Error("Cannot locate sensitive code text for redaction");
    return regions;
  }, key);
  if (!(input.width > 0)) throw new Error("Cannot locate sensitive input text");
  const png = await page.screenshot({ clip, animations: "disabled" });
  // Buffer stays in memory; never write an unredacted capture.
  execFileSync(
    "python3",
    [
      "-c",
      `
import io, json, math, subprocess, sys
from PIL import Image, ImageDraw, ImageFont
try:
    font_path=subprocess.check_output(["fc-match", "-f", "%{file}", "monospace"], text=True).strip()
except (OSError, subprocess.CalledProcessError):
    font_path=None
image=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB")
cfg=json.loads(sys.argv[1]); clip=cfg["clip"]; scale=image.width/clip["width"]
draw=ImageDraw.Draw(image)
for rect in cfg["regions"]:
    x=max(0, math.floor((rect["x"]-clip["x"])*scale)); y=max(0, math.floor((rect["y"]-clip["y"])*scale))
    r=min(image.width-1, math.ceil((rect["x"]+rect["width"]-clip["x"])*scale)); b=min(image.height-1, math.ceil((rect["y"]+rect["height"]-clip["y"])*scale))
    if r<=x or b<=y: continue
    bg=image.getpixel((min(image.width-1,x+1),max(0,y-1)))
    draw.rectangle((x,y,r,b),fill=bg)
    if rect["replacement"]:
        size=max(8,round(rect["size"]*scale))
        font=ImageFont.truetype(font_path,size) if font_path else ImageFont.load_default(size=size)
        color=(30,41,59) if sum(bg)>384 else (226,232,240)
        draw.text((x,(y+b)//2),rect["replacement"],font=font,fill=color,anchor="lm")
image.save(cfg["destination"],"PNG")
`,
      JSON.stringify({ clip, regions: [input, ...code], destination }),
    ],
    { input: png },
  );
}

const previousWooState = wpEval(
  'require_once ABSPATH."wp-admin/includes/plugin.php"; echo is_plugin_active("woocommerce/woocommerce.php") ? "active" : "inactive";',
);
const previousLocale = wpEval(
  '$u=get_user_by("login",getenv("WP_QA_USER")); if(!$u)exit(1); echo get_user_meta($u->ID,"locale",true);',
);
// Same normal-visitor profile as the existing loopback-only real QA harness.
const browser = await chromium.launch({
  args: ["--disable-blink-features=AutomationControlled"],
});
try {
  wpEval(
    '$u=get_user_by("login",getenv("WP_QA_USER")); update_user_meta($u->ID,"locale",getenv("WP_QA_LOCALE"));',
  );
  const page = await browser.newPage({
    ...devices["Desktop Chrome"],
    viewport: { width: 1360, height: 1080 },
    deviceScaleFactor: 3,
    timezoneId: "Europe/Warsaw",
    locale: locale === "pl" ? "pl-PL" : "en-US",
  });
  await page
    .context()
    .addCookies([
      { name: "convor_dashboard_lang", value: locale, url: dashboard },
    ]);
  const login = await page.request.post(`${api}/api/auth/sign-in/email`, {
    headers: { Origin: dashboard },
    data: {
      email: required("CONVOR_TEST_EMAIL"),
      password: required("CONVOR_TEST_PASSWORD"),
    },
  });
  if (!login.ok()) throw new Error("Convor fixture login failed");
  const headers = {
    Origin: dashboard,
    "X-Organization-Id": required("CONVOR_ORG_ID"),
    "X-Project-Id": required("CONVOR_PROJECT_ID"),
  };
  const detail = await page.request.get(
    `${api}/api/projects/${required("CONVOR_PROJECT_ID")}`,
    { headers },
  );
  if (!detail.ok()) throw new Error("Editorial project unavailable");
  const project = await detail.json();
  const liveKey = project.project.widgetPublicKey;
  if (
    project.project.name !== "Convor" ||
    !/^convor_wpk_[a-f0-9]{64}$/.test(liveKey)
  ) {
    throw new Error(
      "Use a fresh named editorial fixture (CONVOR_DOCS_FIXTURE=1)",
    );
  }
  if (
    !project.domains.some(
      (d) => d.isPrimary && d.hostname === new URL(wp).hostname,
    )
  ) {
    throw new Error("Configure the actual local primary domain before capture");
  }
  // Test ordinary WordPress without WooCommerce.
  wpEval(
    'require_once ABSPATH."wp-admin/includes/plugin.php"; deactivate_plugins("woocommerce/woocommerce.php");',
  );
  const projectId = required("CONVOR_PROJECT_ID");
  const assignmentPath = `${api}/api/projects/${projectId}/operator-assignments`;
  const roster = await page.request.get(assignmentPath, { headers });
  if (!roster.ok()) throw new Error(`Editorial roster: ${roster.status()}`);
  const { availableOperators } = await roster.json();
  const operator = availableOperators.find(
    (op) => op.userEmail === required("CONVOR_TEST_EMAIL"),
  );
  if (!operator || availableOperators.length !== 1)
    throw new Error("Expected a dedicated single-operator editorial tenant");
  const update = async (method, url, data) => {
    const orgScoped = /\/api\/(operators|presence)\//.test(
      new URL(url).pathname,
    );
    const requestHeaders = { ...headers };
    if (orgScoped) delete requestHeaders["X-Project-Id"];
    const response = await page.request.fetch(url, {
      method,
      headers: requestHeaders,
      data,
    });
    if (!response.ok())
      throw new Error(
        `Editorial configuration failed: ${new URL(url).pathname} HTTP ${response.status()}`,
      );
    return response.json();
  };
  await update("PATCH", `${api}/api/operators/${operator.operatorId}`, {
    displayName: operatorPerson.name,
    acceptingNewConversations: true,
    maxConcurrentChats: 20,
    timezone: "Europe/Warsaw",
  });
  const avatar = await page.request.put(`${api}/api/users/me/avatar`, {
    headers: {
      Origin: dashboard,
      "X-Organization-Id": required("CONVOR_ORG_ID"),
    },
    multipart: {
      file: {
        name: `${operatorPerson.id}.webp`,
        mimeType: "image/webp",
        buffer: await readFile(operatorPerson.avatarPath),
      },
    },
  });
  if (!avatar.ok())
    throw new Error(
      `Publication operator avatar upload failed: ${avatar.status()}`,
    );
  const { url: avatarUrl } = await avatar.json();
  if (!(await page.request.get(avatarUrl)).ok())
    throw new Error("Publication portrait not served");
  const schedule = {
    days: Object.fromEntries(
      [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ].map((day) => [day, { allDay: true, ranges: [] }]),
    ),
  };
  await update("PUT", `${api}/api/operators/${operator.operatorId}/schedule`, {
    schedule,
    timezone: "Europe/Warsaw",
  });
  await update("PUT", assignmentPath, {
    assignments: [
      {
        operatorId: operator.operatorId,
        active: true,
        acceptingNewConversations: true,
      },
    ],
  });
  await update("POST", `${api}/api/presence/online`, {
    userId: operator.userId,
  });
  const publicPresence = await page.request.get(
    `${api}/api/widget/presence?key=${encodeURIComponent(liveKey)}`,
    { headers: { Origin: new URL(wp).origin } },
  );
  if (!publicPresence.ok() || !(await publicPresence.json()).online)
    throw new Error(
      "The real widget presence endpoint must report an available operator",
    );
  console.log("PASS real online operator with active site assignment");
  process.env.WP_DOCS_KEY = liveKey;
  wpEval(
    'update_option("blogname","Convor"); update_option("blogdescription",""); update_option("WPLANG",getenv("WP_QA_LOCALE")==="pl_PL"?"pl_PL":""); $title=getenv("WP_QA_LOCALE")==="pl_PL"?"Kontakt":"Contact"; $content=getenv("WP_QA_LOCALE")==="pl_PL"?"Masz pytanie dotyczące Convor? Napisz do naszego zespołu.":"Questions about Convor? Send a message to our team."; $id=(int)get_option("convor_editorial_page"); $id=wp_insert_post(array("ID"=>$id,"post_title"=>$title,"post_content"=>$content,"post_type"=>"page","post_status"=>"publish","comment_status"=>"closed")); if(!$id||is_wp_error($id))exit(1); update_option("convor_editorial_page",$id); update_option("show_on_front","page"); update_option("page_on_front",$id); update_option("convor_settings",convor_settings_defaults());',
  );
  await page.goto(`${wp}/wp-login.php`);
  await page.locator("#user_login").fill(required("WP_ADMIN_USER"));
  await page.locator("#user_pass").fill(required("WP_ADMIN_PASSWORD"));
  await page.locator("#wp-submit").click();
  await page.goto(`${wp}/wp-admin/options-general.php?page=convor`);
  const key = page.locator("#convor_widget_key");
  await key.waitFor();
  // Genuine pre-connection settings, with WordPress's own empty-key example.
  // No DOM replacement or artificial site address.
  if (
    (await key.inputValue()) !== "" ||
    (await key.getAttribute("placeholder")) !== "convor_wpk_..."
  )
    throw new Error("Expected genuine pre-installation settings");
  await page.evaluate(() => document.fonts.ready);
  if (
    locale === "en" ||
    (await page.locator("body").innerText()).includes("Klucz widgetu witryny")
  ) {
    const settings = page.locator("#wpbody-content .wrap");
    // Crop below the actual site address rather than substituting another domain.
    const address = settings.locator("h1 + p");
    await settings.scrollIntoViewIfNeeded();
    const bounds = await settings.boundingBox();
    if (!bounds) throw new Error("WordPress settings not visible");
    const margin = 16;
    const toolbar = await page.locator("#wpadminbar").boundingBox();
    const addressBox = await address.boundingBox();
    if (!addressBox) throw new Error("Missing actual site address");
    const top = Math.max(
      addressBox.y + addressBox.height + 2,
      (toolbar?.y ?? 0) + (toolbar?.height ?? 0) + 2,
    );
    await page.screenshot({
      clip: {
        x: bounds.x - margin,
        y: top,
        width: bounds.width + margin * 2,
        height: bounds.y + bounds.height + margin - top,
      },
      path: path.join(folder, `${locale}-wordpress-settings.png`),
      animations: "disabled",
    });
  } else {
    throw new Error("Install the actual Polish language pack before capturing");
  }
  // Install the actual key only after the genuine pre-connection screen.
  wpEval(
    'update_option("convor_settings",array_replace(convor_settings_defaults(),array("widget_key"=>getenv("WP_DOCS_KEY"),"enabled"=>true)));',
  );
  delete process.env.WP_DOCS_KEY;
  // Capture a genuine chat exchange on the public WordPress site, followed
  // by its persisted conversation in the operator's actual dashboard.
  const visitor = await browser.newPage({
    ...devices["Desktop Chrome"],
    // The stock WordPress theme's footer ends above the bottom of this
    // viewport, leaving genuine blank page space around the fixed widget.
    viewport: { width: 2048, height: 1800 },
    deviceScaleFactor: 3,
    timezoneId: "Europe/Warsaw",
    locale: locale === "pl" ? "pl-PL" : "en-US",
  });
  try {
    const created = visitor
      .waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/conversations" &&
          response.status() === 201,
        { timeout: 45_000 },
      )
      .then((response) => response.json());
    await visitor.goto(wp);
    await visitor.locator(".convor-trigger").waitFor({ timeout: 30_000 });
    await visitor.evaluate(async (lang) => {
      await window.Convor.ready();
      await window.Convor.setLocale(lang);
      await window.Convor.ready();
    }, locale);
    await visitor.locator(".convor-trigger").click();
    const frame = visitor.frameLocator('iframe[src*="widget-iframe"]').first();
    const start = frame.locator('[data-welcome-action="start"]');
    const input = frame.locator(
      '.convor-chat > .convor-input [data-testid="widget-input-field"]',
    );
    await start
      .or(input)
      .filter({ visible: true })
      .first()
      .waitFor({ timeout: 30_000 });
    if (!(await input.isVisible()) && (await start.isVisible())) {
      try {
        await start.click({ timeout: 5_000 });
      } catch (error) {
        // Direct-entry may have opened the composer while the welcome
        // button was animating away. Require the actual composer below.
        if (!(await input.isVisible())) throw error;
      }
    }
    await input.waitFor({ timeout: 30_000 });
    await frame
      .locator(".convor-chat.convor-chat--ready")
      .waitFor({ timeout: 30_000 });
    // Assign the real conversation to the online operator before the first
    // message. The editorial scenario is a human conversation.
    const shell = await created;
    if (!shell.id) throw new Error("Widget conversation was not created");
    // Persist the actual fictional visitor and portrait before messages.
    applyPublicationRoster();
    const assigned = await update(
      "POST",
      `${api}/api/conversations/${shell.id}/assign`,
      { operatorId: operator.operatorId },
    );
    if (assigned.assignedOperatorId !== operator.operatorId)
      throw new Error("Conversation was not assigned");
    await frame
      .locator(".convor-team-away")
      .waitFor({ state: "hidden", timeout: 30_000 });
    const question =
      locale === "pl"
        ? "Czy mogę dodać czat do bloga na WordPressie?"
        : "Can I add live chat to my WordPress blog?";
    const answer =
      locale === "pl"
        ? "Oczywiście! Zainstaluj wtyczkę Convor Live Chat i połącz swoją stronę."
        : "Of course! Install Convor Live Chat and connect your website.";
    await input.fill(question);
    const [posted] = await Promise.all([
      visitor.waitForResponse((response) => {
        const parts = new URL(response.url()).pathname.split("/");
        return (
          response.request().method() === "POST" &&
          parts.length === 5 &&
          parts[1] === "api" &&
          parts[2] === "conversations" &&
          parts[4] === "messages"
        );
      }),
      frame.locator(".convor-chat > .convor-input .convor-input__send").click(),
    ]);
    if (posted.status() !== 201)
      throw new Error(`Visitor message failed: ${posted.status()}`);
    const id = new URL(posted.url()).pathname.split("/")[3];
    if (id !== shell.id)
      throw new Error("Visitor did not use the assigned conversation");
    const reply = await page.request.post(
      `${api}/api/conversations/${id}/messages`,
      {
        headers,
        data: { senderType: "operator", content: answer, type: "text" },
      },
    );
    if (reply.status() !== 201)
      throw new Error(`Operator reply failed: ${reply.status()}`);
    const replyMessage = await reply.json();
    await frame
      .locator(".convor-msg--operator .convor-msg__bubble")
      .filter({ hasText: answer })
      .waitFor({ timeout: 30_000 });
    await frame
      .locator(".convor-team-away")
      .waitFor({ state: "hidden", timeout: 30_000 });
    const chatText = await frame.locator(".convor-chat").innerText();
    if (/WooCommerce|127\.0\.0\.1|localhost|\bQA\b/.test(chatText))
      throw new Error("Unexpected editorial chat text");
    const replyAvatar = frame
      .locator(".convor-msg--operator img.convor-msg__avatar")
      .last();
    await replyAvatar.waitFor({ timeout: 30_000 });
    await replyAvatar.evaluate(async (image) => {
      await image.decode();
      if (!image.naturalWidth)
        throw new Error("Operator portrait not rendered");
    });
    await visitor.evaluate(() => document.fonts.ready);
    const widget = visitor.locator(".convor-frame-wrapper");
    const box = await widget.boundingBox();
    const viewport = visitor.viewportSize();
    if (!box || !viewport) throw new Error("Chat screenshot unavailable");
    // Preserve the real page background around the widget without clipping
    // the footer or page copy.
    const x = Math.max(0, box.x - 16);
    const y = Math.max(0, box.y - 16);
    await visitor.screenshot({
      clip: {
        x,
        y,
        width: Math.min(viewport.width - x, box.width + 32),
        height: Math.min(viewport.height - y, box.height + 32),
      },
      path: path.join(folder, `${locale}-wordpress-chat.png`),
      animations: "disabled",
    });
    if (process.env.DOCS_CAPTURE_PUBLIC_ONLY !== "1") {
      // Verify actual domain observation after the genuine chat, never
      // fabricate a successful status for the screenshot.
      const observed = await page.request.get(
        `${api}/api/wordpress/installation/status`,
        { headers },
      );
      if (!observed.ok() || (await observed.json()).status !== "observed") {
        throw new Error("Installation activity has not been observed");
      }
      await page.goto(
        `${dashboard}/o/${required("CONVOR_ORG_ID")}/integrations/wordpress?projectId=${required("CONVOR_PROJECT_ID")}`,
        { waitUntil: "domcontentloaded", timeout: 90_000 },
      );
      const card = page.getByTestId("wordpress-installation-card");
      await card.waitFor({ timeout: 60_000 });
      const field = page.getByTestId("wordpress-widget-key");
      await field.waitFor({ timeout: 60_000 });
      const activity = page.getByTestId("wordpress-installation-status");
      await activity.getByRole("link").waitFor({ timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      if ((await page.locator("html").getAttribute("lang")) !== locale)
        throw new Error("Unexpected dashboard language");
      if ((await field.inputValue()) !== liveKey)
        throw new Error("Unexpected dashboard key");
      const snippet = card.locator("pre code");
      if (!(await snippet.textContent())?.includes(liveKey))
        throw new Error("Unexpected snippet");
      // Redact only the key value in the final pixels; do not change the
      // displayed DOM, persisted key, snippet or real activity state.
      // The manual installation image illustrates the key and embed code.
      // Crop before diagnostics instead of falsifying the observed hostname.
      await card.scrollIntoViewIfNeeded();
      const cardBox = await card.boundingBox();
      const activityBox = await activity.boundingBox();
      if (!cardBox || !activityBox || activityBox.y <= cardBox.y)
        throw new Error("Missing installation crop bounds");
      const setupText = (await card.innerText()).split(
        await activity.innerText(),
      )[0];
      if (/127\.0\.0\.1|localhost|\bQA\b/.test(setupText))
        throw new Error("Local identifiers in setup screenshot");
      await captureInstallationCard(
        page,
        field,
        snippet,
        liveKey,
        {
          x: cardBox.x,
          y: cardBox.y,
          width: cardBox.width,
          height: activityBox.y - cardBox.y - 6,
        },
        path.join(folder, `${locale}-wordpress-installation.png`),
      );
      await page.goto(
        `${dashboard}/o/${required("CONVOR_ORG_ID")}/conversations/${id}?projectId=${required("CONVOR_PROJECT_ID")}`,
        { waitUntil: "domcontentloaded", timeout: 90_000 },
      );
      const messages = page.getByTestId("conv-message-list");
      await messages
        .getByText(question, { exact: true })
        .waitFor({ timeout: 60_000 });
      await messages
        .getByText(answer, { exact: true })
        .waitFor({ timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      const timeline = page.getByTestId("conversation-messages-scroll");
      const replyRow = messages
        .locator('[data-sender-type="operator"]')
        .filter({ hasText: answer });
      await replyRow.scrollIntoViewIfNeeded();
      const visitorRow = messages
        .locator('[data-sender-type="visitor"]')
        .filter({ hasText: question });
      const visitorPhoto = visitorRow
        .locator("xpath=ancestor::div[@aria-label][1]")
        .locator('[data-testid="visitor-identity-avatar"] img');
      await visitorPhoto.waitFor({ timeout: 30_000 });
      await visitorPhoto.evaluate(async (image) => {
        await image.decode();
        if (!image.naturalWidth)
          throw new Error("Visitor portrait not rendered");
      });
      const operatorPhoto = replyRow
        .locator("xpath=ancestor::div[@aria-label][1]")
        .getByRole("img", { name: operatorPerson.name });
      await operatorPhoto.waitFor({ timeout: 30_000 });
      await operatorPhoto.evaluate(async (image) => {
        await image.decode();
        if (!image.naturalWidth)
          throw new Error("Dashboard operator portrait not rendered");
      });
      // Wait for client hydration to replace the UTC SSR snapshot with the
      // same browser timezone used by the actual WordPress visitor.
      const expectedTime = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Warsaw",
      }).format(new Date(replyMessage.createdAt));
      await page.waitForFunction(
        ({ answer, expectedTime }) => {
          const bubble = Array.from(
            document.querySelectorAll('[data-sender-type="operator"]'),
          ).find((el) => el.textContent.includes(answer));
          const row = bubble?.closest("div[aria-label]");
          return Array.from(row?.querySelectorAll("span[title]") ?? []).some(
            (el) => el.getAttribute("title") === expectedTime,
          );
        },
        { answer, expectedTime },
        { timeout: 30_000 },
      );
      // Chronological message excerpt, with the actual audit history intact.
      const crop = await timeline.evaluate(
        (panel, { question, answer }) => {
          const find = (type, text) =>
            Array.from(panel.querySelectorAll(`[data-sender-type="${type}"]`))
              .find((el) => el.textContent.includes(text))
              ?.closest("div[aria-label]");
          const first = find("visitor", question);
          const last = find("operator", answer);
          if (!first || !last)
            throw new Error("Cannot locate actual message rows");
          const a = first.getBoundingClientRect(),
            b = last.getBoundingClientRect(),
            p = panel.getBoundingClientRect();
          if (a.top < p.top || b.bottom > p.bottom || b.top < a.bottom)
            throw new Error("Message rows are not visible together");
          const activities = Array.from(
            panel.querySelectorAll('[data-testid^="conversation-activity-"]'),
          ).map((el) => ({
            rect: el.getBoundingClientRect(),
            text: el.textContent,
          }));
          const between = activities.filter(
            ({ rect }) => rect.top < b.bottom && rect.bottom > a.top,
          );
          if (between.length)
            throw new Error(
              "Activity between messages: " +
                between.map((item) => item.text).join(" | "),
            );
          const earlier = activities
            .filter(({ rect }) => rect.bottom <= a.top)
            .map(({ rect }) => rect.bottom);
          const later = activities
            .filter(({ rect }) => rect.top >= b.bottom)
            .map(({ rect }) => rect.top);
          const top = Math.max(p.top, a.top - 16, ...earlier);
          const bottom = Math.min(p.bottom, b.bottom + 16, ...later);
          return { x: p.x, y: top, width: p.width, height: bottom - top };
        },
        { question, answer },
      );
      await page.screenshot({
        clip: crop,
        path: path.join(folder, `${locale}-wordpress-inbox.png`),
        animations: "disabled",
      });
      console.log(
        "PASS real assigned human conversation and activity-free inbox excerpt",
      );
    }
  } finally {
    await visitor.close();
  }
  console.log(
    process.env.DOCS_CAPTURE_PUBLIC_ONLY === "1"
      ? `Captured actual ${locale} WordPress settings and chat.`
      : `Captured actual ${locale} WordPress, dashboard, chat and inbox screens.`,
  );
} finally {
  await browser.close();
  // This is a disposable synthetic administrator. Preserve its previous locale
  // so other real E2E tests can still use the expected English controls.
  if (previousWooState === "active") {
    wpEval(
      'require_once ABSPATH."wp-admin/includes/plugin.php"; $r=activate_plugin("woocommerce/woocommerce.php"); if(is_wp_error($r))exit(1);',
    );
  }
  const original = /^[A-Za-z_]+$/.test(previousLocale) ? previousLocale : "";
  wpEval(
    '$u=get_user_by("login",getenv("WP_QA_USER")); update_user_meta($u->ID,"locale",' +
      JSON.stringify(original) +
      ");",
  );
}
