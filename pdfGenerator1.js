require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const PDFDocument = require("pdfkit");
const axios = require("axios");

const KEYFILEPATH = "./service-account.json";

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

async function readSheet7Data(spreadsheetId) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Sheet7!A:C",
  });
  return res.data.values || [];
}

async function downloadImage(url) {
  try {
    if (!url || url.trim() === "") return null;

    console.log(`Downloading image from: ${url}`);
    const response = await axios({
      method: "GET",
      url: url.trim(),
      responseType: "arraybuffer",
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    console.log(`Successfully downloaded image from: ${url}`);
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`Failed to download image from ${url}:`, error.message);
    return null;
  }
}

async function createPDF(sheet7Data, outputPath) {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(fs.createWriteStream(outputPath));

  // GSC Screenshots Section
  doc.fontSize(20).text("GSC Screenshots", { underline: true });
  doc.moveDown();

  for (let i = 0; i < sheet7Data.length; i++) {
    const { gscUrl } = sheet7Data[i];
    if (gscUrl && gscUrl.trim() !== "") {
      doc
        .fontSize(14)
        .fillColor("black")
        .text(`Screenshot ${i + 1}`, { underline: true });
      doc.moveDown(0.5);

      console.log(`Processing GSC image ${i + 1}: ${gscUrl}`);
      const gscImage = await downloadImage(gscUrl);

      if (gscImage) {
        try {
          doc.image(gscImage, {
            fit: [450, 300],
            align: "left",
            valign: "top",
          });
          doc.moveDown(2);
          console.log(`Added GSC image ${i + 1}`);
        } catch (error) {
          console.error(`Error adding GSC image ${i + 1}:`, error.message);
          doc.fontSize(10).fillColor("red").text(`Failed to load GSC image`);
          doc.fontSize(10).fillColor("blue").text(gscUrl, { link: gscUrl });
          doc.moveDown();
        }
      } else {
        doc
          .fontSize(10)
          .fillColor("blue")
          .text(`GSC Link: ${gscUrl}`, { link: gscUrl });
        doc.moveDown();
      }

      // Add page break if needed
      if ((i + 1) % 2 === 0) {
        doc.addPage();
      }
    }
  }

  // Ahrefs Average Screenshots Section
  doc.addPage();
  doc
    .fontSize(20)
    .fillColor("black")
    .text("Ahrefs Monthly Screenshots", { underline: true });
  doc.moveDown();

  for (let i = 0; i < sheet7Data.length; i++) {
    const { ahrefsAvgUrl } = sheet7Data[i];
    if (ahrefsAvgUrl && ahrefsAvgUrl.trim() !== "") {
      doc
        .fontSize(14)
        .fillColor("black")
        .text(`Screenshot ${i + 1}`, { underline: true });
      doc.moveDown(0.5);

      console.log(`Processing Ahrefs Average image ${i + 1}: ${ahrefsAvgUrl}`);
      const ahrefsAvgImage = await downloadImage(ahrefsAvgUrl);

      if (ahrefsAvgImage) {
        try {
          doc.image(ahrefsAvgImage, {
            fit: [450, 300],
            align: "left",
            valign: "top",
          });
          doc.moveDown(2);
          console.log(`Added Ahrefs Average image ${i + 1}`);
        } catch (error) {
          console.error(
            `Error adding Ahrefs Average image ${i + 1}:`,
            error.message
          );
          doc
            .fontSize(10)
            .fillColor("red")
            .text(`Failed to load Ahrefs Average image`);
          doc
            .fontSize(10)
            .fillColor("blue")
            .text(ahrefsAvgUrl, { link: ahrefsAvgUrl });
          doc.moveDown();
        }
      } else {
        doc
          .fontSize(10)
          .fillColor("blue")
          .text(`Ahrefs Average Link: ${ahrefsAvgUrl}`, { link: ahrefsAvgUrl });
        doc.moveDown();
      }

      // Add page break if needed
      if ((i + 1) % 2 === 0) {
        doc.addPage();
      }
    }
  }

  // Ahrefs Monthly Screenshots Section
  doc.addPage();
  doc
    .fontSize(20)
    .fillColor("black")
    .text("Ahrefs Average Screenshots", { underline: true });
  doc.moveDown();

  for (let i = 0; i < sheet7Data.length; i++) {
    const { ahrefsMonthlyUrl } = sheet7Data[i];
    if (ahrefsMonthlyUrl && ahrefsMonthlyUrl.trim() !== "") {
      doc
        .fontSize(14)
        .fillColor("black")
        .text(`Screenshot ${i + 1}`, { underline: true });
      doc.moveDown(0.5);

      console.log(
        `Processing Ahrefs Monthly image ${i + 1}: ${ahrefsMonthlyUrl}`
      );
      const ahrefsMonthlyImage = await downloadImage(ahrefsMonthlyUrl);

      if (ahrefsMonthlyImage) {
        try {
          doc.image(ahrefsMonthlyImage, {
            fit: [450, 300],
            align: "left",
            valign: "top",
          });
          doc.moveDown(2);
          console.log(`Added Ahrefs Monthly image ${i + 1}`);
        } catch (error) {
          console.error(
            `Error adding Ahrefs Monthly image ${i + 1}:`,
            error.message
          );
          doc
            .fontSize(10)
            .fillColor("red")
            .text(`Failed to load Ahrefs Monthly image`);
          doc
            .fontSize(10)
            .fillColor("blue")
            .text(ahrefsMonthlyUrl, { link: ahrefsMonthlyUrl });
          doc.moveDown();
        }
      } else {
        doc
          .fontSize(10)
          .fillColor("blue")
          .text(`Ahrefs Monthly Link: ${ahrefsMonthlyUrl}`, {
            link: ahrefsMonthlyUrl,
          });
        doc.moveDown();
      }

      // Add page break if needed
      if ((i + 1) % 2 === 0) {
        doc.addPage();
      }
    }
  }

  doc.end();
  console.log(`PDF created at: ${outputPath}`);
}

async function main() {
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!spreadsheetId) {
    console.error("Missing SPREADSHEET_ID in .env");
    return;
  }

  try {
    console.log("Reading Sheet7 data...");
    const sheet7Rows = await readSheet7Data(spreadsheetId);

    const sheet7Data = [];

    // Process Sheet7 data (A=GSC, B=Ahrefs Average, C=Ahrefs Monthly)
    for (let i = 1; i < sheet7Rows.length; i++) {
      const [gscUrl, ahrefsAvgUrl, ahrefsMonthlyUrl] = sheet7Rows[i];

      sheet7Data.push({
        gscUrl: gscUrl ? gscUrl.trim() : "",
        ahrefsAvgUrl: ahrefsAvgUrl ? ahrefsAvgUrl.trim() : "",
        ahrefsMonthlyUrl: ahrefsMonthlyUrl ? ahrefsMonthlyUrl.trim() : "",
      });
    }

    console.log(`Found ${sheet7Data.length} rows in Sheet7`);

    const outputPath = path.join(__dirname, "sheet7_screenshots_report.pdf");
    await createPDF(sheet7Data, outputPath);
  } catch (err) {
    console.error("Error generating PDF:", err);
  }
}

main();
