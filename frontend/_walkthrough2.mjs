import { chromium } from "playwright";
import fs from "fs";

const email = fs
  .readFileSync(
    "C:/Users/Gio/AppData/Local/Temp/claude/C--Users-Gio-truepositive/fd6d7c9f-291f-4612-ae2c-83281dba82d5/scratchpad/signup.json",
    "utf-8",
  )
  .match(/"email":"([^"]+)"/)[1];

const shotDir =
  "C:/Users/Gio/AppData/Local/Temp/claude/C--Users-Gio-truepositive/fd6d7c9f-291f-4612-ae2c-83281dba82d5/scratchpad/screenshots";
fs.mkdirSync(shotDir, { recursive: true });

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(err.message));

function safeName(name) {
  return name.replace(/[^a-z0-9]+/gi, "_");
}

async function shot(name) {
  await page.screenshot({ path: `${shotDir}/${safeName(name)}.png` });
}

async function step(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
  } catch (err) {
    console.log(`FAIL ${name}: ${err.message.split("\n")[0]}`);
    await shot(`fail-${name}`);
  }
}

await step("login", async () => {
  await page.goto("http://localhost:3000/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "TestPass123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 10000 });
  await page.waitForSelector("text=Detection posture", { timeout: 10000 });
});

await step("close any open panel via Escape", async () => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
});

await step("dump sidebar link titles", async () => {
  const titles = await page.locator("nav a, aside a, a").evaluateAll((els) =>
    els.map((e) => ({ title: e.getAttribute("title"), href: e.getAttribute("href") })).filter((x) => x.title),
  );
  console.log("  sidebar links:", JSON.stringify(titles));
});

for (const [label, path, sprint] of [
  ["Logs", "logs", "5"],
  ["Alerts", "alerts", "5"],
  ["Incidents", "incidents", "6"],
  ["Daily reports", "reports", "6"],
  ["Threat intel", "intel", "7"],
]) {
  await step(`sidebar nav -> ${label}`, async () => {
    await page.click(`a[title="${label}"]`, { timeout: 8000 });
    await page.waitForURL(`**/app/${path}`, { timeout: 8000 });
    await page.waitForSelector(`text=Sprint ${sprint}`, { timeout: 8000 });
  });
}
await shot("coming-soon-logs");

await step("sidebar nav -> Settings (should stay in shell)", async () => {
  await page.click('a[title="Settings"]');
  await page.waitForURL("**/settings", { timeout: 8000 });
  await page.waitForSelector("text=Data sources", { timeout: 8000 });
  const sidebarStillThere = await page.locator('a[title="Dashboard"]').count();
  if (sidebarStillThere === 0) throw new Error("sidebar missing on Settings page");
});
await shot("settings-in-shell");

await step("Settings tabs still work (Whitelisting)", async () => {
  await page.click("text=Whitelisting");
  await page.waitForTimeout(300);
});
await shot("settings-whitelist-tab");

await step("back to Dashboard via sidebar", async () => {
  await page.click('a[title="Dashboard"]');
  await page.waitForURL("**/app", { timeout: 8000 });
  await page.waitForSelector("text=Detection posture", { timeout: 8000 });
});

await step("click top alert type row -> Pattern (rule) panel", async () => {
  await page.locator("text=Seed: New admin account created").first().click();
  await page.waitForTimeout(500);
  const bodyText = await page.locator("body").innerText();
  if (!bodyText.includes("Enabled") && !bodyText.includes("Disabled")) {
    throw new Error("rule panel content not found; body snippet: " + bodyText.slice(0, 200));
  }
});
await shot("rule-panel-fixed");

await step("close panel, click severity row -> Severity panel", async () => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  // scope to the Severity breakdown card specifically to avoid matching the KPI card
  const card = page.locator("text=Severity breakdown").locator("..").locator("..");
  await card.getByText("Critical", { exact: true }).first().click();
  await page.waitForTimeout(400);
});
await shot("severity-panel-fixed");

await step("hard refresh on /app", async () => {
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForSelector("text=Detection posture", { timeout: 10000 });
});

await step("switch window to 7d", async () => {
  await page.click("text=7d");
  await page.waitForTimeout(600);
});
await shot("window-7d");

console.log("\n=== console errors:", consoleErrors.length, "===");
consoleErrors.forEach((e) => console.log("  -", e));
console.log("=== page errors:", pageErrors.length, "===");
pageErrors.forEach((e) => console.log("  -", e));

await browser.close();
console.log("\nWalkthrough (robust) complete.");
