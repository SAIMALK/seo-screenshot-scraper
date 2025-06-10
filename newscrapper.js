require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
puppeteer.use(StealthPlugin());

const LOCATION_MAPPING = {
  london_indiana: "geo:38.1320,-85.6666",
  london_uk: "geo:51.5074,-0.1278",
  new_york: "geo:40.7128,-74.0060",
  tokyo: "gl=JP&hl=ja",
};

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

// const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
// const SHEET_NAME = process.env.SHEET_NAME || "Sheet1";
const KEYFILEPATH = "./seo-project.json";

// Helper function to get Chrome path
function getChromePath() {
  switch (process.platform) {
    case "win32":
      // Try multiple possible Chrome paths on Windows
      const possiblePaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
      ];

      for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
          return chromePath;
        }
      }

      console.log(
        "Chrome not found in standard locations. Trying system default..."
      );
      return undefined; // Let Puppeteer find Chrome automatically

    case "darwin":
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    default:
      return "/usr/bin/google-chrome";
  }
}

async function humanDelay(min, max) {
  const delay = Math.random() * (max - min) + min;
  return new Promise((res) => setTimeout(res, delay));
}

async function getSheetsClient(SPREADSHEET_ID) {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

async function readSheet(sheets, SPREADSHEET_ID, SHEET_NAME) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:C`,
  });
  return res.data.values || [];
}

async function writeSheet(
  sheets,
  SPREADSHEET_ID,
  SHEET_NAME,
  rowIndex,
  colIndex,
  value
) {
  const colLetter = String.fromCharCode(65 + colIndex);
  const cell = `${colLetter}${rowIndex}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!${cell}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[value]],
    },
  });
}

async function uploadToGyazo(filePath, GYAZO_ACCESS_TOKEN) {
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

// Extract and filter search results
async function extractAllSearchResults(page) {
  const organicUrls = await page.evaluate(() => {
    const allResults = [];

    // Get all search result containers
    const searchResults = document.querySelectorAll(
      "div.g, div.tF2Cxc, div[data-header-feature], div.hlcw0c"
    );

    let totalResults = 0;
    let organicCount = 0;

    searchResults.forEach((result, index) => {
      const linkElement = result.querySelector("a[href]");
      if (!linkElement || !linkElement.href) return;

      const url = linkElement.href;
      if (!url || url.startsWith("javascript:") || url.startsWith("#")) return;

      totalResults++;

      // Check if this is an ad - more precise detection
      let isAd = false;

      // Check for specific ad container classes
      const adClasses = [
        "ads-ad",
        "tads",
        "commercial",
        "shopping-results",
        "ads-visurl",
        "pla-unit",
        "shopping-carousel",
      ];

      const elementClasses = result.className || "";
      if (adClasses.some((adClass) => elementClasses.includes(adClass))) {
        isAd = true;
      }

      // Check for ad indicators in immediate children only
      if (!isAd) {
        const adSpans = result.querySelectorAll(
          "span[aria-label], span.H9lube"
        );
        for (const span of adSpans) {
          const text = (span.textContent || "").trim().toLowerCase();
          const ariaLabel = (
            span.getAttribute("aria-label") || ""
          ).toLowerCase();

          if (
            text === "ad" ||
            text === "sponsored" ||
            ariaLabel.includes("ad") ||
            ariaLabel.includes("sponsored")
          ) {
            isAd = true;
            break;
          }
        }
      }

      // Check for shopping/product results which are often promoted
      if (!isAd && result.querySelector(".pla-unit, .sh-pr__product-results")) {
        isAd = true;
      }

      // Check parent containers for ad indicators
      if (!isAd) {
        let parent = result.parentElement;
        while (parent && parent !== document.body) {
          const parentClasses = parent.className || "";
          if (adClasses.some((adClass) => parentClasses.includes(adClass))) {
            isAd = true;
            break;
          }
          parent = parent.parentElement;
        }
      }

      if (!isAd) {
        organicCount++;
        allResults.push(url);
      }
    });

    // Return both URLs and counts for logging
    return {
      urls: allResults,
      totalResults,
      organicCount,
    };
  });

  console.log(
    `Found ${organicUrls.totalResults} total results, ${organicUrls.organicCount} organic results`
  );
  console.log("First 5 organic URLs:", organicUrls.urls.slice(0, 5));

  return organicUrls.urls;
}

async function scrapeGoogle(
  page,
  searchQuery,
  targetDomain,
  locationKey,
  GYAZO_ACCESS_TOKEN
) {
  console.log(
    `Scraping "${searchQuery}"${
      targetDomain
        ? ` targeting "${targetDomain}" with locationKey "${locationKey}"`
        : " (no target domain - general screenshot)"
    }`
  );

  let locationParams = "";
  if (locationKey) {
    if (locationKey.startsWith("geo:")) {
      // Direct coordinates
      locationParams = `&uule=w+CAIQICI${Buffer.from(locationKey).toString(
        "base64"
      )}`;
    } else if (LOCATION_MAPPING[locationKey]) {
      // Predefined location key
      locationParams = LOCATION_MAPPING[locationKey].startsWith("geo:")
        ? `&uule=w+CAIQICI${Buffer.from(LOCATION_MAPPING[locationKey]).toString(
            "base64"
          )}`
        : `&${LOCATION_MAPPING[locationKey]}`;
    } else {
      // City name or raw parameters
      locationParams = `&near=${encodeURIComponent(locationKey)}`;
    }
  }

  const randomUserAgent =
    USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  await page.setUserAgent(randomUserAgent);
  await page.evaluateOnNewDocument(() => {
    delete navigator.__proto__.webdriver;
  });

  try {
    await page.goto(
      `https://www.google.com/search?q=${encodeURIComponent(
        searchQuery
      )}${locationParams}`,
      {
        waitUntil: "networkidle2",
        timeout: 60000,
      }
    );

    if (page.url().includes("google.com/sorry")) {
      console.log("CAPTCHA detected! Please solve it manually in the browser.");
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 });
      console.log("CAPTCHA solved! Waiting for page to stabilize...");
      await humanDelay(1000, 2000);
    }

    await Promise.race([
      page.waitForSelector("div#search a", { timeout: 20000 }),
      page.waitForSelector("div.g", { timeout: 20000 }),
    ]);

    // Extract organic URLs with improved filtering
    const organicUrls = await extractAllSearchResults(page);
    console.log("Organic URLs found:", organicUrls.length);

    // If no target domain specified, just take a screenshot
    if (!targetDomain || targetDomain.trim() === "") {
      console.log("No target domain - taking general screenshot");

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

       gyazoUrl = await uploadToGyazo(screenshotPath, GYAZO_ACCESS_TOKEN);
      console.log(`Uploaded to Gyazo: ${gyazoUrl}`);

      return { gyazoUrl, ranksString: "" };
    }

    // Look for ALL occurrences of target domain in organic results
    const targetDomainLower = targetDomain.toLowerCase();
    const foundMatches = []; // Array to store all matches with their ranks and URLs

    for (let i = 0; i < organicUrls.length; i++) {
      try {
        const url = new URL(organicUrls[i]);
        const hostname = url.hostname.replace(/^www\./, "").toLowerCase();

        if (
          hostname === targetDomainLower ||
          hostname.endsWith(`.${targetDomainLower}`)
        ) {
          foundMatches.push({
            rank: i + 1,
            url: organicUrls[i],
            hostname: hostname,
          });
          console.log(
            `Target domain found at rank ${i + 1}: ${
              organicUrls[i]
            } (${hostname})`
          );
        }
      } catch (e) {
        // Invalid URL, skip
        continue;
      }
    }

    if (foundMatches.length > 0) {
      console.log(`Found ${foundMatches.length} occurrences of target domain`);

      // Take screenshot of the first occurrence
      const firstMatch = foundMatches[0];
      const elementHandle = await page.evaluateHandle((targetUrl) => {
        const allLinks = Array.from(
          document.querySelectorAll("div#search a[href]")
        );
        const matchedLink = allLinks.find((link) => link.href === targetUrl);

        if (matchedLink) {
          let container = matchedLink.closest("div.g, div.tF2Cxc");
          if (!container) container = matchedLink.parentElement;
          return container || matchedLink;
        }
        return null;
      }, firstMatch.url);

      let gyazoUrl = null;
      if (elementHandle && elementHandle.asElement()) {
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

         gyazoUrl = await uploadToGyazo(
          screenshotPath,
          GYAZO_ACCESS_TOKEN
        );
        console.log(`Uploaded to Gyazo: ${gyazoUrl}`);
      }

      // Return all ranks as a comma-separated string
      const allRanks = foundMatches.map((match) => match.rank);
      return {
        gyazoUrl,
        ranksString: allRanks.join(", "),
        matchDetails: foundMatches,
      };
    }

    console.log("Target domain NOT found in organic results");
    return { gyazoUrl: null, ranksString: "Not found on page 1" };
  } catch (err) {
    console.error("Error scraping Google:", err);
    return { gyazoUrl: null, ranksString: "Error" };
  }
}

