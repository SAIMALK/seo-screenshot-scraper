const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
require("dotenv").config();

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
];

async function humanDelay(min, max) {
  const delay = Math.random() * (max - min) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function scrapeGoogle(keyword) {
  const randomUserAgent =
    USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  console.log("Launching browser...");

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 900 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  const page = await browser.newPage();

  await page.setUserAgent(randomUserAgent);
  await page.evaluateOnNewDocument(() => {
    delete navigator.__proto__.webdriver;
  });

  try {
    console.log("Navigating to Google...");
    await page.goto(
      `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
      {
        waitUntil: "networkidle2",
        timeout: 60000,
      }
    );

    if (page.url().includes("google.com/sorry")) {
      console.log("CAPTCHA detected! Please solve it manually in the browser.");

      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 });

      console.log("CAPTCHA solved! Waiting for page to stabilize...");

      await humanDelay(1000, 4000);
      const consentFrame = page
        .frames()
        .find((frame) => frame.url().includes("consent.google.com"));
      if (consentFrame) {
        try {
          await consentFrame.click('button:has-text("Accept all")');
          await humanDelay(1000, 4000);
        } catch {}
      }
    }

    console.log("Waiting for search results...");
    await Promise.race([
      page.waitForSelector("div#search", { timeout: 40000 }),
      page.waitForSelector("div.g", { timeout: 40000 }),
    ]);

    const targetDomain = process.env.TARGET_DOMAIN.toLowerCase().replace(
      /^www\./,
      ""
    );

    // Log all URLs for debugging
    const detectedUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("div#search a"))
        .map((link) => {
          try {
            return new URL(link.href).hostname
              .replace(/^www\./, "")
              .toLowerCase();
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    });
    console.log("Detected URLs on the page:", detectedUrls);

    // Find the snippet element containing the target domain
    const elementHandle = await page.evaluateHandle((targetDomain) => {
      const allLinks = Array.from(document.querySelectorAll("div#search a"));
      const matchedLinks = allLinks.filter((link) => {
        try {
          const url = new URL(link.href);
          const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
          return (
            hostname === targetDomain || hostname.endsWith(`.${targetDomain}`)
          );
        } catch {
          return false;
        }
      });
      if (matchedLinks.length === 0) return null;

      let container = matchedLinks[0].closest("div.g");
      if (!container) container = matchedLinks[0].parentElement;
      return container || matchedLinks[0];
    }, targetDomain);

    if (elementHandle && elementHandle.asElement()) {
      // Scroll snippet into view at top of viewport
      await elementHandle.asElement().evaluate((el) => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      await humanDelay(500, 800);

      // Scroll up by 100px to add padding above snippet
      await page.evaluate(() => {
        window.scrollBy(0, -100);
      });

      await humanDelay(1500, 2000); // wait for scrolling + settle

      // Take screenshot of visible viewport (search bar + snippet)
      const screenshotPath = `screenshots/${keyword.replace(
        /\s+/g,
        "_"
      )}_${Date.now()}_viewport.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });

      console.log(`Success! Viewport screenshot saved: ${screenshotPath}`);
    } else {
      console.log("Target domain not found in first-page results.");
    }
  } catch (error) {
    console.error("Error:", error.message);
    await page.screenshot({ path: "screenshots/error.png" });
  } finally {
    await browser.close();
  }
}

scrapeGoogle(process.env.SEARCH_QUERY || "SEO website").catch((err) =>
  console.error("Fatal Error:", err)
);
