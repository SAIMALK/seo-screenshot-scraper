const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");
require("dotenv").config();
const axios = require("axios");
const FormData = require("form-data");
const { google } = require("googleapis");
const fs = require("fs");
puppeteer.use(StealthPlugin());

const GYAZO_ACCESS_TOKEN = process.env.GYAZO_ACCESS_TOKEN;
const KEYFILEPATH = "./service-account.json";


// Ahrefs login credentials - add these to your .env file
const AHREFS_EMAIL = process.env.AHREFS_EMAIL || "kiran@awkward-media.com";
const AHREFS_PASSWORD = process.env.AHREFS_PASSWORD || "Login@info";

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

async function writeSheet(
  sheets,
  SPREADSHEET_ID, // Pass spreadsheet ID
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

async function loginToAhrefs(page) {
  try {
    console.log("🔐 Checking if login is required...");

    // Wait a moment for the page to fully load
    await humanDelay(3000, 5000);

    // Fixed: Better login detection using proper selectors
    const loginRequired = await page.evaluate(() => {
      // Check for login form elements using standard selectors
      const hasEmailInput = !!(
        document.querySelector('input[name="email"]') ||
        document.querySelector('input[type="email"]') ||
        document.querySelector('input[placeholder*="email" i]')
      );

      const hasPasswordInput = !!(
        document.querySelector('input[name="password"]') ||
        document.querySelector('input[type="password"]')
      );

      // Check URL patterns
      const urlIndicatesLogin =
        document.URL.includes("login") ||
        document.URL.includes("auth") ||
        document.URL.includes("signin");

      // Check for login buttons using proper selectors
      const loginButtons = Array.from(
        document.querySelectorAll('button, input[type="submit"]')
      );
      const hasLoginButton = loginButtons.some(
        (btn) =>
          (btn.textContent &&
            btn.textContent.toLowerCase().includes("log in")) ||
          (btn.textContent &&
            btn.textContent.toLowerCase().includes("sign in")) ||
          (btn.value && btn.value.toLowerCase().includes("log in"))
      );

      // Check for session expired messages or login prompts
      const bodyText = document.body.textContent.toLowerCase();
      const hasLoginText =
        bodyText.includes("login") ||
        bodyText.includes("sign in") ||
        bodyText.includes("session expired") ||
        bodyText.includes("please log in");

      return {
        hasEmailInput,
        hasPasswordInput,
        urlIndicatesLogin,
        hasLoginText,
        hasLoginButton,
        currentUrl: document.URL,
        bodyText: bodyText.substring(0, 500), // First 500 chars for debugging
      };
    });

    console.log("🔍 Login detection results:", {
      hasEmailInput: loginRequired.hasEmailInput,
      hasPasswordInput: loginRequired.hasPasswordInput,
      urlIndicatesLogin: loginRequired.urlIndicatesLogin,
      hasLoginText: loginRequired.hasLoginText,
      hasLoginButton: loginRequired.hasLoginButton,
      currentUrl: loginRequired.currentUrl,
    });

    const needsLogin =
      (loginRequired.hasEmailInput && loginRequired.hasPasswordInput) ||
      loginRequired.urlIndicatesLogin ||
      (loginRequired.hasLoginText && loginRequired.hasLoginButton);

    if (!needsLogin) {
      console.log("✅ Already logged in or no login required");
      return true;
    }

    console.log("🔑 Login page detected, proceeding with authentication...");

    // Wait for email input and fill it
    console.log("📧 Looking for email input...");
    try {
      await page.waitForSelector(
        'input[name="email"], input[type="email"], input[placeholder*="email" i]',
        {
          visible: true,
          timeout: 15000,
        }
      );

      // Find the correct email selector
      let emailSelector = 'input[name="email"]';
      if (!(await page.$(emailSelector))) {
        emailSelector = 'input[type="email"]';
        if (!(await page.$(emailSelector))) {
          emailSelector = 'input[placeholder*="email" i]';
        }
      }

      await page.click(emailSelector, { clickCount: 3 }); // Select all existing text
      await page.type(emailSelector, AHREFS_EMAIL, { delay: 100 });
      console.log("✅ Email filled successfully");

      // Wait for password input and fill it
      console.log("🔒 Looking for password input...");
      await page.waitForSelector(
        'input[name="password"], input[type="password"]',
        {
          visible: true,
          timeout: 10000,
        }
      );

      let passwordSelector = 'input[name="password"]';
      if (!(await page.$(passwordSelector))) {
        passwordSelector = 'input[type="password"]';
      }

      await page.click(passwordSelector, { clickCount: 3 }); // Select all existing text
      await page.type(passwordSelector, AHREFS_PASSWORD, { delay: 100 });
      console.log("✅ Password filled successfully");

      // Small delay before submitting
      await humanDelay(1000, 2000);

      // Submit the form - improved submission logic
      console.log("🚀 Submitting login form...");
      let submitted = false;

      // First try to find and click submit button
      try {
        const submitSelector = 'button[type="submit"], input[type="submit"]';
        if (await page.$(submitSelector)) {
          await page.click(submitSelector);
          submitted = true;
          console.log("✅ Clicked submit button");
        }
      } catch (e) {
        console.log("⚠️ Submit button click failed, trying alternatives...");
      }

      // If submit button not found, try pressing Enter on password field
      if (!submitted) {
        try {
          await page.focus(passwordSelector);
          await page.keyboard.press("Enter");
          submitted = true;
          console.log("✅ Pressed Enter on password field");
        } catch (e) {
          console.log("⚠️ Enter key method failed");
        }
      }

      // Last resort - look for any button with login text
      if (!submitted) {
        try {
          const loginButtonClicked = await page.evaluate(() => {
            const buttons = Array.from(
              document.querySelectorAll('button, input[type="submit"]')
            );
            const loginButton = buttons.find(
              (btn) =>
                (btn.textContent &&
                  btn.textContent.toLowerCase().includes("log in")) ||
                (btn.textContent &&
                  btn.textContent.toLowerCase().includes("sign in")) ||
                (btn.value && btn.value.toLowerCase().includes("log in"))
            );
            if (loginButton) {
              loginButton.click();
              return true;
            }
            return false;
          });

          if (loginButtonClicked) {
            console.log("✅ Clicked login button via text search");
            submitted = true;
          }
        } catch (e) {
          console.log("❌ All login submission methods failed");
        }
      }

      if (!submitted) {
        throw new Error("Could not submit login form");
      }
    } catch (inputError) {
      console.error("❌ Error during login process:", inputError.message);
      throw inputError;
    }

    // Wait for login completion
    console.log("⏳ Waiting for login completion...");
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
        page.waitForSelector("#otp-code", { visible: true, timeout: 30000 }),
        humanDelay(10000, 12000), // Fallback delay
      ]);
    } catch (navError) {
      console.log("⚠️ Navigation timeout, checking current state...");
    }

    // Additional wait for page to stabilize
    await humanDelay(3000, 5000);

    // Check if 2FA is required
    const requires2FA = await page.evaluate(() => {
      return !!(
        document.querySelector("#otp-code") ||
        document.querySelector('input[name="otp"]') ||
        document.querySelector('input[placeholder*="code" i]') ||
        document.body.textContent.toLowerCase().includes("verification code") ||
        document.body.textContent.toLowerCase().includes("two-factor")
      );
    });

    if (requires2FA) {
      console.log("⚠️ 2FA detected - manual intervention may be required");
      console.log("🔢 Please enter the 2FA code manually if prompted");
      console.log("⏳ Waiting 30 seconds for manual 2FA entry...");
      await humanDelay(30000, 35000); // Give more time for manual 2FA entry
    }

    // Verify login success
    const loginStatus = await page.evaluate(() => {
      const currentUrl = document.URL;
      const bodyText = document.body.textContent.toLowerCase();

      return {
        currentUrl,
        stillOnLoginPage:
          currentUrl.includes("login") || currentUrl.includes("auth"),
        hasLoginError:
          bodyText.includes("invalid") ||
          bodyText.includes("incorrect") ||
          bodyText.includes("wrong") ||
          bodyText.includes("error"),
        hasLoggedInIndicators:
          bodyText.includes("dashboard") ||
          bodyText.includes("overview") ||
          currentUrl.includes("site-explorer") ||
          currentUrl.includes("app.ahrefs.com"),
        pageTitle: document.title,
      };
    });

    console.log("🔍 Login verification:", loginStatus);

    if (loginStatus.stillOnLoginPage && !requires2FA) {
      console.error("❌ Still on login page - authentication may have failed");
      if (loginStatus.hasLoginError) {
        console.error("❌ Login error detected on page");
      }
      return false;
    }

    if (loginStatus.hasLoggedInIndicators) {
      console.log("✅ Login successful - found logged-in indicators!");
      return true;
    }

    console.log("✅ Login appears successful!");
    return true;
  } catch (error) {
    console.error("❌ Login failed:", error.message);
    console.log("🔄 Continuing anyway - some pages might still work...");
    return false;
  }
}

