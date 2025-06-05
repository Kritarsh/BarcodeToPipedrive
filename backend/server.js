import express from "express";
import axios from "axios";
import xlsx from "xlsx";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { createClient } from "redis";

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
const redisClient = createClient({
  username: "default",
  password: "3mkjobNOBXgrGxovQZrjMlWj8dVSl6pW",
  socket: {
    host: "redis-11587.c57.us-east-1-4.ec2.redns.redis-cloud.com",
    port: 11587,
  },
});

redisClient.on("error", (err) => console.log("Redis Client Error", err));

await redisClient.connect();

// --- Helper Functions ---
async function getSession(sessionId) {
  const data = await redisClient.get(sessionId);
  return data ? JSON.parse(data) : {};
}

async function setSession(sessionId, data) {
  await redisClient.set(sessionId, JSON.stringify(data));
}
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

function qcFlawLabel(value) {
  switch (value) {
    case "flaw":
      return "Missing Part";
    case "damaged":
      return "Damaged";
    case "other":
      return "Not in Original Packaging";
    case "none":
      return "No Flaw";
    default:
      return value;
  }
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
  const { scanType, barcode, sessionId, price, serialNumber, qcFlaw } =
    req.body;
  if (!scanType || !barcode || !sessionId) {
    return res
      .status(400)
      .json({ error: "scanType, barcode, and sessionId are required" });
  }

  try {
    if (scanType === "tracking") {
      const oldSession = await getSession(sessionId);
      if (
        oldSession &&
        oldSession.noteContent &&
        oldSession.noteContent.length > 0 &&
        oldSession.dealId
      ) {
        const allNotes = oldSession.noteContent.join("\n");
        const total = oldSession.prices
          ? oldSession.prices.reduce((acc, price) => acc + price, 0)
          : 0;
        const allNotesWithTotal = `${allNotes}\nTotal Price: $${total.toFixed(
          2
        )}`;
        await addNoteToPipedrive(allNotesWithTotal, oldSession.dealId);
      }
      // Now reset for new tracking number
      const trackingNumber = await extractTrackingNumberfromBarcode(barcode);
      const dealId = await findDealIdByTrackingNumber(trackingNumber);
      if (!dealId) {
        return res
          .status(404)
          .json({ error: "Deal not found for tracking number" });
      }
      await setSession(sessionId, { dealId, noteContent: [], prices: [] });
      return res.json({ message: "Deal found", dealId });
    }

    if (scanType === "sku") {
      const currentSession = await getSession(sessionId);
      const dealId = currentSession?.dealId;
      if (!dealId) {
        return res.status(400).json({
          error: "No deal found for this session. Scan tracking number first.",
        });
      }
      // Add SKU note and check spreadsheet
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
      const noteContent = `Price: $${calculatedPrice}. Description: ${
        result.row.Description || result.row.Name || result.row.Style || ""
      }${result.row.Size ? " Size: " + result.row.Size : ""}${
        req.body.qcFlaw && req.body.qcFlaw !== "none"
          ? ` [Flaw: ${qcFlawLabel(req.body.qcFlaw)}]`
          : ""
      }${serialNumber ? ` Serial Number: ${serialNumber}` : ""}`; // <-- Add this line
      if (!currentSession.noteContent) currentSession.noteContent = [];
      currentSession.noteContent.push(noteContent);

      if (!currentSession.prices) currentSession.prices = [];
      currentSession.prices.push(calculatedPrice);

      await setSession(sessionId, currentSession);

      return res.json({
        note: result,
        noteContent: currentSession.noteContent,
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
      req.body.qcFlaw && req.body.qcFlaw !== "none"
        ? ` [Flaw: ${qcFlawLabel(req.body.qcFlaw)}]`
        : ""
    }`;
    if (!session[sessionId]) session[sessionId] = { noteContent: [] };
    if (!session[sessionId].noteContent) session[sessionId].noteContent = [];
    session[sessionId].noteContent.push(noteContent);

    // After pushing noteContent
    if (!session[sessionId].prices) session[sessionId].prices = [];
    session[sessionId].prices.push(calculatedPrice);

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
