const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const SHOT = (n) => `C:/Users/Gio/AppData/Local/Temp/claude/C--Users-Gio-truepositive/149a9c0b-472e-4709-a9b6-4a3792eb69e8/scratchpad/${n}.png`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SHOT("rate1_login_full") });
  await page.screenshot({ path: SHOT("rate2_login_clip"), clip: { x: 600, y: 150, width: 720, height: 780 } });
  await browser.close();
})();
