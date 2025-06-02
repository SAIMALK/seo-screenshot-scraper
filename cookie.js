const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");

puppeteer.use(StealthPlugin());

async function humanDelay(min, max) {
  const delay = Math.random() * (max - min) + min;
  return new Promise((res) => setTimeout(res, delay));
}

// Enhanced scroll function targeting the GSC data table specifically


(async () => {
  const userDataDir = path.join(__dirname, "google-session");

  try {
    const browser = await puppeteer.launch({
      headless: false,
      userDataDir,
      args: ["--no-sandbox", "--start-maximized"],
      defaultViewport: null,
      executablePath: getChromePath(),
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
    );

    const googleServiceURL =
      "https://search.google.com/search-console/performance/search-analytics?resource_id=https%3A%2F%2Fmaidinto.ca%2F&last_24_hours=true";

    console.log("🌐 Navigating to Google Search Console...");
    await page.goto(googleServiceURL, { waitUntil: "networkidle2" });

    // Wait for content to load
    await humanDelay(3000, 5000);

    // Verify the scroll actually worked by checking scroll position


async function captureScrollableContainer(
  page,
  scrollIntervals = [5, 350, 700], // Array of specific scroll positions
  delay = 1000
) {
  const screenshots = [];

  // Find the scrollable container
  const containerInfo = await page.evaluate(() => {
    const scrollable = [...document.querySelectorAll("*")].find(
      (el) =>
        el.scrollHeight > el.clientHeight &&
        el.clientHeight > 300 &&
        el.querySelector("table")
    );
    if (!scrollable) return null;

    return {
      selector: scrollable.className
        ? `.${scrollable.className.split(" ").join(".")}`
        : scrollable.tagName.toLowerCase(),
      scrollHeight: scrollable.scrollHeight,
      clientHeight: scrollable.clientHeight,
    };
  });

  if (!containerInfo || !containerInfo.selector) {
    console.log("⚠️ Could not identify scrollable container.");
    return screenshots;
  }

  console.log("📦 Scrollable container detected:", containerInfo.selector);
  console.log(`📏 Container dimensions: ${containerInfo.clientHeight}px visible, ${containerInfo.scrollHeight}px total`);
  console.log(`📍 Scroll positions to capture: [${scrollIntervals.join(', ')}]px`);

  // Capture screenshots at each specified scroll position
  for (let i = 0; i < scrollIntervals.length; i++) {
    const scrollPosition = scrollIntervals[i];
    
    // Skip positions that exceed the scrollable area
    if (scrollPosition > containerInfo.scrollHeight - containerInfo.clientHeight) {
      console.log(`⏭️ Skipping position ${scrollPosition}px (exceeds scrollable area)`);
      continue;
    }

    console.log(`📍 Scrolling to position: ${scrollPosition}px`);
    
    // Scroll to the specified position
    await page.evaluate(
      (selector, pos) => {
        const container = document.querySelector(selector);
        if (container) {
          container.scrollTop = pos;
          // Force scroll persistence
          setTimeout(() => {
            container.scrollTop = pos;
          }, 50);
        }
      },
      containerInfo.selector,
      scrollPosition
    );

    // Wait for content to load/render
    await humanDelay(delay, delay + 500);

    // Take screenshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotPath = `scroll-capture-${scrollPosition}px-${i}-${timestamp}.png`;    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    screenshots.push(screenshotPath);
  }

  console.log(`✅ Finished capturing ${screenshots.length} screenshots at different scroll positions.`);
  return screenshots;
}
await captureScrollableContainer(page,[6,420,750]);
await humanDelay(1000, 2000);
const ahrefsMonthlyURL =
  "https://app.ahrefs.com/v2-site-explorer/overview?backlinksChartMode=metrics&backlinksChartPerformanceSources=domainRating&backlinksCompetitorsSource=%22UrlRating%22&backlinksRefdomainsSource=%22RefDomainsNew%22&bestFilter=all&brandedTrafficSource=Branded&chartGranularity=daily&chartInterval=year2&competitors=&countries=&country=all&generalChartBrandedTraffic=Branded%7C%7CNon-Branded&generalChartMode=metrics&generalChartPerformanceSources=domainRating%7C%7CorganicTraffic&generalCompetitorsSource=%22OrganicTraffic%22&generalCountriesSource=organic-traffic&generalPagesByTrafficChartMode=Percentage&generalPagesByTrafficSource=Pages%7C%7CTraffic&highlightChanges=24h&intentsMainSource=informational&keywordsSource=all&mode=subdomains&organicChartBrandedTraffic=Branded%7C%7CNon-Branded&organicChartMode=metrics&organicChartPerformanceSources=impressions%7C%7CorganicTraffic%7C%7CorganicTrafficValue&organicCompetitorsSource=%22OrganicTraffic%22&organicCountriesSource=organic-traffic&organicPagesByTrafficChartMode=Percentage&organicPagesByTrafficSource=Pages%7C%7CTraffic&overview_tab=general&paidSearchPaidKeywordsByTopPositionsChartMode=Percentage&paidTrafficSources=cost%7C%7Ctraffic&target=www.attn2detail.info%2F&topLevelDomainFilter=all&topOrganicKeywordsMode=normal&topOrganicPagesMode=normal&trafficType=Organic&volume_type=monthly";

https: console.log("🌐 Navigating to ahrefs monthly...");
await page.goto(ahrefsMonthlyURL, { waitUntil: "networkidle2" });
await humanDelay(2000, 3000);
await captureScrollableContainer(page, [0, 350, 700]);

await humanDelay(1000, 2000);
const ahrefsAverageURL =
  "https://app.ahrefs.com/v2-site-explorer/overview?backlinksChartMode=metrics&backlinksChartPerformanceSources=domainRating&backlinksCompetitorsSource=%22UrlRating%22&backlinksRefdomainsSource=%22RefDomainsNew%22&bestFilter=all&brandedTrafficSource=Branded&chartGranularity=daily&chartInterval=year2&competitors=&countries=&country=all&generalChartBrandedTraffic=Branded%7C%7CNon-Branded&generalChartMode=metrics&generalChartPerformanceSources=domainRating%7C%7CorganicTraffic&generalCompetitorsSource=%22OrganicTraffic%22&generalCountriesSource=organic-traffic&generalPagesByTrafficChartMode=Percentage&generalPagesByTrafficSource=Pages%7C%7CTraffic&highlightChanges=24h&intentsMainSource=informational&keywordsSource=all&mode=subdomains&organicChartBrandedTraffic=Branded%7C%7CNon-Branded&organicChartMode=metrics&organicChartPerformanceSources=impressions%7C%7CorganicTraffic%7C%7CorganicTrafficValue&organicCompetitorsSource=%22OrganicTraffic%22&organicCountriesSource=organic-traffic&organicPagesByTrafficChartMode=Percentage&organicPagesByTrafficSource=Pages%7C%7CTraffic&overview_tab=general&paidSearchPaidKeywordsByTopPositionsChartMode=Percentage&paidTrafficSources=cost%7C%7Ctraffic&target=www.attn2detail.info%2F&topLevelDomainFilter=all&topOrganicKeywordsMode=normal&topOrganicPagesMode=normal&trafficType=Organic&volume_type=average";

https: console.log("🌐 Navigating to ahrefs average...");
await page.goto(ahrefsAverageURL, { waitUntil: "networkidle2" });
await humanDelay(2000, 3000);
await captureScrollableContainer(page, [0, 350, 700]);
    // Debug: Get information about scrollable elements
    console.log("🚀 Browser will remain open. Press Ctrl+C to exit.");
    await humanDelay(1000, 2000);
    // await browser.close();
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();

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
