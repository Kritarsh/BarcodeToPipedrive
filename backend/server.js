import express from "express";
import axios from "axios";
import xlsx from "xlsx";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import cors from "cors";

import { addNoteToPipedrive } from "./pipedrive.js";
import {
  matchSkuWithDatabase,
  matchSkuWithDatabaseManual,
  writeUPCToSpreadsheet,
  matchDescriptionWithDatabase,
  returnProductDescription,
  getPriceForName,
} from "./skumatcher.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
console.log("Server started");

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
const PIPEDRIVE_API_URL = "https://api.pipedrive.com/v1";

// In-memory session store (for demo)
const session = {};

// --- Helper Functions ---

async function extractTrackingNumberfromBarcode(barcode) {
  let trackingNumber = barcode.includes("}")
    ? barcode.split("}")[1]?.trim()
    : barcode;
  if (!trackingNumber) throw new Error("Invalid barcode format");
  return trackingNumber;
}

async function findDealIdByTrackingNumber(trackingNumber) {
  const response = await axios.get(`${PIPEDRIVE_API_URL}/deals/search`, {
    params: { term: trackingNumber, exact_match: false },
    headers: { "x-api-token": PIPEDRIVE_API_TOKEN },
  });
  const deals = response.data.data?.items || [];
  return deals.length > 0 ? deals[0].item.id : null;
}

// --- Routes ---

// Excel file fetch
app.get("/api/excel/:filename", (req, res) => {
  const { filename } = req.params;
  console.log("Fetching file:", filename);
  const allowedFiles = [
    "Inventory Supplies 2024.xlsx",
    "MagentoInventory.xlsx",
    "Overstock supplies other companies.xlsx",
  ];
  if (!allowedFiles.includes(filename)) {
    return res.status(400).json({ error: "File not allowed" });
  }
  const filePath = join(__dirname, filename);
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: "Failed to read file" });
  }
});

// Barcode scan handler
app.post("/api/barcode", async (req, res) => {
  const { scanType, barcode, sessionId, price } = req.body;
  if (!scanType || !barcode || !sessionId) {
    return res
      .status(400)
      .json({ error: "scanType, barcode, and sessionId are required" });
  }

  try {
    if (scanType === "tracking") {
      // Before resetting, add all notes to Pipedrive for the previous session
      if (
        session[sessionId] &&
        session[sessionId].noteContent &&
        session[sessionId].dealId
      ) {
        const allNotes = session[sessionId].noteContent.join("\n");
        await addNoteToPipedrive(allNotes, session[sessionId].dealId);
      }
      // Now reset for new tracking number
      const trackingNumber = await extractTrackingNumberfromBarcode(barcode);
      const dealId = await findDealIdByTrackingNumber(trackingNumber);
      if (!dealId) {
        return res
          .status(404)
          .json({ error: "Deal not found for tracking number" });
      }
      session[sessionId] = { dealId, noteContent: [] };
      return res.json({ message: "Deal found", dealId });
    }

    if (scanType === "sku") {
      // Add SKU note and check spreadsheet
      const dealId = session[sessionId]?.dealId;
      if (!dealId) {
        return res.status(400).json({
          error: "No deal found for this session. Scan tracking number first.",
        });
      }
      const result = await matchSkuWithDatabase(barcode);
      if (!result.match) {
        return res.json({
          match: false,
          reason: result.reason,
          message: result.message,
        });
      }

      let nameForPricing =
        (result.row &&
          (result.row.Name || result.row.Description || result.row.Style)) ||
        (result.descriptionResult && result.descriptionResult.description) ||
        "";

      let calculatedPrice = 0;
      calculatedPrice = await getPriceForName(nameForPricing, req.body.qcFlaw);
      const noteContent = `SKU scanned: ${barcode}. Spreadsheet match: ${
        result.file
      } - ${
        result.row[result.matchedColumn]
      }. Price: $${calculatedPrice}. Description: ${
        result.row.Description || result.row.Name || result.row.Style || ""
      }${result.row.Size ? " Size: " + result.row.Size : ""}${
        req.body.qcFlaw === "flaw" ? " [QC Flaw]" : ""
      }`;
      // Do NOT call addNoteToPipedrive here anymore
      if (!session[sessionId].noteContent) session[sessionId].noteContent = [];
      session[sessionId].noteContent.push(noteContent);

      return res.json({
        note: result,
        noteContent: session[sessionId].noteContent,
        spreadsheetMatch: result.file,
        price: calculatedPrice,
      });
    }
  } catch (error) {
    console.error("Error processing SKU:", error);
    return res.status(500).json({ error: "Failed to process SKU" });
  }
});

// Manual reference and description fallback
app.post("/api/barcode/manual", async (req, res) => {
  const { barcode, manualRef, sessionId, description, price } = req.body;
  if (!barcode || !manualRef || !sessionId) {
    return res
      .status(400)
      .json({ error: "barcode, manualRef, and sessionId are required" });
  }

  const matchResult = await matchSkuWithDatabaseManual(barcode, manualRef);

  if (matchResult.match) {
    let nameForPricing =
      (matchResult.row &&
        (matchResult.row.Name ||
          matchResult.row.Description ||
          matchResult.row.Style)) ||
      (descriptionResult && descriptionResult.description) ||
      "";
    let calculatedPrice = 0;
    calculatedPrice = await getPriceForName(nameForPricing, req.body.qcFlaw);

    // FIX: define noteContent with const or let
    const noteContent = `SKU scanned: ${barcode}. Spreadsheet match: ${
      result.file
    } - ${
      result.row[result.matchedColumn]
    }. Price: $${calculatedPrice}. Description: ${
      result.row.Description || result.row.Name || result.row.Style || ""
    }${result.row.Size ? " Size: " + result.row.Size : ""}${
      req.body.qcFlaw === "flaw" ? " [QC Flaw]" : ""
    }`;

    let descriptionResult;
    try {
      descriptionResult = await returnProductDescription({
        file: matchResult.file,
        matchedColumn: matchResult.matchedColumn,
        rowValue: matchResult.row,
        properValue: matchResult.row[matchResult.matchedColumn],
        upc: barcode,
      });
      await writeUPCToSpreadsheet({
        file: matchResult.file,
        matchedColumn: matchResult.matchedColumn,
        rowValue: matchResult.row[matchResult.matchedColumn],
        upc: barcode,
      });
    } catch (error) {
      console.error("Error writing to spreadsheet or adding note:", error);
      return res
        .status(500)
        .json({ error: "Failed to write to spreadsheet or add note" });
    }

    return res.json({
      match: true,
      message: "SKU found and note added!",
      spreadsheetMatch: matchResult.file,
      descriptionResult: descriptionResult,
    });
  }

  // Fallback: Try matching by description if provided
  let descMatch = null;
  if (description) {
    descMatch = await matchDescriptionWithDatabase(description);
  }
  if (descMatch && descMatch.match) {
    return res.json({
      match: true,
      message: "SKU not found by manual reference, but found by description.",
      spreadsheetMatch: descMatch.file,
      descriptionMatch: true,
      row: descMatch.row,
      score: descMatch.score,
    });
  }
  return res.json({
    match: false,
    message: "SKU not found, look based on the description now.",
    reason: matchResult.reason,
    spreadsheetMatch: null,
  });
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
