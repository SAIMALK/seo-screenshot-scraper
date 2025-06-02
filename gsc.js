const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");

puppeteer.use(StealthPlugin());

(async () => {
  // Use persistent profile to stay logged in
  const userDataDir = path.join(__dirname, "google-session");

  const browser = await puppeteer.launch({
    headless: false, // show the browser so you can log in
    userDataDir: userDataDir,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  // Set a realistic user-agent
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
  );

  // Go to Google Search Console
  const url = "https://search.google.com/search-console/";
  await page.goto(url, { waitUntil: "networkidle2" });

  // Wait manually for login + verification
  console.log("⏳ Please log into your Google account manually...");
  await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 60s for login

  // Optional: wait a few seconds to ensure page fully loads
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Screenshot after login
  await page.screenshot({ path: "gsc-dashboard.png", fullPage: true });
  console.log("✅ Screenshot saved as gsc-dashboard.png");

  await browser.close();
})();
