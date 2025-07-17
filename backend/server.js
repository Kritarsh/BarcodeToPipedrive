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
  getPriceFromDatabase,
  appendMachineSpecific,
  incrementSupplyQuantity,
} from "./skuMatcher.js";
import mongoose from "mongoose";
import Inventory from "./models/Inventory.js";
import Overstock from "./models/Overstock.js";
import MachineSpecific from "./models/MachineSpecific.js";
import MonthEndInventory from "./models/MonthEndInventory.js";
import MonthEndOverstock from "./models/MonthEndOverstock.js";
import path from "path";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Add request logging middleware
app.use((req, res, next) => {
  if (req.url.includes('/api/month-end/')) {
    console.log(`🔥 MONTH END REQUEST: ${req.method} ${req.url}`, req.body);
  }
  next();
});

console.log("Server started");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
const PIPEDRIVE_API_URL = "https://api.pipedrive.com/v1";

// Debug: Check if token is loaded
console.log("PIPEDRIVE_API_TOKEN loaded:", PIPEDRIVE_API_TOKEN ? "✅ Yes" : "❌ No (undefined)");

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
  console.log("findDealIdByTrackingNumber called with:", trackingNumber);
  console.log("Using API token:", PIPEDRIVE_API_TOKEN ? "✅ Token exists" : "❌ Token is undefined");
  
  const response = await axios.get(`${PIPEDRIVE_API_URL}/deals/search`, {
    params: { term: trackingNumber, exact_match: false },
    headers: { "x-api-token": PIPEDRIVE_API_TOKEN },
  });
  console.log("Pipedrive search response status:", response.status);
  
  const deals = response.data.data?.items || [];
  console.log("Found deals:", deals.length);
  
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
    case "donotaccept":
      return "Do not accept";
    case "tornpackaging":
      return "Torn Packaging";
    case "yellow":
      return "Yellow";
    default:
      return "No Flaw";
  }
}

// --- Routes ---