// Main execution function - SINGLE VERSION ONLY
exports.runScraper = async function runScraper({
  SPREADSHEET_ID,
  SHEET_NAME,
  GYAZO_ACCESS_TOKEN,
}) {
  GYAZO_TOKEN = GYAZO_ACCESS_TOKEN;
  console.log(GYAZO_TOKEN);
  const sheets = await getSheetsClient(SPREADSHEET_ID);
  const rows = await readSheet(sheets, SPREADSHEET_ID, SHEET_NAME);
  const userDataDir = path.join(__dirname, "google-session");

  if (!fs.existsSync(userDataDir))
    fs.mkdirSync(userDataDir, { recursive: true });

  const chromePath = getChromePath();
  const launchOptions = {
    headless: false,
    userDataDir,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--start-maximized",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
    ],
    defaultViewport: null,
  };
  if (chromePath) launchOptions.executablePath = chromePath;

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  await humanDelay(2000, 4000);

  for (let i = 1; i < rows.length; i++) {
    const [searchQuery, targetDomain, locationKey] = rows[i];
    if (!searchQuery) continue;

    const { gyazoUrl, ranksString, matchDetails } = await scrapeGoogle(
      page,
      searchQuery,
      targetDomain || "",
      locationKey || "",
      GYAZO_ACCESS_TOKEN
    );

    if (gyazoUrl)
      await writeSheet(sheets, SPREADSHEET_ID, SHEET_NAME, i + 1, 3, gyazoUrl);
    if (ranksString !== undefined)
      await writeSheet(
        sheets,
        SPREADSHEET_ID,
        SHEET_NAME,
        i + 1,
        4,
        ranksString
      );

    await humanDelay(1000, 2000);
  }

  await browser.close();
};
