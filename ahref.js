const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--no-sandbox", "--start-maximized"],
  });

  const page = await browser.newPage();

  console.log("Opening Ahrefs login page...");
  await page.goto("https://ahrefs.com/user/login", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  console.log("Filling login credentials...");
  // Fill email
  await page.waitForSelector('input[name="email"]', { visible: true });
  await page.type('input[name="email"]', "kiran@awkward-media.com", {
    delay: 30,
  });

  // Fill password
  await page.waitForSelector('input[name="password"]', { visible: true });
  await page.type('input[name="password"]', "Login@info", { delay: 30 });

  console.log("Submitting login form...");
  // Click login button
  const loginButton = await page.waitForSelector('button[type="submit"]', {
    visible: true,
  });
  await loginButton.click();

  console.log("Waiting for login completion...");
  // Wait for either dashboard or possible 2FA page
  await Promise.race([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }),
    page.waitForSelector("#otp-code", { visible: true, timeout: 15000 }),
  ]);

  console.log("Login successful! Browser will remain open.");
})();
