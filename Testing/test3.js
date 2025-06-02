require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

puppeteer.use(StealthPlugin());

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || "Sheet1";
const KEYFILEPATH = "./service-account.json";
const GYAZO_ACCESS_TOKEN = process.env.GYAZO_ACCESS_TOKEN;

async function humanDelay(min, max) {
  const delay = Math.random() * (max - min) + min;
  return new Promise((res) => setTimeout(res, delay));
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

async function readSheet(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:B`,
  });
  return res.data.values || [];
}

async function writeSheet(sheets, rowIndex, value) {
  const cell = `C${rowIndex}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!${cell}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[value]],
    },
  });
}

async function uploadToGyazo(filePath) {
  if (!GYAZO_ACCESS_TOKEN) throw new Error("GYAZO_ACCESS_TOKEN not set");

  const form = new FormData();
  form.append("access_token", GYAZO_ACCESS_TOKEN);
  form.append("imagedata", fs.createReadStream(filePath));

  const response = await axios.post(
    "https://upload.gyazo.com/api/upload",
    form,
    {
      headers: form.getHeaders(),
    }
  );
  return response.data.url;
}

async function scrapeGoogle(page, searchQuery, targetDomain) {
  console.log(
    `Scraping "${searchQuery}"${
      targetDomain
        ? ` targeting "${targetDomain}"`
        : " (no target domain - general screenshot)"
    }`
  );

  const randomUserAgent =
    USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  await page.setUserAgent(randomUserAgent);
  await page.evaluateOnNewDocument(() => {
    delete navigator.__proto__.webdriver;
  });

  try {
    await page.goto(
      `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
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
        .find((f) => f.url().includes("consent.google.com"));
      if (consentFrame) {
        try {
          await consentFrame.click('button:has-text("Accept all")');
          await humanDelay(1000, 4000);
        } catch {}
      }
    }

    await Promise.race([
      page.waitForSelector("div#search", { timeout: 40000 }),
      page.waitForSelector("div.g", { timeout: 40000 }),
    ]);

    // If no target domain specified, just take a screenshot of the search results
    if (!targetDomain || targetDomain.trim() === "") {
      console.log(
        "No target domain specified - taking general screenshot of search results"
      );

      // Scroll to make sure we get good search results in view
     

      if (!fs.existsSync("screenshots")) {
        fs.mkdirSync("screenshots");
      }
      const safeQuery = searchQuery
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "_");
      const screenshotFilename = `${safeQuery}_general_${Date.now()}.png`;
      const screenshotPath = path.join("screenshots", screenshotFilename);

      await page.screenshot({ path: screenshotPath, fullPage: false });

      console.log(`Screenshot saved: ${screenshotFilename}`);

      const gyazoUrl = await uploadToGyazo(screenshotPath);
      console.log(`Uploaded to Gyazo: ${gyazoUrl}`);

      return gyazoUrl;
    }

    // Original logic for when target domain is specified
    const detectedUrls = await page.evaluate(() =>
      Array.from(document.querySelectorAll("div#search a"))
        .map((link) => {
          try {
            return new URL(link.href).hostname
              .replace(/^www\./, "")
              .toLowerCase();
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    );
    console.log("Detected URLs:", detectedUrls);

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
      // Target domain found on first page, take screenshot + upload
      await elementHandle.asElement().evaluate((el) => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      await humanDelay(500, 800);
      await page.evaluate(() => window.scrollBy(0, -100));
      await humanDelay(1500, 2000);

      if (!fs.existsSync("screenshots")) {
        fs.mkdirSync("screenshots");
      }
      const safeQuery = searchQuery
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "_");
      const screenshotFilename = `${safeQuery}_${Date.now()}.png`;
      const screenshotPath = path.join("screenshots", screenshotFilename);

      await page.screenshot({ path: screenshotPath, fullPage: false });

      console.log(`Screenshot saved: ${screenshotFilename}`);

      const gyazoUrl = await uploadToGyazo(screenshotPath);
      console.log(`Uploaded to Gyazo: ${gyazoUrl}`);

      return gyazoUrl;
    } else {
      console.log("Target domain NOT found on first page.");
      // Do NOT take screenshot or upload, return special flag
      return "NOT ON FIRST PAGE";
    }
  } catch (err) {
    console.error("Scraping error:", err.message);
    await page.screenshot({ path: "screenshots/error.png" });
    return "ERROR";
  }
}

(async () => {
  const sheets = await getSheetsClient();
  const rows = await readSheet(sheets);

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

  try {
    for (let i = 1; i < rows.length; i++) {
      // skip header row
      const [searchQuery, targetDomain] = rows[i];

      if (!searchQuery || searchQuery.trim() === "") {
        console.log(`Skipping row ${i + 1} due to missing search query`);
        continue;
      }

      const page = await browser.newPage();

      try {
        const result = await scrapeGoogle(page, searchQuery, targetDomain);
        await writeSheet(sheets, i + 1, result);
      } catch (e) {
        console.error(`Error processing row ${i + 1}:`, e.message);
        await writeSheet(sheets, i + 1, "ERROR");
      } finally {
        await page.close();
      }
    }
  } catch (outerErr) {
    console.error("Fatal error:", outerErr);
  } finally {
    await browser.close();
  }
})();
