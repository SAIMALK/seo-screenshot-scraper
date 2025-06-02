const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const { runScraper } = require("./newscrapper");

const app = express();
app.use(express.json());

app.post("/scrape", async (req, res) => {
  const { SPREADSHEET_ID, SHEET_NAME, GYAZO_ACCESS_TOKEN } = req.body;
console.log(req.body)
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
  const { SPREADSHEET_ID, SHEET_NAME,  } = req.body;

  if (!SPREADSHEET_ID ) {
    return res.status(400).json({ error: "Missing required credentials." });
  }

  try {
    // Import and run the GSC scraper function
    const { runGSCScraper } = require("./gsca"); // Your second script file

    await runGSCScraper({
      SPREADSHEET_ID,
      SHEET_NAME: SHEET_NAME ,
      
    });

    res.status(200).json({ message: "GSC scraping completed successfully." });
  } catch (err) {
    console.error("Error during GSC scraping:", err);
    res.status(500).json({ error: "GSC scraping failed." });
  }
});

// app.post("/pdf", async (req, res) => {
//   const {
//     SPREADSHEET_ID,
//     SHEET_NAME = "Sheet6",
//     SHEET7_NAME = "Sheet7",
//   } = req.body;

//   if (!SPREADSHEET_ID) {
//     return res.status(400).json({ error: "Missing required SPREADSHEET_ID" });
//   }
//   const { runPdfScraper } = require("./pdfGenerator"); // Your second script file


//   try {
//     const pdfPath = await runPdfScraper({
//       SPREADSHEET_ID,
//       SHEET_NAME,
//       SHEET7_NAME,
//     });

//     res.status(200).json({
//       message: "PDF generation completed successfully",
//       pdfPath: path.basename(pdfPath),
//       downloadUrl: `/download/${path.basename(pdfPath)}`,
//     });
//   } catch (err) {
//     console.error("PDF generation error:", err);
//     res
//       .status(500)
//       .json({ error: "PDF generation failed", details: err.message });
//   }
// });

// // Add this to serve generated PDFs
// app.use("/download", express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
