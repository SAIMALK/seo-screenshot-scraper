const puppeteer = require("puppeteer");
const path = require("path");

(async () => {
  const userDataDir = path.join(__dirname, "google-session"); // Stores session data

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: userDataDir,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  // Optional: Realistic user agent
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
  );

  // Go to Google account page
  await page.goto("https://myaccount.google.com/", {
    waitUntil: "networkidle2",
  });

  // Wait manually (60 seconds) to give user time to log in
  console.log("⏳ Please log in manually in the browser window...");
  await new Promise((resolve) => setTimeout(resolve, 60000)); // Replaces page.waitForTimeout

  // Take screenshot after login
  await page.screenshot({ path: "google-account.png", fullPage: true });
  console.log("✅ Screenshot saved as google-account.png");

  await browser.close();
})();