// Barcode scan handler
app.post("/api/barcode", async (req, res) => {
  const { scanType, barcode, sessionId, price, serialNumber, qcFlaw, quantity = 1 } =
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
          grouped[key].count += (entry.quantity || 1);
          grouped[key].subtotal += (Number(entry.price) || 0) * (entry.quantity || 1);
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
            (sum, entry) => sum + (Number(entry.price) || 0) * (entry.quantity || 1),
            0
          ) || 0;

        const allNotesWithTotal = [
          ...lines,
          `Total Price: $${total.toFixed(2)}`,
        ]
          .filter(Boolean)
          .join("\n");

        console.log("Attempting to add note to Pipedrive:");
        console.log("- Deal ID:", oldSession.dealId);
        console.log("- Token exists:", PIPEDRIVE_API_TOKEN ? "✅ Yes" : "❌ No");
        console.log("- Content length:", allNotesWithTotal.length);

        await addNoteToPipedrive(allNotesWithTotal, oldSession.dealId, PIPEDRIVE_API_TOKEN);
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
          quantity: quantity, // Add quantity to machine entry
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
        // Set pending state for manual reference
        currentSession.pendingState = {
          type: "manualReference",
          sku: barcode,
          qcFlaw: qcFlaw,
          serialNumber: serialNumber,
          quantity: quantity
        };
        await setSession(sessionId, currentSession);
        
        return res.json({
          match: false,
          reason: result.reason,
          message: result.message,
        });
      }

      const name = result.row.Name || result.row.Description || result.row.Style || "";
      const size = result.row.Size || "";
      const upc = barcode;

      // Supplies: increment quantity in the correct spreadsheet ONLY if no flaw
      if (!qcFlaw || qcFlaw === "none") {
        incrementSupplyQuantity({
          collection: result.collection,
          name,
          upc,
          size,
          quantity: quantity,
          date: new Date(),
        });
      } else {
        console.log(`Skipping quantity increment for flawed item: ${name} (Flaw: ${qcFlawLabel(qcFlaw)})`);
      }

      let calculatedPrice = 0;
      calculatedPrice = await getPriceFromDatabase(result.row, name, qcFlaw);

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
        quantity: quantity, // Add quantity to session entry
        collection: result.collection, // Add this for undo functionality
        upc: barcode, // Add this for undo functionality
      });

      await setSession(sessionId, currentSession);

      // Also save to Month End collection when UPC is scanned - just update info, don't increment quantity
      const monthEndCollection = result.collection === "Inventory" ? MonthEndInventory : MonthEndOverstock;
      await monthEndCollection.findOneAndUpdate(
        {
          UPC: upc,
          Style: result.row.Description || result.row.Name || result.row.Style || "",
          Size: result.row.Size || "",
          MFR: result.row.MFR || result.collection
        },
        {
          $setOnInsert: { 
            RefNum: "",
            Quantity: 0 // Set to 0 for new items from regular workflow
          },
          $set: { 
            Date: new Date(),
            Price: calculatedPrice
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );

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
    quantity = 1,
  } = req.body;
  if (!barcode || !manualRef || !sessionId) {
    return res
      .status(400)
      .json({ error: "barcode, manualRef, and sessionId are required" });
  }

  const currentSession = await getSession(sessionId);
  const matchResult = await matchSkuWithDatabaseManual(barcode, manualRef);

  if (matchResult.match) {
    // Clear pending state since we found a match
    if (currentSession.pendingState) {
      delete currentSession.pendingState;
    }
    
    let nameForPricing =
      (matchResult.row &&
        (matchResult.row.Name ||
          matchResult.row.Description ||
          matchResult.row.Style)) ||
      "";
    let calculatedPrice = 0;
    calculatedPrice = await getPriceFromDatabase(matchResult.row, nameForPricing, qcFlaw);

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
      quantity: quantity, // Add quantity to manual reference entry
    });

    await setSession(sessionId, currentSession);

    // Also save to corresponding Month End collection with calculated price - just update info, don't increment quantity
    const monthEndCollection = matchResult.collection === "Inventory" ? MonthEndInventory : MonthEndOverstock;
    await monthEndCollection.findOneAndUpdate(
      {
        RefNum: manualRef || "",
        Style: matchResult.row.Description || matchResult.row.Name || matchResult.row.Style || "",
        Size: matchResult.row.Size || "",
        MFR: matchResult.row.MFR || matchResult.collection
      },
      {
        $setOnInsert: { 
          Quantity: 0 // Set to 0 for new items from regular workflow
        },
        $set: { 
          UPC: barcode,
          Date: new Date(),
          Price: calculatedPrice
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

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
      message: "SKU found, note added, and saved to month end inventory!",
      spreadsheetMatch: !!matchResult.collection,
      price: calculatedPrice,
      descriptionResult: descriptionResult || {},
      noteContent: currentSession.noteContent,
    });
  }

  // If no match, return a response so frontend can prompt for new product
  // Set pending state for new product form
  currentSession.pendingState = {
    type: "newProduct",
    sku: barcode,
    manualRef: manualRef,
    qcFlaw: qcFlaw,
    serialNumber: serialNumber,
    quantity: quantity
  };
  await setSession(sessionId, currentSession);
  
  return res.json({
    match: false,
    message: "SKU not found even with the manual reference.",
  });
});

// Undo last scan
app.post("/api/barcode/undo", async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  try {
    const currentSession = await getSession(sessionId);
    
    if (!currentSession) {
      return res.status(400).json({ error: "No session found" });
    }

    // Check for pending states first (manual reference, new product forms)
    if (currentSession.pendingState) {
      const pendingState = currentSession.pendingState;
      
      // Clear the pending state
      delete currentSession.pendingState;
      await setSession(sessionId, currentSession);
      
      return res.json({
        message: "Cancelled pending operation",
        action: "clearPendingState",
        pendingType: pendingState.type,
        clearedSku: pendingState.sku || null,
        remainingItems: currentSession.skuEntries ? currentSession.skuEntries.length : 0
      });
    }

    // If no pending state, handle normal undo of completed scans
    if (!currentSession.skuEntries || currentSession.skuEntries.length === 0) {
      return res.status(400).json({ error: "No items to undo" });
    }

    // Remove the last item from the session
    const undoneItem = currentSession.skuEntries.pop();
    
    // Also remove from noteContent and prices if they exist
    if (currentSession.noteContent && currentSession.noteContent.length > 0) {
      currentSession.noteContent.pop();
    }
    if (currentSession.prices && currentSession.prices.length > 0) {
      currentSession.prices.pop();
    }

    // Save the updated session
    await setSession(sessionId, currentSession);

    return res.json({
      message: "Last scan undone successfully",
      action: "undoLastScan",
      undoneItem: undoneItem,
      remainingItems: currentSession.skuEntries.length
    });
  } catch (err) {
    console.error("Error undoing last scan:", err);
    return res.status(500).json({ error: "Failed to undo last scan" });
  }
});

