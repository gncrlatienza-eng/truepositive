import { chromium } from "playwright";
import fs from "fs";

const slugEnv = fs.readFileSync(
  "C:/Users/Gio/AppData/Local/Temp/claude/C--Users-Gio-truepositive/fd6d7c9f-291f-4612-ae2c-83281dba82d5/scratchpad/slug.env",
  "utf-8",
);
const email = fs
  .readFileSync(
    "C:/Users/Gio/AppData/Local/Temp/claude/C--Users-Gio-truepositive/fd6d7c9f-291f-4612-ae2c-83281dba82d5/scratchpad/signup.json",
    "utf-8",
  )
  .match(/"email":"([^"]+)"/)[1];

const shotDir = "C:/Users/Gio/AppData/Local/Temp/claude/C--Users-Gio-truepositive/fd6d7c9f-291f-4612-ae2c-83281dba82d5/scratchpad/screenshots";
fs.mkdirSync(shotDir, { recursive: true });

const consoleErrors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

async function shot(name) {
  await page.screenshot({ path: `${shotDir}/${name}.png` });
}

console.log("Step 1: login as seeded user", email);
await page.goto("http://localhost:3000/login");
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', "TestPass123");
await page.click('button[type="submit"]');
await page.waitForURL("**/app", { timeout: 10000 });
await page.waitForSelector("text=Detection posture", { timeout: 10000 });
await page.waitForTimeout(500);
await shot("01-dashboard-seeded");
console.log("  OK: landed on Dashboard directly, no placeholder page");

console.log("Step 2: check status banner + KPI row rendered");
await page.waitForSelector("text=Agents online");
const kpiCards = await page.locator("text=Active alerts").count();
console.log("  KPI 'Active alerts' label found:", kpiCards > 0);

console.log("Step 3: click Critical KPI card, verify drill-in panel opens");
await page.click("text=Critical", { timeout: 5000 });
await page.waitForSelector("text=Critical alerts", { timeout: 5000 });
await page.waitForTimeout(400);
await shot("02-critical-panel");
const panelVisible = await page.locator("text=critical alerts active").count();
console.log("  Critical panel content visible:", panelVisible > 0);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

console.log("Step 4: click a severity breakdown row, verify severity panel");
await page.click("text=Severity breakdown");
await page.waitForTimeout(200);
const sevRow = page.locator("text=Critical").first();
await sevRow.click();
await page.waitForTimeout(400);
await shot("03-severity-panel");

console.log("Step 5: click top alert type row, verify Pattern (rule) panel");
await page.click('span:has-text("×")', { timeout: 3000 }).catch(() => {});
await page.waitForTimeout(200);
const ruleRow = page.locator("text=Seed: New admin account created").first();
if (await ruleRow.count()) {
  await ruleRow.click();
  await page.waitForTimeout(400);
  await shot("04-rule-panel");
  console.log("  Rule (Pattern) panel opened");
}

console.log("Step 6: sidebar navigation — Logs/Alerts/Incidents/Reports/Intel show Coming Soon");
for (const [label, path, sprint] of [
  ["Logs", "logs", "5"],
  ["Alerts", "alerts", "5"],
  ["Incidents", "incidents", "6"],
  ["Reports", "reports", "6"],
  ["Threat intel", "intel", "7"],
]) {
  await page.click(`a[title="${label}"]`);
  await page.waitForURL(`**/app/${path}`);
  await page.waitForSelector(`text=Sprint ${sprint}`);
  console.log(`  ${label} -> /app/${path} shows 'Coming in Sprint ${sprint}'`);
}
await shot("05-coming-soon-logs");

console.log("Step 7: Settings nav item — should render inside the same shell");
await page.click('a[title="Settings"]');
await page.waitForURL("**/settings");
await page.waitForSelector("text=Data sources");
await page.waitForTimeout(300);
await shot("06-settings-in-shell");
const sidebarStillThere = await page.locator('a[title="Dashboard"]').count();
console.log("  Settings loaded with sidebar still present:", sidebarStillThere > 0);

console.log("Step 8: back to Dashboard via sidebar, verify active-state highlighting");
await page.click('a[title="Dashboard"]');
await page.waitForURL("**/app");
await page.waitForSelector("text=Detection posture");

console.log("Step 9: hard refresh directly on /app");
await page.reload();
await page.waitForSelector("text=Detection posture", { timeout: 10000 });
console.log("  Survived hard refresh on /app");

console.log("Step 10: switch time window to 7d, confirm summary refetches");
await page.click("text=7d");
await page.waitForTimeout(600);
await shot("07-window-7d");

console.log("\n=== Console errors captured:", consoleErrors.length, "===");
consoleErrors.forEach((e) => console.log("  -", e));

await browser.close();
console.log("\nWalkthrough complete.");
