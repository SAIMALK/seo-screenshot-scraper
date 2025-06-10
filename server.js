const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const { runScraper } = require("./newscrapper");

const app = express();
app.use(express.json());

app.post("/scrape", async (req, res) => {
  const { SPREADSHEET_ID, SHEET_NAME, GYAZO_ACCESS_TOKEN } = req.query;
console.log(req.query);
  if (!SPREADSHEET_ID || !GYAZO_ACCESS_TOKEN) {
    return res.status(400).json({ error: "Missing required credentials." });
  }

  try {
    await runScraper({
      SPREADSHEET_ID,
      SHEET_NAME: SHEET_NAME ,
      GYAZO_ACCESS_TOKEN,
    });

    res.status(200).json({ message: "Scraping completed successfully." });
  } catch (err) {
    console.error("Error during scraping:", err);
    res.status(500).json({ error: "Scraping failed." });
  }
});
app.post("/gsc", async (req, res) => {
  const { SPREADSHEET_ID, SHEET_NAME,website } = req.query;
console.log(req.query);
  if (!SPREADSHEET_ID ) {
    return res.status(400).json({ error: "Missing required credentials." });
  }

  try {
    // Import and run the GSC scraper function
    const { runGSCScraper } = require("./gsca"); // Your second script file

    await runGSCScraper({
      SPREADSHEET_ID: SPREADSHEET_ID,
      SHEET_NAME: SHEET_NAME,
      website: website,
    });

    res.status(200).json({ message: "GSC scraping completed successfully." });
  } catch (err) {
    console.error("Error during GSC scraping:", err);
    res.status(500).json({ error: "GSC scraping failed." });
  }
});


app.get("/", (req, res) => {
  res.send("API is running...");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
