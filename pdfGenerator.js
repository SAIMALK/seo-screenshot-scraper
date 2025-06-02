// pdfGenerator.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const PDFDocument = require("pdfkit");
const axios = require("axios");

const KEYFILEPATH = "./service-account.json";

// === Google Sheets Auth ===
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

// === Read Sheet7 (A:C) ===
async function readSheet7Data(spreadsheetId, sheet7Name) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheet7Name}!A:C`,
  });
  return res.data.values || [];
}

// === Read Sheet6 (A:E) ===
async function readSheetData(spreadsheetId, sheetName) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:E`,
  });
  return res.data.values || [];
}

// === Download Image Helper ===
async function downloadImage(url) {
  try {
    if (!url || url.trim() === "") return null;

    const response = await axios({
      method: "GET",
      url: url.trim(),
      responseType: "arraybuffer",
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    return Buffer.from(response.data);
  } catch (error) {
    console.error(`Failed to download image from ${url}:`, error.message);
    return null;
  }
}

// === Create Combined PDF ===
async function createCombinedPDF(
  sheet7Data,
  overviewData,
  rankingData,
  outputPath
) {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(fs.createWriteStream(outputPath));

  // --- Sheet7: GSC ---
  doc.fontSize(20).text("GSC Screenshots", { underline: true });
  doc.moveDown();

  for (let i = 0; i < sheet7Data.length; i++) {
    const { gscUrl } = sheet7Data[i];
    if (!gscUrl) continue;

    doc.fontSize(14).text(`Screenshot ${i + 1}`, { underline: true });
    doc.moveDown(0.5);

    const image = await downloadImage(gscUrl);
    if (image) {
      try {
        doc.image(image, { fit: [450, 300], align: "left", valign: "top" });
      } catch {
        doc.fontSize(10).fillColor("red").text("Failed to load image");
      }
    }
    doc.moveDown(2);
    if ((i + 1) % 2 === 0) doc.addPage();
  }

  // --- Sheet7: Ahrefs Average ---
  doc.addPage();
  doc.fontSize(20).text("Ahrefs Average Screenshots", { underline: true });
  doc.moveDown();

  for (let i = 0; i < sheet7Data.length; i++) {
    const { ahrefsAvgUrl } = sheet7Data[i];
    if (!ahrefsAvgUrl) continue;

    doc.fontSize(14).text(`Screenshot ${i + 1}`, { underline: true });
    doc.moveDown(0.5);

    const image = await downloadImage(ahrefsAvgUrl);
    if (image) {
      try {
        doc.image(image, { fit: [450, 300] });
      } catch {
        doc.fontSize(10).fillColor("red").text("Failed to load image");
      }
    }
    doc.moveDown(2);
    if ((i + 1) % 2 === 0) doc.addPage();
  }

  // --- Sheet7: Ahrefs Monthly ---
  doc.addPage();
  doc.fontSize(20).text("Ahrefs Monthly Screenshots", { underline: true });
  doc.moveDown();

  for (let i = 0; i < sheet7Data.length; i++) {
    const { ahrefsMonthlyUrl } = sheet7Data[i];
    if (!ahrefsMonthlyUrl) continue;

    doc.fontSize(14).text(`Screenshot ${i + 1}`, { underline: true });
    doc.moveDown(0.5);

    const image = await downloadImage(ahrefsMonthlyUrl);
    if (image) {
      try {
        doc.image(image, { fit: [450, 300] });
      } catch {
        doc.fontSize(10).fillColor("red").text("Failed to load image");
      }
    }
    doc.moveDown(2);
    if ((i + 1) % 2 === 0) doc.addPage();
  }

  // --- Sheet6: Overview Section ---
  doc.addPage();
  doc
    .fontSize(18)
    .fillColor("black")
    .text("Rankings in Google's AI Overview", { underline: true });
  doc.moveDown();

  overviewData.forEach(({ keyword, gyazoUrl }) => {
    doc.fontSize(12).fillColor("black").text(keyword);
    doc
      .fontSize(10)
      .fillColor("blue")
      .text(gyazoUrl, { link: gyazoUrl, underline: true });
    doc.moveDown();
  });

  // --- Sheet6: Ranking Report Section ---
  doc.addPage();
  doc
    .fontSize(18)
    .fillColor("black")
    .text("Google Search Ranking Report", { underline: true });
  doc.moveDown();

  rankingData.forEach(({ keyword, rank, gyazoUrl }) => {
    doc.fontSize(12).fillColor("black").text(`${keyword} ranks at #${rank}`);
    doc
      .fontSize(10)
      .fillColor("blue")
      .text(gyazoUrl, { link: gyazoUrl, underline: true });
    doc.moveDown();
  });

  doc.end();
  return new Promise((resolve) => {
    doc.on("end", () => resolve(outputPath));
  });
}

// === Main Function ===
async function runPdfScraper({
  SPREADSHEET_ID,
  SHEET_NAME,
  SHEET7_NAME,
}) {
  if (!SPREADSHEET_ID) {
    throw new Error("Missing SPREADSHEET_ID");
  }

  try {
    // === Get Sheet7 Data ===
    console.log(`Reading ${SHEET7_NAME} data...`);
    const sheet7Rows = await readSheet7Data(SPREADSHEET_ID, SHEET7_NAME);
    const sheet7Data = sheet7Rows
      .slice(1)
      .map(([gscUrl, ahrefsAvgUrl, ahrefsMonthlyUrl]) => ({
        gscUrl: gscUrl?.trim() || "",
        ahrefsAvgUrl: ahrefsAvgUrl?.trim() || "",
        ahrefsMonthlyUrl: ahrefsMonthlyUrl?.trim() || "",
      }));

    // === Get Sheet6 Data ===
    console.log(`Reading ${SHEET_NAME} data...`);
    const sheet6Rows = await readSheetData(SPREADSHEET_ID, SHEET_NAME);

    const overviewData = [];
    const rankingData = [];

    for (let i = 1; i < sheet6Rows.length; i++) {
      const [keyword, , , gyazoUrl, rank] = sheet6Rows[i];
      if (!keyword || !gyazoUrl) continue;

      const cleanedKeyword = keyword.trim();
      const cleanedGyazo = gyazoUrl.trim();
      const cleanedRank = rank?.trim();

      if (cleanedRank) {
        rankingData.push({
          keyword: cleanedKeyword,
          rank: cleanedRank,
          gyazoUrl: cleanedGyazo,
        });
      } else {
        overviewData.push({ keyword: cleanedKeyword, gyazoUrl: cleanedGyazo });
      }
    }

    // === Create Combined PDF ===
    const outputPath = path.join(__dirname, "combined_report.pdf");
    const pdfPath = await createCombinedPDF(
      sheet7Data,
      overviewData,
      rankingData,
      outputPath
    );

    console.log(`PDF created at: ${pdfPath}`);
    return pdfPath;
  } catch (err) {
    console.error("Error generating combined PDF:", err);
    throw err;
  }
}

module.exports = { runPdfScraper };
