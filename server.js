const express = require("express");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");
const {
  getSheetsClient,
  readSheet,
  writeSheet,
  scrapeGoogle,
  uploadToGyazo,
  humanDelay,
  USER_AGENTS,
} = require("./scraper");

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

let browser = null;
let scrapingLogs = [];
let isRunning = false;
let shouldStop = false;
let wasStopped = false;

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  scrapingLogs.push(line);
  if (scrapingLogs.length > 1000) scrapingLogs.shift();
}

async function closeBrowser() {
  if (browser) {
    try {
      await browser.close();
      log("Browser closed");
    } catch (e) {
      log(`Error closing browser: ${e.message}`);
    }
    browser = null;
  }
}

async function startScrapingProcess(spreadsheetId, sheetName, gyazoToken) {
  if (isRunning) {
    log("Scraping process is already running");
    return;
  }

  isRunning = true;
  shouldStop = false;
  wasStopped = false;

  try {
    log("Initializing scraping process...");
    log(`Spreadsheet ID: ${spreadsheetId}`);
    log(`Sheet Name: ${sheetName}`);
    log(`Gyazo Token: ${gyazoToken ? "SET" : "NOT SET"}`);

    const sheets = await getSheetsClient("./service-account.json");
    const rows = await readSheet(sheets, spreadsheetId, sheetName);

    if (!rows || rows.length <= 1) {
      log("No data found or only header row present");
      isRunning = false;
      return;
    }

    log(`Found ${rows.length - 1} rows to process`);

    if (!browser) {
      log("Launching browser...");
      browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1280, height: 900 },
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled",
          "--disable-infobars",
          "--disable-features=VizDisplayCompositor",
          "--disable-features=IsolateOrigins,site-per-process",
          "--disable-dev-shm-usage",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-extensions-file-access-check",
          "--disable-web-security",
          "--allow-running-insecure-content",
          "--disable-client-side-phishing-detection",
          "--disable-sync",
          "--metrics-recording-only",
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-backgrounding-occluded-windows",
          "--disable-component-extensions-with-background-pages",
          "--user-data-dir=/tmp/chrome-user-data-" +
            Math.random().toString(36).substring(2),
        ],
      });
      log("Browser launched successfully");
    }

    for (let i = 1; i < rows.length; i++) {
      if (shouldStop) {
        log("Stop signal received, terminating scraping process");
        wasStopped = true;
        break;
      }

      const [searchQuery, targetDomain] = rows[i];
      if (!searchQuery || searchQuery.trim() === "") {
        log(`Skipping row ${i + 1} due to missing search query`);
        continue;
      }

      log(
        `Processing row ${i + 1}/${rows.length - 1}: "${searchQuery}" ${
          targetDomain ? `-> ${targetDomain}` : "(general screenshot)"
        }`
      );

      const page = await browser.newPage();
      try {
        const result = await scrapeGoogle(
          page,
          searchQuery,
          targetDomain,
          gyazoToken
        );
        await writeSheet(sheets, spreadsheetId, sheetName, i + 1, result);
        log(`Row ${i + 1} completed: ${result}`);

        // Add delay between requests to avoid rate limiting
        if (i < rows.length - 1 && !shouldStop) {
          log("Waiting before next request...");
          await humanDelay(3000, 8000);
        }
      } catch (e) {
        log(`Error processing row ${i + 1}: ${e.message}`);
        await writeSheet(sheets, spreadsheetId, sheetName, i + 1, "ERROR");
      } finally {
        await page.close();
      }
    }

    if (!wasStopped) {
      log("All rows processed successfully!");
    }
  } catch (err) {
    log(`Fatal error: ${err.message}`);
    console.error(err);
  } finally {
    isRunning = false;
    log("Scraping process ended");
  }
}

// Serve the HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/start", async (req, res) => {
  const { spreadsheetId, sheetName, gyazoToken } = req.body;

  if (!spreadsheetId || !sheetName || !gyazoToken) {
    return res
      .status(400)
      .send(
        "Missing required parameters: spreadsheetId, sheetName, and gyazoToken are all required"
      );
  }

  if (isRunning) {
    return res.status(409).send("Scraping is already running");
  }

  // Clear previous logs for new session
  scrapingLogs = [];

  // Start scraping process in background
  startScrapingProcess(spreadsheetId, sheetName, gyazoToken);
  res.send("Scraping started successfully");
});

app.post("/stop", async (req, res) => {
  if (!isRunning) {
    return res.status(400).send("No scraping process is currently running");
  }

  shouldStop = true;
  log("Stop signal received from user");

  // Close browser to force stop
  setTimeout(async () => {
    if (isRunning) {
      await closeBrowser();
      isRunning = false;
      wasStopped = true;
      log("Force stopped scraping process");
    }
  }, 5000); // Give 5 seconds for graceful shutdown

  res.send("Stop signal sent");
});

app.post("/restart", async (req, res) => {
  const { spreadsheetId, sheetName, gyazoToken } = req.body;

  if (!spreadsheetId || !sheetName || !gyazoToken) {
    return res
      .status(400)
      .send(
        "Missing required parameters: spreadsheetId, sheetName, and gyazoToken are all required"
      );
  }

  // Stop current process if running
  if (isRunning) {
    shouldStop = true;
    await closeBrowser();
    // Wait a bit for cleanup
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Clear logs and restart
  scrapingLogs = [];
  isRunning = false;
  shouldStop = false;
  wasStopped = false;

  // Start new process
  startScrapingProcess(spreadsheetId, sheetName, gyazoToken);
  res.send("Scraping restarted successfully");
});

app.get("/logs", (req, res) => {
  res.json({
    isRunning,
    logs: scrapingLogs,
    wasStopped,
  });
});

// Cleanup on exit
process.on("SIGINT", async () => {
  console.log("Received SIGINT, cleaning up...");
  shouldStop = true;
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, cleaning up...");
  shouldStop = true;
  await closeBrowser();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `Make sure to place your service-account.json file in the same directory`
  );
});