// Add new product to main inventory/overstock and Month End collections
app.post("/api/product/new", async (req, res) => {
  const { barcode, description, size, price, qcFlaw, manualRef, sessionId, mfr, quantity = 1 } = req.body;
  if (!barcode || !description || !sessionId) {
    return res.status(400).json({ error: "barcode, description, and sessionId are required" });
  }

  try {
    // Determine which collection to use based on manufacturer
    const isInventoryItem = mfr && (mfr.toUpperCase() === "RESMED" || mfr.toUpperCase() === "RESPIRONICS");
    
    // Calculate price using existing pricing logic or provided price
    const calculatedPrice = price ? parseFloat(price) : await getPriceForName(description, qcFlaw);
    
    // Save to main collection
    let newProduct;
    if (isInventoryItem) {
      newProduct = new Inventory({
        RefNum: manualRef || "",
        UPC: barcode,
        Style: description,
        Size: size || "",
        MFR: mfr,
        Quantity: 0, // Start with 0 as requested
        Date: new Date(),
        Price: calculatedPrice,
      });
    } else {
      newProduct = new Overstock({
        RefNum: manualRef || "",
        UPC: barcode,
        Style: description,
        Size: size || "",
        MFR: mfr || "Unknown",
        Quantity: 0, // Start with 0 as requested
        Date: new Date(),
        Price: calculatedPrice,
      });
    }
    
    await newProduct.save();

    // Also save to corresponding Month End collection with calculated price - just update info, don't increment quantity
    const monthEndCollection = isInventoryItem ? MonthEndInventory : MonthEndOverstock;
    const monthEndProduct = await monthEndCollection.findOneAndUpdate(
      {
        // Use RefNum as primary key if provided, otherwise use UPC
        ...(manualRef ? 
          { RefNum: manualRef, Style: description, Size: size || "", MFR: mfr || (isInventoryItem ? "Unknown" : "Unknown") } :
          { UPC: barcode, Style: description, Size: size || "", MFR: mfr || (isInventoryItem ? "Unknown" : "Unknown") }
        )
      },
      {
        $setOnInsert: { 
          ...(manualRef ? {} : { RefNum: "" }), // Only set RefNum to "" on insert when no manualRef
          Quantity: 0 // Set to 0 for new items from regular workflow
        },
        $set: { 
          UPC: barcode,
          Date: new Date(),
          Price: calculatedPrice
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    // Add to session
    const currentSession = await getSession(sessionId);
    
    // Clear pending state since we're successfully adding the product
    if (currentSession.pendingState) {
      delete currentSession.pendingState;
    }
    
    if (!currentSession.skuEntries) currentSession.skuEntries = [];
    currentSession.skuEntries.push({
      description,
      size: size || "",
      qcFlaw: qcFlaw || "none",
      serialNumber: "",
      price: calculatedPrice,
      quantity: quantity, // Add quantity field
      isManual: true,
      upc: barcode,
      collection: isInventoryItem ? "Inventory" : "Overstock",
    });
    await setSession(sessionId, currentSession);

    return res.json({ 
      message: "Product added to both main inventory and month end collections!", 
      product: newProduct,
      monthEndProduct: monthEndProduct,
      price: calculatedPrice
    });
  } catch (err) {
    console.error("Error adding new product:", err);
    return res.status(500).json({ error: "Failed to add new product" });
  }
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

// Month End Inventory endpoints
app.get("/api/month-end-inventory", async (req, res) => {
  try {
    console.log("Attempting to fetch Month End Inventory data...");
    console.log("MonthEndInventory model collection name:", MonthEndInventory.collection.name);
    
    const monthEndInventoryData = await MonthEndInventory.find();
    console.log("Found Month End Inventory documents:", monthEndInventoryData.length);
    console.log("Sample document:", monthEndInventoryData[0]);
    
    // Convert Decimal128 Price values to numbers for frontend
    const processedData = monthEndInventoryData.map(item => ({
      ...item.toObject(),
      Price: item.Price ? parseFloat(item.Price.toString()) : 0
    }));
    
    res.json({ data: processedData });
  } catch (err) {
    console.error("Error fetching month end inventory:", err);
    res.status(500).json({ error: "Failed to fetch month end inventory data" });
  }
});

app.get("/api/month-end-overstock", async (req, res) => {
  try {
    console.log("Attempting to fetch Month End Overstock data...");
    console.log("MonthEndOverstock model collection name:", MonthEndOverstock.collection.name);
    
    const monthEndOverstockData = await MonthEndOverstock.find();
    console.log("Found Month End Overstock documents:", monthEndOverstockData.length);
    console.log("Sample document:", monthEndOverstockData[0]);
    
    res.json({ data: monthEndOverstockData });
  } catch (err) {
    console.error("Error fetching month end overstock:", err);
    res.status(500).json({ error: "Failed to fetch month end overstock data" });
  }
});

// Test endpoint to verify CSV export routing
app.get("/api/month-end-inventory/test", (req, res) => {
  res.json({ message: "Month End Inventory route is working!" });
});

// Month End CSV export endpoints
app.get("/api/month-end-inventory/export-csv", async (req, res) => {
  try {
    console.log("CSV Export request received for Month End Inventory");
    const monthEndInventoryData = await MonthEndInventory.find();
    console.log("Found documents for export:", monthEndInventoryData.length);
    
    // Define CSV headers
    const headers = ["RefNum", "UPC", "MFR", "Style", "Size", "Quantity", "Price", "Date"];
    
    // Convert data to CSV format
    let csvContent = headers.join(",") + "\n";
    
    if (monthEndInventoryData.length === 0) {
      // If no data, still return empty CSV with headers
      console.log("No data found, returning empty CSV with headers");
    } else {
      monthEndInventoryData.forEach(item => {
        const row = [
          `"${item.RefNum || ""}"`,
          `"${item.UPC || ""}"`,
          `"${item.MFR || ""}"`,
          `"${item.Style || ""}"`,
          `"${item.Size || ""}"`,
          item.Quantity || 0,
          item.Price ? (item.Price.$numberDecimal || item.Price) : 0,
          `"${item.Date ? new Date(item.Date).toLocaleDateString() : ""}"`
        ];
        csvContent += row.join(",") + "\n";
      });
    }

    // Set headers for file download
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
    const filename = `month-end-inventory-${timestamp}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
    console.log("CSV export completed successfully");
    
  } catch (err) {
    console.error("Error exporting Month End Inventory CSV:", err);
    res.status(500).json({ error: "Failed to export Month End Inventory CSV" });
  }
});

app.get("/api/month-end-overstock/export-csv", async (req, res) => {
  try {
    console.log("CSV Export request received for Month End Overstock");
    const monthEndOverstockData = await MonthEndOverstock.find();
    console.log("Found documents for export:", monthEndOverstockData.length);
    
    // Define CSV headers
    const headers = ["RefNum", "UPC", "MFR", "Style", "Size", "Quantity", "Price", "Date"];
    
    // Convert data to CSV format
    let csvContent = headers.join(",") + "\n";
    
    if (monthEndOverstockData.length === 0) {
      // If no data, still return empty CSV with headers
      console.log("No data found, returning empty CSV with headers");
    } else {
      monthEndOverstockData.forEach(item => {
        const row = [
          `"${item.RefNum || ""}"`,
          `"${item.UPC || ""}"`,
          `"${item.MFR || ""}"`,
          `"${item.Style || ""}"`,
          `"${item.Size || ""}"`,
          item.Quantity || 0,
          item.Price ? (item.Price.$numberDecimal || item.Price) : 0,
          `"${item.Date ? new Date(item.Date).toLocaleDateString() : ""}"`
        ];
        csvContent += row.join(",") + "\n";
      });
    }

    // Set headers for file download
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
    const filename = `month-end-overstock-${timestamp}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
    console.log("CSV export completed successfully");
    
  } catch (err) {
    console.error("Error exporting Month End Overstock CSV:", err);
    res.status(500).json({ error: "Failed to export Month End Overstock CSV" });
  }
});

// Month End barcode scan handler
app.post("/api/month-end/barcode", async (req, res) => {
  console.log("🔥 MONTH END BARCODE HANDLER HIT!", req.body);
  const { scanType, barcode, sessionId, price, serialNumber, qcFlaw, quantity = 1 } = req.body;
  if (!scanType || !barcode || !sessionId) {
    return res.status(400).json({ error: "scanType, barcode, and sessionId are required" });
  }

  try {
    if (scanType === "sku") {
      const currentSession = await getSession(sessionId);
      
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

        // Store machine data in session for month end processing
        if (!currentSession.noteContent) currentSession.noteContent = [];
        currentSession.noteContent.push(`Machine: ${barcode}${
          serialNumber ? ` Serial Number: ${serialNumber}` : ""
        }. Price: $${machinePrice}`);

        if (!currentSession.skuEntries) currentSession.skuEntries = [];
        currentSession.skuEntries.push({
          description: barcode,
          size: "",
          qcFlaw: qcFlaw,
          serialNumber: serialNumber || "",
          price: machinePrice,
          quantity: quantity, // Add quantity field
          isMachine: true,
          upc: barcode,
          name: barcode,
        });

        // Save machine immediately to Month End Overstock - increment if exists
        await MonthEndOverstock.findOneAndUpdate(
          {
            UPC: barcode,
            Style: barcode,
            Size: "",
            MFR: "Machine"
          },
          {
            $inc: { Quantity: 1 },
            $set: { 
              RefNum: "",
              Date: new Date(),
              Price: machinePrice
            }
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
          }
        );

        if (!currentSession.prices) currentSession.prices = [];
        currentSession.prices.push(machinePrice);

        await setSession(sessionId, currentSession);

        return res.json({
          spreadsheetMatch: null,
          price: machinePrice,
          message: "Machine added to month end inventory!",
        });
      }

      // Process supplies for month end
      const result = await matchSkuWithDatabase(barcode);
      if (!result.match) {
        // Set pending state for manual reference
        currentSession.pendingState = {
          type: "manualReference",
          sku: barcode,
          qcFlaw: qcFlaw,
          serialNumber: serialNumber,
          quantity: quantity
        };
        await setSession(sessionId, currentSession);
        
        return res.json({
          match: false,
          reason: result.reason,
          message: result.message,
        });
      }

      const name = result.row.Name || result.row.Description || result.row.Style || "";
      const size = result.row.Size || "";
      const upc = barcode;

      // Store supply data in session for month end processing
      let calculatedPrice = 0;
      calculatedPrice = await getPriceFromDatabase(result.row, name, qcFlaw);

      if (!currentSession.noteContent) currentSession.noteContent = [];
      currentSession.noteContent.push(`SKU scanned: ${barcode}. Spreadsheet match: ${
        result.collection
      } - ${name}. Price: $${calculatedPrice}. Description: ${
        result.row.Description || result.row.Name || result.row.Style || ""
      }`);

      if (!currentSession.prices) currentSession.prices = [];
      currentSession.prices.push(calculatedPrice);

      if (!currentSession.skuEntries) currentSession.skuEntries = [];
      currentSession.skuEntries.push({
        description: result.row.Description || result.row.Name || result.row.Style || "",
        size: result.row.Size || "",
        qcFlaw: req.body.qcFlaw,
        serialNumber: serialNumber || "",
        price: calculatedPrice,
        quantity: quantity, // Add quantity field
        collection: result.collection,
        upc: barcode,
        name: name,
        isMachine: false,
      });

      // Save immediately to Month End collection based on original collection - increment if exists (UPC as primary key)
      const monthEndCollection = result.collection === "Inventory" ? MonthEndInventory : MonthEndOverstock;
      await monthEndCollection.findOneAndUpdate(
        {
          UPC: upc,
          Style: result.row.Description || result.row.Name || result.row.Style || "",
          Size: result.row.Size || "",
          MFR: result.row.MFR || result.collection
        },
        {
          $inc: { Quantity: quantity },
          $setOnInsert: { RefNum: "" }, // Only set on insert
          $set: { 
            Date: new Date(),
            Price: calculatedPrice
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );

      await setSession(sessionId, currentSession);

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
        console.error("Error writing to spreadsheet:", error);
      }

      return res.json({
        note: result,
        noteContent: currentSession.noteContent,
        spreadsheetMatch: result.collection,
        price: calculatedPrice,
        descriptionResult: descriptionResult || {},
        row: result.row,
      });
    }
  } catch (error) {
    console.error("Error processing month end SKU:", error);
    return res.status(500).json({ error: "Failed to process month end SKU" });
  }
});

// Month End manual reference handler
app.post("/api/month-end/barcode/manual", async (req, res) => {
  console.log("🔥 MONTH END MANUAL REFERENCE HANDLER HIT!", req.body);
  const { barcode, manualRef, sessionId, description, price, serialNumber, qcFlaw, quantity = 1 } = req.body;
  if (!barcode || !manualRef || !sessionId) {
    return res.status(400).json({ error: "barcode, manualRef, and sessionId are required" });
  }

  const currentSession = await getSession(sessionId);
  const matchResult = await matchSkuWithDatabaseManual(barcode, manualRef);

  if (matchResult.match) {
    // Clear pending state since we found a match
    if (currentSession.pendingState) {
      delete currentSession.pendingState;
    }
    
    let nameForPricing = (matchResult.row && (matchResult.row.Name || matchResult.row.Description || matchResult.row.Style)) || "";
    let calculatedPrice = 0;
    calculatedPrice = await getPriceFromDatabase(matchResult.row, nameForPricing, qcFlaw);

    if (!currentSession.noteContent) currentSession.noteContent = [];
    currentSession.noteContent.push(`SKU scanned: ${barcode}. Spreadsheet match: ${matchResult.file} - ${matchResult.row[matchResult.matchedColumn]}. Price: $${calculatedPrice}`);

    if (!currentSession.prices) currentSession.prices = [];
    currentSession.prices.push(calculatedPrice);

    if (!currentSession.skuEntries) currentSession.skuEntries = [];
    currentSession.skuEntries.push({
      description: matchResult.row.Description || matchResult.row.Name || matchResult.row.Style || "",
      size: matchResult.row.Size || "",
      qcFlaw: qcFlaw,
      serialNumber: serialNumber || "",
      price: calculatedPrice,
      quantity: quantity, // Add quantity field
      upc: barcode,
    });

    // Save immediately to Month End collection based on original collection - increment if exists (RefNum as primary key)
    const monthEndCollection = matchResult.collection === "Inventory" ? MonthEndInventory : MonthEndOverstock;
    await monthEndCollection.findOneAndUpdate(
      {
        RefNum: manualRef || "",
        Style: matchResult.row.Description || matchResult.row.Name || matchResult.row.Style || "",
        Size: matchResult.row.Size || "",
        MFR: matchResult.row.MFR || matchResult.collection
      },
      {
        $inc: { Quantity: quantity },
        $set: { 
          UPC: barcode,
          Date: new Date(),
          Price: calculatedPrice
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

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
    } catch (error) {
      console.error("Error with description result:", error);
    }

    return res.json({
      match: true,
      message: "SKU found and added to month end inventory!",
      spreadsheetMatch: !!matchResult.collection,
      price: calculatedPrice,
      descriptionResult: descriptionResult || {},
      noteContent: currentSession.noteContent,
    });
  }

  // If no match, return a response so frontend can prompt for new product
  // Set pending state for new product form
  currentSession.pendingState = {
    type: "newProduct",
    sku: barcode,
    manualRef: manualRef,
    qcFlaw: qcFlaw,
    serialNumber: serialNumber,
    quantity: quantity
  };
  await setSession(sessionId, currentSession);
  
  return res.json({
    match: false,
    message: "SKU not found even with the manual reference.",
  });
});

// Month End new product handler
app.post("/api/month-end/product/new", async (req, res) => {
  const { barcode, description, size, price, qcFlaw, manualRef, sessionId, serialNumber, mfr, quantity = 1 } = req.body;
  if (!barcode || !description || !sessionId) {
    return res.status(400).json({ error: "barcode, description, and sessionId are required" });
  }

  try {
    // Determine which month end collection to use and save with increment logic (use appropriate primary key)
    const isInventoryItem = mfr && (mfr.toUpperCase() === "RESMED" || mfr.toUpperCase() === "RESPIRONICS");
    const monthEndCollection = isInventoryItem ? MonthEndInventory : MonthEndOverstock;
    
    // Calculate price using existing pricing logic or provided price
    const calculatedPrice = price ? parseFloat(price) : await getPriceForName(description, qcFlaw);
    
    const newProduct = await monthEndCollection.findOneAndUpdate(
      {
        // Use RefNum as primary key if provided, otherwise use UPC
        ...(manualRef ? 
          { RefNum: manualRef, Style: description, Size: size || "", MFR: mfr } :
          { UPC: barcode, Style: description, Size: size || "", MFR: mfr }
        )
      },
      {
        $inc: { Quantity: quantity },
        $setOnInsert: { 
          ...(manualRef ? {} : { RefNum: "" }) // Only set RefNum to "" on insert when no manualRef
        },
        $set: { 
          UPC: barcode,
          Date: new Date(),
          Price: calculatedPrice
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    const currentSession = await getSession(sessionId);
    
    // Clear pending state since we're successfully adding the product
    if (currentSession.pendingState) {
      delete currentSession.pendingState;
    }
    
    if (!currentSession.skuEntries) currentSession.skuEntries = [];
    currentSession.skuEntries.push({
      description,
      size: size || "",
      qcFlaw: qcFlaw || "none",
      serialNumber: serialNumber || "",
      price: price || 0,
      quantity: quantity, // Add quantity field
      isManual: true,
      upc: barcode,
    });
    await setSession(sessionId, currentSession);

    return res.json({ message: "Product added to month end inventory!", product: newProduct });
  } catch (err) {
    console.error("Error adding new month end product:", err);
    return res.status(500).json({ error: "Failed to add new month end product" });
  }
});

// Month End finish handler
app.post("/api/month-end/finish", async (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  try {
    const currentSession = await getSession(sessionId);
    
    if (!currentSession || !currentSession.skuEntries || currentSession.skuEntries.length === 0) {
      return res.status(400).json({ error: "No items found in the month end session." });
    }

    // Items are already saved to Month End collections when scanned, so just clear the session
    // Clear the session
    await setSession(sessionId, {
      noteContent: [],
      prices: [],
      skuEntries: [],
    });

    return res.json({ message: "Month end inventory completed successfully." });
  } catch (error) {
    console.error("Error in month end finish:", error);
    return res.status(500).json({ error: "Failed to complete month end inventory" });
  }
});

// Price management endpoints
app.get("/api/products/prices", async (req, res) => {
  try {
    const inventoryProducts = await Inventory.find({}, {
      _id: 1,
      RefNum: 1,
      UPC: 1,
      MFR: 1,
      Style: 1,
      Size: 1,
      Price: 1
    }).lean();

    const overstockProducts = await Overstock.find({}, {
      _id: 1,
      RefNum: 1,
      UPC: 1,
      MFR: 1,
      Style: 1,
      Size: 1,
      Price: 1
    }).lean();

    // Add collection type to each product
    const inventoryWithType = inventoryProducts.map(p => ({ ...p, collection: 'Inventory' }));
    const overstockWithType = overstockProducts.map(p => ({ ...p, collection: 'Overstock' }));

    const allProducts = [...inventoryWithType, ...overstockWithType];
    res.json(allProducts);
  } catch (error) {
    console.error("Error fetching products for price management:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/products/:collection/:id/price", async (req, res) => {
  try {
    const { collection, id } = req.params;
    const { price } = req.body;

    if (!price && price !== 0) {
      return res.status(400).json({ error: "Price is required" });
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: "Price must be a valid non-negative number" });
    }

    let model;
    if (collection === 'Inventory') {
      model = Inventory;
    } else if (collection === 'Overstock') {
      model = Overstock;
    } else {
      return res.status(400).json({ error: "Invalid collection" });
    }

    const updatedProduct = await model.findByIdAndUpdate(
      id,
      { Price: numericPrice },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Also update corresponding Month End collections if they exist
    const monthEndModel = collection === 'Inventory' ? MonthEndInventory : MonthEndOverstock;
    await monthEndModel.updateMany(
      { RefNum: updatedProduct.RefNum },
      { $set: { Price: numericPrice } }
    );

    res.json({ 
      message: "Price updated successfully",
      product: updatedProduct
    });
  } catch (error) {
    console.error("Error updating product price:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../frontend/build')));

// More specific catch-all that avoids API routes
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
