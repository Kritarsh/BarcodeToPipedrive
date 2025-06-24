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
  writeUPCToMongoDB,
  returnProductDescription,
  getPriceForName,
  appendMachineSpecific,
  incrementSupplyQuantity,
} from "./skuMatcher.js";
import mongoose from "mongoose";
import Inventory from "./models/Inventory.js";
import Overstock from "./models/Overstock.js";
import MachineSpecific from "./models/MachineSpecific.js";

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

// Connect to MongoDB
mongoose
  .connect(
    "mongodb+srv://kritarshn:e73pqJ8RwJpUuiOo@cluster0.bvizlpw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

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
      return value;  }
}

// --- Routes ---

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
        oldSession.skuEntries &&
        oldSession.skuEntries.length > 0 &&
        oldSession.dealId
      ) {
        // Group items by description, size, flaw, and serialNumber (if present)
        const grouped = {};

        for (const entry of oldSession.skuEntries) {
          // Key includes description, size, flaw, and serialNumber if present
          const key = [
            entry.description,
            entry.size,
            entry.qcFlaw,
            entry.serialNumber || "",
          ].join("|");

          if (!grouped[key]) {
            grouped[key] = { ...entry, count: 0, subtotal: 0 };
          }
          grouped[key].count += 1;
          grouped[key].subtotal += Number(entry.price) || 0;
        }

        // Build summary strings with subtotals
        const lines = Object.values(grouped).map((item) => {
          let line = `${item.count} × ${item.description}`;
          if (item.size) line += ` Size: ${item.size}`;
          if (item.qcFlaw && item.qcFlaw !== "none")
            line += ` [Flaw: ${qcFlawLabel(item.qcFlaw)}]`;
          if (item.serialNumber) line += ` Serial: ${item.serialNumber}`;
          line += ` — Subtotal: $${item.subtotal.toFixed(2)}`;
          return line;
        });

        const total =
          oldSession.skuEntries.reduce(
            (sum, entry) => sum + (Number(entry.price) || 0),
            0
          ) || 0;

        const allNotesWithTotal = [
          ...lines,
          `Total Price: $${total.toFixed(2)}`,
        ]
          .filter(Boolean)
          .join("\n");

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
      await setSession(sessionId, {
        dealId,
        noteContent: [],
        prices: [],
        skuEntries: [],
      });
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

      const machineKeywords = [
        "AirSense 10",
        "AirSense 11",
        "AirCurve VAuto",
        "AirCurve ASV",
        "AirCurve ST",
        "Trilogy Evo",
        "AirMini AutoSet",
        "Astral",
        "Series 9 AutoSet",
        "Series 9 CPAP",
        "Series 9 BiPAP",
        "Series 9 Elite",
      ];
      const isMachine = machineKeywords.some((keyword) =>
        barcode.toLowerCase().includes(keyword.toLowerCase())
      );

      if (isMachine) {
        // Get price for the machine
        const machinePrice = await getPriceForName(barcode, qcFlaw);

        // Add to Excel
        appendMachineSpecific({
          name: barcode,
          upc: barcode,
          serialNumber: serialNumber || "",
          quantity: 1,
          date: new Date(),
        });

        // Add to session noteContent and skuEntries
        const machineNote = `Machine: ${barcode}${
          serialNumber ? ` Serial Number: ${serialNumber}` : ""
        }. Price: $${machinePrice}`;
        if (!currentSession.noteContent) currentSession.noteContent = [];
        currentSession.noteContent.push(machineNote);

        if (!currentSession.skuEntries) currentSession.skuEntries = [];
        currentSession.skuEntries.push({
          description: barcode,
          size: "",
          qcFlaw: qcFlaw,
          serialNumber: serialNumber || "",
          price: machinePrice,
          isMachine: true,
        });

        if (!currentSession.prices) currentSession.prices = [];
        currentSession.prices.push(machinePrice);

        await setSession(sessionId, currentSession);

        return res.json({
          spreadsheetMatch: null,
          price: machinePrice,
          message: "Machine added and note attached!",
        });
      }

      // Only now do the UPC lookup for supplies
      const result = await matchSkuWithDatabase(barcode);
      if (!result.match) {
        return res.json({
          match: false,
          reason: result.reason,
          message: result.message,
        });
      }

      const name = result.row.Name || result.row.Description || result.row.Style || "";
      const size = result.row.Size || "";
      const upc = barcode;

      // Supplies: increment quantity in the correct spreadsheet
      incrementSupplyQuantity({
        collection: result.collection,
        name,
        upc,
        size,
        quantity: 1,
        date: new Date(),
      });

      let calculatedPrice = 0;
      calculatedPrice = await getPriceForName(name, qcFlaw);

      const noteContent = `SKU scanned: ${barcode}. Spreadsheet match: ${
        result.collection
      } - ${name}. Price: $${calculatedPrice}. Description: ${
        result.row.Description || result.row.Name || result.row.Style || ""
      }`;

      if (!currentSession.noteContent) currentSession.noteContent = [];
      currentSession.noteContent.push(noteContent);

      if (!currentSession.prices) currentSession.prices = [];
      currentSession.prices.push(calculatedPrice);

      // When adding a SKU scan to the session:
      if (!currentSession.skuEntries) currentSession.skuEntries = [];
      currentSession.skuEntries.push({
        description: result.row.Description || result.row.Name || result.row.Style || "",
        size: result.row.Size || "",
        qcFlaw: req.body.qcFlaw,
        serialNumber: serialNumber || "",
        price: calculatedPrice,
        collection: result.collection, // Add this for undo functionality
        upc: barcode, // Add this for undo functionality
      });

      await setSession(sessionId, currentSession);

      // ADD THIS BLOCK - Get description result like in manual case
      let descriptionResult;
      try {
        descriptionResult = await returnProductDescription({
          collection: result.collection,
          matchedColumn: result.matchedColumn,
          rowValue: result.row,
          properValue: result.row[result.matchedColumn],
          upc: barcode,
        });
        await writeUPCToMongoDB({
          collection: result.collection,
          matchedColumn: result.matchedColumn,
          rowValue: result.row[result.matchedColumn],
          upc: barcode,
        });
      } catch (error) {
        console.error("Error writing to spreadsheet or adding note:", error);
        // Don't return error here, just log it
      }

      return res.json({
        note: result,
        noteContent: currentSession.noteContent,
        spreadsheetMatch: result.collection,
        price: calculatedPrice,
        descriptionResult: descriptionResult || {}, // ADD THIS LINE
        row: result.row, // ADD THIS LINE for frontend access
      });
    }
  } catch (error) {
    console.error("Error processing SKU:", error);
    return res.status(500).json({ error: "Failed to process SKU" });
  }
});