async function navigateToAhrefsWithLogin(page, url) {
  console.log(`🌐 Navigating to: ${url}`);

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  } catch (navError) {
    console.log("⚠️ Initial navigation timeout, but continuing...");
  }

  // Check if we need to login
  const loginSuccess = await loginToAhrefs(page);

  if (loginSuccess) {
    // If we were redirected during login, navigate to the original URL again
    const currentUrl = page.url();
    if (!currentUrl.includes("site-explorer") || currentUrl !== url) {
      console.log("🔄 Navigating back to original URL after login...");
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
        await humanDelay(5000, 7000); // Extra wait after navigation
      } catch (navError) {
        console.log("⚠️ Re-navigation timeout, but continuing...");
      }
    }
  } else {
    console.log("⚠️ Login failed, but attempting to continue...");
  }

  await humanDelay(5000, 7000); // Longer wait for Ahrefs to load
}

async function captureScrollableContainer(
  page,
  scrollIntervals = [5, 350, 700],
  delay = 2000 // Increased default delay
) {
  const screenshots = [];

  // Improved container detection with multiple strategies
  const containerInfo = await page.evaluate(() => {
    // Strategy 1: Look for common scrollable containers with tables
    let scrollable = [...document.querySelectorAll("*")].find(
      (el) =>
        el.scrollHeight > el.clientHeight &&
        el.clientHeight > 300 &&
        el.querySelector("table")
    );

    // Strategy 2: Look for main content areas that might be scrollable
    if (!scrollable) {
      scrollable = [
        ...document.querySelectorAll(
          "main, .main, #main, .content, .container"
        ),
      ].find(
        (el) => el.scrollHeight > el.clientHeight && el.clientHeight > 200
      );
    }

    // Strategy 3: Look for any scrollable div with reasonable size
    if (!scrollable) {
      scrollable = [...document.querySelectorAll("div")].find(
        (el) =>
          el.scrollHeight > el.clientHeight &&
          el.clientHeight > 400 &&
          el.scrollHeight > 1000
      );
    }

    // Strategy 4: Check if the body itself is scrollable
    if (!scrollable && document.body.scrollHeight > window.innerHeight) {
      scrollable = document.body;
    }

    if (!scrollable) return null;

    // Generate a more reliable selector
    let selector;
    if (scrollable.id) {
      selector = `#${scrollable.id}`;
    } else if (scrollable.className && scrollable.className.trim()) {
      const classes = scrollable.className.trim().split(/\s+/).slice(0, 3); // Use first 3 classes max
      selector = `.${classes.join(".")}`;
    } else {
      selector = scrollable.tagName.toLowerCase();
    }

    return {
      selector,
      scrollHeight: scrollable.scrollHeight,
      clientHeight: scrollable.clientHeight,
      tagName: scrollable.tagName,
      id: scrollable.id,
      className: scrollable.className,
    };
  });

  if (!containerInfo || !containerInfo.selector) {
    console.log(
      "⚠️ Could not identify scrollable container. Trying page-level screenshots..."
    );

    // Fallback: Take screenshots by scrolling the page itself
    for (let i = 0; i < scrollIntervals.length; i++) {
      const scrollPosition = scrollIntervals[i];

      console.log(`📍 Scrolling page to position: ${scrollPosition}px`);

      await page.evaluate((pos) => {
        window.scrollTo(0, pos);
      }, scrollPosition);

      await humanDelay(delay, delay + 500);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const screenshotPath = `page-scroll-${scrollPosition}px-${i}-${timestamp}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`📸 Page screenshot saved: ${screenshotPath}`);
      screenshots.push(screenshotPath);
    }

    return screenshots;
  }

  console.log("📦 Scrollable container detected:", containerInfo.selector);
  console.log(`📏 Container details:`, {
    selector: containerInfo.selector,
    tagName: containerInfo.tagName,
    id: containerInfo.id,
    className: containerInfo.className,
    dimensions: `${containerInfo.clientHeight}px visible, ${containerInfo.scrollHeight}px total`,
  });
  console.log(
    `📍 Scroll positions to capture: [${scrollIntervals.join(", ")}]px`
  );

  for (let i = 0; i < scrollIntervals.length; i++) {
    const scrollPosition = scrollIntervals[i];

    if (
      scrollPosition >
      containerInfo.scrollHeight - containerInfo.clientHeight
    ) {
      console.log(
        `⏭️ Skipping position ${scrollPosition}px (exceeds scrollable area)`
      );
      continue;
    }

    console.log(`📍 Scrolling to position: ${scrollPosition}px`);

    await page.evaluate(
      (selector, pos) => {
        const container = document.querySelector(selector);
        if (container) {
          container.scrollTop = pos;
          // Double-check scroll position after a brief delay
          setTimeout(() => {
            if (container.scrollTop !== pos) {
              container.scrollTop = pos;
            }
          }, 100);
        } else {
          console.warn("Container not found for scrolling:", selector);
        }
      },
      containerInfo.selector,
      scrollPosition
    );

    await humanDelay(delay, delay + 500);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotPath = `scroll-capture-${scrollPosition}px-${i}-${timestamp}.png`;
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    screenshots.push(screenshotPath);
  }

  console.log(
    `✅ Finished capturing ${screenshots.length} screenshots at different scroll positions.`
  );
  return screenshots;
}

async function uploadScreenshotsAndSaveToSheets(
  screenshots,
  sheets,
  SPREADSHEET_ID,
  SHEET_NAME,
  startRowIndex,
  colIndex
) {
  const gyazoUrls = [];

  for (let i = 0; i < screenshots.length; i++) {
    const screenshotPath = screenshots[i];

    try {
      console.log(`📤 Uploading ${screenshotPath} to Gyazo...`);
      const gyazoUrl = await uploadToGyazo(screenshotPath);
      console.log(`✅ Uploaded to Gyazo: ${gyazoUrl}`);

      gyazoUrls.push(gyazoUrl);

      // Save to Google Sheets - each screenshot goes to a different row
      const currentRowIndex = startRowIndex + i;
      await writeSheet(
        sheets,
        SPREADSHEET_ID,
        SHEET_NAME,
        currentRowIndex,
        colIndex,
        gyazoUrl
      );
      console.log(
        `📊 Saved to Google Sheets: Row ${currentRowIndex}, Column ${String.fromCharCode(
          65 + colIndex
        )}`
      );

      // Clean up local file
      try {
        fs.unlinkSync(screenshotPath);
        console.log(`🗑️ Deleted local file: ${screenshotPath}`);
      } catch (deleteErr) {
        console.warn(
          `⚠️ Could not delete file ${screenshotPath}:`,
          deleteErr.message
        );
      }

      // Small delay between uploads to avoid rate limiting
      await humanDelay(1000, 1500);
    } catch (uploadErr) {
      console.error(
        `❌ Failed to upload ${screenshotPath}:`,
        uploadErr.message
      );
      gyazoUrls.push(null); // Add null for failed uploads
    }
  }

  return gyazoUrls;
}

function getChromePath() {
  switch (process.platform) {
    case "win32":
      return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    case "darwin":
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    default:
      return "/usr/bin/google-chrome";
  }
}

exports.runGSCScraper = async function runGSCScraper({
  SPREADSHEET_ID,
  SHEET_NAME,
 
}) {
  const sheets = await getSheetsClient(SPREADSHEET_ID);


  try {
    const browser = await puppeteer.launch({
      headless: false,
     
      args: [
        "--no-sandbox",
        "--start-maximized",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=VizDisplayCompositor",
      ],
      defaultViewport: null,
    
    });

    const page = await browser.newPage();

    // Enhanced user agent and additional stealth measures
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Remove webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    // Configuration for which row and columns to use
    const START_ROW_INDEX = 2; // Starting row (will use rows 2, 3, 4 for the 3 screenshots)
    const GSC_COL_INDEX = 0; // Column A (0-indexed)
    const AHREFS_MONTHLY_COL_INDEX = 1; // Column B (0-indexed)
    const AHREFS_AVERAGE_COL_INDEX = 2; // Column C (0-indexed)

    // 1. GSC Screenshots
    const googleServiceURL =
      "https://search.google.com/search-console/performance/search-analytics?resource_id=https%3A%2F%2Fmaidinto.ca%2F&num_of_days=28";

    console.log("🌐 Navigating to Google Search Console...");
    await page.goto(googleServiceURL, { waitUntil: "networkidle2" });
    await humanDelay(15000, 17000);

    console.log("📸 Capturing GSC screenshots...");
    const gscScreenshots = await captureScrollableContainer(
      page,
      [6, 400, 700]
    );

    // Upload GSC screenshots and save to column A (rows 2, 3, 4)
    if (gscScreenshots.length > 0) {
      console.log(
        "📤 Uploading GSC screenshots to Gyazo and saving to Google Sheets..."
      );
      const gscUrls = await uploadScreenshotsAndSaveToSheets(
        gscScreenshots,
        sheets,
        SPREADSHEET_ID, // Add this
        SHEET_NAME,
        START_ROW_INDEX,
        GSC_COL_INDEX
      );
      console.log(
        `✅ GSC: Uploaded ${
          gscUrls.filter((url) => url).length
        } screenshots to Column A, Rows ${START_ROW_INDEX}-${
          START_ROW_INDEX + gscScreenshots.length - 1
        }`
      );
    }

    await humanDelay(2000, 3000);

    // 2. Ahrefs Monthly Screenshots
    const ahrefsMonthlyURL =
      "https://app.ahrefs.com/v2-site-explorer/overview?backlinksChartMode=metrics&backlinksChartPerformanceSources=domainRating&backlinksCompetitorsSource=%22UrlRating%22&backlinksRefdomainsSource=%22RefDomainsNew%22&bestFilter=all&brandedTrafficSource=Branded&chartGranularity=daily&chartInterval=year2&competitors=&countries=&country=all&generalChartBrandedTraffic=Branded%7C%7CNon-Branded&generalChartMode=metrics&generalChartPerformanceSources=domainRating%7C%7CorganicTraffic&generalCompetitorsSource=%22OrganicTraffic%22&generalCountriesSource=organic-traffic&generalPagesByTrafficChartMode=Percentage&generalPagesByTrafficSource=Pages%7C%7CTraffic&highlightChanges=24h&intentsMainSource=informational&keywordsSource=all&mode=subdomains&organicChartBrandedTraffic=Branded%7C%7CNon-Branded&organicChartMode=metrics&organicChartPerformanceSources=impressions%7C%7CorganicTraffic%7C%7CorganicTrafficValue&organicCompetitorsSource=%22OrganicTraffic%22&organicCountriesSource=organic-traffic&organicPagesByTrafficChartMode=Percentage&organicPagesByTrafficSource=Pages%7C%7CTraffic&overview_tab=general&paidSearchPaidKeywordsByTopPositionsChartMode=Percentage&paidTrafficSources=cost%7C%7Ctraffic&target=www.attn2detail.info%2F&topLevelDomainFilter=all&topOrganicKeywordsMode=normal&topOrganicPagesMode=normal&trafficType=Organic&volume_type=monthly";

    await navigateToAhrefsWithLogin(page, ahrefsMonthlyURL);

    console.log("📸 Capturing Ahrefs Monthly screenshots...");
    const ahrefsMonthlyScreenshots = await captureScrollableContainer(
      page,
      [0, 350, 700]
    );

    // Upload Ahrefs Monthly screenshots and save to column B (rows 2, 3, 4)
    if (ahrefsMonthlyScreenshots.length > 0) {
      console.log(
        "📤 Uploading Ahrefs Monthly screenshots to Gyazo and saving to Google Sheets..."
      );
      const ahrefsMonthlyUrls = await uploadScreenshotsAndSaveToSheets(
        ahrefsMonthlyScreenshots,
        sheets,
        SPREADSHEET_ID, // Add this
        SHEET_NAME,
        START_ROW_INDEX,
        AHREFS_MONTHLY_COL_INDEX
      );
      console.log(
        `✅ Ahrefs Monthly: Uploaded ${
          ahrefsMonthlyUrls.filter((url) => url).length
        } screenshots to Column B, Rows ${START_ROW_INDEX}-${
          START_ROW_INDEX + ahrefsMonthlyScreenshots.length - 1
        }`
      );
    }

    await humanDelay(2000, 3000);

    // 3. Ahrefs Average Screenshots
    const ahrefsAverageURL =
      "https://app.ahrefs.com/v2-site-explorer/overview?backlinksChartMode=metrics&backlinksChartPerformanceSources=domainRating&backlinksCompetitorsSource=%22UrlRating%22&backlinksRefdomainsSource=%22RefDomainsNew%22&bestFilter=all&brandedTrafficSource=Branded&chartGranularity=daily&chartInterval=year2&competitors=&countries=&country=all&generalChartBrandedTraffic=Branded%7C%7CNon-Branded&generalChartMode=metrics&generalChartPerformanceSources=domainRating%7C%7CorganicTraffic&generalCompetitorsSource=%22OrganicTraffic%22&generalCountriesSource=organic-traffic&generalPagesByTrafficChartMode=Percentage&generalPagesByTrafficSource=Pages%7C%7CTraffic&highlightChanges=24h&intentsMainSource=informational&keywordsSource=all&mode=subdomains&organicChartBrandedTraffic=Branded%7C%7CNon-Branded&organicChartMode=metrics&organicChartPerformanceSources=impressions%7C%7CorganicTraffic%7C%7CorganicTrafficValue&organicCompetitorsSource=%22OrganicTraffic%22&organicCountriesSource=organic-traffic&organicPagesByTrafficChartMode=Percentage&organicPagesByTrafficSource=Pages%7C%7CTraffic&overview_tab=general&paidSearchPaidKeywordsByTopPositionsChartMode=Percentage&paidTrafficSources=cost%7C%7Ctraffic&target=www.attn2detail.info%2F&topLevelDomainFilter=all&topOrganicKeywordsMode=normal&topOrganicPagesMode=normal&trafficType=Organic&volume_type=average";

    await navigateToAhrefsWithLogin(page, ahrefsAverageURL);

    console.log("📸 Capturing Ahrefs Average screenshots...");
    const ahrefsAverageScreenshots = await captureScrollableContainer(
      page,
      [0, 350, 700]
    );

    // Upload Ahrefs Average screenshots and save to column C (rows 2, 3, 4)
    if (ahrefsAverageScreenshots.length > 0) {
      console.log(
        "📤 Uploading Ahrefs Average screenshots to Gyazo and saving to Google Sheets..."
      );
      const ahrefsAverageUrls = await uploadScreenshotsAndSaveToSheets(
        ahrefsAverageScreenshots,
        sheets,
        SPREADSHEET_ID, // Add this
        SHEET_NAME,
        START_ROW_INDEX,
        AHREFS_AVERAGE_COL_INDEX
      );
      console.log(
        `✅ Ahrefs Average: Uploaded ${
          ahrefsAverageUrls.filter((url) => url).length
        } screenshots to Column C, Rows ${START_ROW_INDEX}-${
          START_ROW_INDEX + ahrefsAverageScreenshots.length - 1
        }`
      );
    }

    console.log(
      "🎉 All screenshots captured, uploaded, and saved to Google Sheets!"
    );
    await humanDelay(2000, 3000);

    // Uncomment to automatically close browser
    await browser.close();
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error("Stack trace:", err.stack);
  }
};