// Manual reference and description fallback
app.post("/api/barcode/manual", async (req, res) => {
  console.log("Manual barcode scan request:", req.body);
  const {
    barcode,
    manualRef,
    sessionId,
    description,
    price,
    serialNumber,
    qcFlaw,
  } = req.body;
  if (!barcode || !manualRef || !sessionId) {
    return res
      .status(400)
      .json({ error: "barcode, manualRef, and sessionId are required" });
  }

  const currentSession = await getSession(sessionId);
  const matchResult = await matchSkuWithDatabaseManual(barcode, manualRef);

  if (matchResult.match) {
    let nameForPricing =
      (matchResult.row &&
        (matchResult.row.Name ||
          matchResult.row.Description ||
          matchResult.row.Style)) ||
      "";
    let calculatedPrice = 0;
    calculatedPrice = await getPriceForName(nameForPricing, qcFlaw);

    const noteContent = `SKU scanned: ${barcode}. Spreadsheet match: ${
      matchResult.file
    } - ${
      matchResult.row[matchResult.matchedColumn]
    }. Price: $${calculatedPrice}. Description: ${
      matchResult.row.Description ||
      matchResult.row.Name ||
      matchResult.row.Style ||
      ""
    }${matchResult.row.Size ? " Size: " + matchResult.row.Size : ""}${
      qcFlaw && qcFlaw !== "none" ? ` [Flaw: ${qcFlawLabel(qcFlaw)}]` : ""
    }${serialNumber ? ` Serial Number: ${serialNumber}` : ""}`;

    if (!currentSession.noteContent) currentSession.noteContent = [];
    currentSession.noteContent.push(noteContent);

    if (!currentSession.prices) currentSession.prices = [];
    currentSession.prices.push(calculatedPrice);

    // Optionally add to skuEntries as well
    if (!currentSession.skuEntries) currentSession.skuEntries = [];
    currentSession.skuEntries.push({
      description:
        matchResult.row.Description ||
        matchResult.row.Name ||
        matchResult.row.Style ||
        "",
      size: matchResult.row.Size || "",
      qcFlaw: qcFlaw,
      serialNumber: serialNumber || "",
      price: calculatedPrice,
    });

    await setSession(sessionId, currentSession);

    let descriptionResult;
    try {
      descriptionResult = await returnProductDescription({
        collection: matchResult.collection,
        matchedColumn: matchResult.matchedColumn,
        rowValue: matchResult.row,
        properValue: matchResult.row[matchResult.matchedColumn],
        upc: barcode,
      });
      await writeUPCToMongoDB({
        collection: matchResult.collection,
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
      spreadsheetMatch: !!matchResult.collection,
      price: calculatedPrice,
      descriptionResult: descriptionResult || {},
      noteContent: currentSession.noteContent,
    });
  }

  // If no match, return a response so frontend can prompt for new product
  return res.status(404).json({
    match: false,
    message: "SKU not found even with the manual reference.",
  });
});

// New endpoint to fetch inventory data from MongoDB
app.get("/api/inventory", async (req, res) => {
  try {
    const inventoryData = await Inventory.find();
    res.json({ data: inventoryData });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch inventory data" });
  }
});

// New endpoint to fetch overstock data from MongoDB
app.get("/api/overstock", async (req, res) => {
  try {
    const overstockData = await Overstock.find();
    res.json({ data: overstockData });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch overstock data" });
  }
});

// New endpoint to fetch machine specifics data from MongoDB
app.get("/api/machine-specifics", async (req, res) => {
  try {
    const machineSpecificsData = await MachineSpecific.find();
    res.json({ data: machineSpecificsData });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch machine specifics data" });
  }
});

// New endpoint to add a product manually
app.post("/api/product/new", async (req, res) => {
  const {
    barcode,
    description,
    size,
    price,
    qcFlaw,
    manualRef,
    sessionId,
    serialNumber,
  } = req.body;
  if (!barcode || !description || !sessionId) {
    return res
      .status(400)
      .json({ error: "barcode, description, and sessionId are required" });
  }

  try {
    // Add to MongoDB Inventory
    const newProduct = new Overstock({
      RefNum: manualRef || "", // <-- set RefNum here
      UPC: barcode,
      Style: description,
      Size: size || "",
      Price: price || 0,
      qcFlaw: qcFlaw || "none",
      Date: new Date(),
      Quantity: 0,
    });
    await newProduct.save();

    // Optionally update session
    const currentSession = await getSession(sessionId);
    if (!currentSession.skuEntries) currentSession.skuEntries = [];
    currentSession.skuEntries.push({
      description,
      size: size || "",
      qcFlaw: qcFlaw || "none",
      serialNumber: serialNumber || "",
      price: price || 0,
      isManual: true,
    });
    await setSession(sessionId, currentSession);

    return res.json({ message: "Product added!", product: newProduct });
  } catch (err) {
    console.error("Error adding new product:", err);
    return res.status(500).json({ error: "Failed to add new product" });
  }
});

// Add undo endpoint
app.post("/api/barcode/undo", async (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  try {
    const currentSession = await getSession(sessionId);
    
    if (!currentSession || !currentSession.skuEntries || currentSession.skuEntries.length === 0) {
      return res.status(400).json({ error: "No items to undo" });
    }

    // Get the last entry to undo
    const lastEntry = currentSession.skuEntries.pop();
    
    // Remove the last note content if it exists
    if (currentSession.noteContent && currentSession.noteContent.length > 0) {
      currentSession.noteContent.pop();
    }
    
    // Remove the last price if it exists
    if (currentSession.prices && currentSession.prices.length > 0) {
      currentSession.prices.pop();
    }

    // If it was a machine, remove from MachineSpecific collection
    if (lastEntry.isMachine) {
      await MachineSpecific.deleteOne({
        Name: lastEntry.description,
        SerialNumber: lastEntry.serialNumber || ""
      });
    } else {
      // If it was a supply, decrement the quantity
      // Note: You may need to implement decrementSupplyQuantity function
      // For now, we'll just log it
      console.log(`Should decrement quantity for: ${lastEntry.description}`);
    }

    // Save the updated session
    await setSession(sessionId, currentSession);

    return res.json({
      message: "Last scan undone successfully",
      undoneItem: lastEntry,
      remainingItems: currentSession.skuEntries.length
    });

  } catch (error) {
    console.error("Error undoing last scan:", error);
    return res.status(500).json({ error: "Failed to undo last scan" });
  }
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
