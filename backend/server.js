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
  matchSkuWithMagentoInventory,
  matchSkuWithMagentoInventoryManual,
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
import MagentoInventory from "./models/MagentoInventory.js";
import path from "path";

dotenv.config();

const app = express();
app.use(express.json());
// CORS configuration for production and development
const corsOptions = {
  origin: [
    'http://localhost:3000',  // Local development
    'https://localhost:3000', // HTTPS local development
    /\.onrender\.com$/,       // Any Render subdomain
    /\.amplifyapp\.com$/,     // Any AWS Amplify subdomain
    /\.netlify\.app$/,        // Any Netlify subdomain
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token']
};

app.use(cors(corsOptions));

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
    case "notoriginalpackaging":
      return "Not in Original Packaging";
    case "donotaccept":
      return "Do not accept";
    case "tornpackaging":
      return "Torn Packaging";
    case "yellow":
      return "Yellow";
    case "other":
      return "Other";
    default:
      return "No Flaw";
  }
}

// --- Routes ---

// Session restoration endpoint to sync frontend localStorage with backend session
app.post("/api/session/restore", async (req, res) => {
  const { sessionId, trackingNumber, scannedItems, totalPrice } = req.body;
  
  console.log("🔄 SESSION RESTORE REQUEST:", { sessionId, trackingNumber, itemCount: scannedItems?.length, totalPrice });
  
  if (!sessionId || !trackingNumber) {
    return res.status(400).json({ error: "sessionId and trackingNumber are required" });
  }

  try {
    // Find the deal ID for the tracking number
    const dealId = await findDealIdByTrackingNumber(trackingNumber);
    if (!dealId) {
      console.log("❌ Deal not found for tracking number:", trackingNumber);
      return res.status(404).json({ error: "Deal not found for tracking number" });
    }

    console.log("✅ Deal found:", dealId);

    // Restore the session with the provided data
    const restoredSession = {
      dealId,
      noteContent: [],
      prices: [],
      skuEntries: []
    };

    // Rebuild noteContent, prices, and properly formatted skuEntries from scannedItems
    if (scannedItems && scannedItems.length > 0) {
      console.log("📦 Processing", scannedItems.length, "scanned items for restoration");
      
      for (const item of scannedItems) {
        const noteContent = `${item.isMachine ? 'Machine' : 'SKU'}: ${item.sku}${
          item.description ? ` - ${item.description}` : ''
        }${item.size ? ` Size: ${item.size}` : ''}${
          item.qcFlaw && item.qcFlaw !== 'none' ? ` [Flaw: ${qcFlawLabel(item.qcFlaw)}]` : ''
        }${item.serialNumber ? ` Serial: ${item.serialNumber}` : ''}. Price: $${item.price}${
          item.quantity > 1 ? ` x ${item.quantity}` : ''
        }`;
        
        restoredSession.noteContent.push(noteContent);
        restoredSession.prices.push(item.price * (item.quantity || 1));
        
        // Convert frontend scannedItem format to backend skuEntry format
        restoredSession.skuEntries.push({
          description: item.description || item.sku,
          size: item.size || "",
          qcFlaw: item.qcFlaw || "none",
          serialNumber: item.serialNumber || "",
          price: item.price || 0,
          quantity: item.quantity || 1,
          upc: item.sku || "",
          isManual: item.isNew || item.manualRef ? true : false,
          isMachine: item.isMachine || false,
          collection: item.collection || (item.isMachine ? "Machine" : "Unknown")
        });
      }
    }

    console.log("💾 Saving restored session:", {
      dealId,
      noteContentLines: restoredSession.noteContent.length,
      pricesCount: restoredSession.prices.length,
      skuEntriesCount: restoredSession.skuEntries.length
    });

    await setSession(sessionId, restoredSession);

    return res.json({ 
      message: "Session restored successfully",
      dealId,
      itemCount: scannedItems ? scannedItems.length : 0
    });
  } catch (error) {
    console.error("❌ Error restoring session:", error);
    return res.status(500).json({ error: "Failed to restore session" });
  }
});

// Barcode scan handler
app.post("/api/barcode", async (req, res) => {
  const { scanType, barcode, sessionId, price, serialNumber, qcFlaw, quantity = 1, machineType } =
    req.body;
  if (!scanType || !barcode || !sessionId) {
    return res
      .status(400)
      .json({ error: "scanType, barcode, and sessionId are required" });
  }

  try {
    if (scanType === "tracking") {
      const oldSession = await getSession(sessionId);
      console.log("🔄 TRACKING SCAN - OLD SESSION CHECK:", {
        hasSession: !!oldSession,
        hasSkuEntries: !!(oldSession?.skuEntries),
        skuEntriesCount: oldSession?.skuEntries?.length || 0,
        hasDealId: !!oldSession?.dealId,
        dealId: oldSession?.dealId
      });
      
      if (
        oldSession &&
        oldSession.skuEntries &&
        oldSession.skuEntries.length > 0 &&
        oldSession.dealId
      ) {
        console.log("📋 SUBMITTING TO PIPEDRIVE:", oldSession.skuEntries.length, "items for deal", oldSession.dealId);
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

        console.log("📝 Attempting to add note to Pipedrive:");
        console.log("- Deal ID:", oldSession.dealId);
        console.log("- Token exists:", PIPEDRIVE_API_TOKEN ? "✅ Yes" : "❌ No");
        console.log("- Content length:", allNotesWithTotal.length);
        console.log("- Note content preview:", allNotesWithTotal.substring(0, 200) + "...");

        await addNoteToPipedrive(allNotesWithTotal, oldSession.dealId, PIPEDRIVE_API_TOKEN);
        console.log("✅ Successfully submitted note to Pipedrive!");
      } else {
        console.log("⚪ No previous session to submit to Pipedrive");
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
      
      // Check if machine type is explicitly provided or if barcode contains machine keywords
      const isMachine = machineType || machineKeywords.some((keyword) =>
        barcode.toLowerCase().includes(keyword.toLowerCase())
      );

      if (isMachine) {
        // Use machineType if provided, otherwise use barcode (for backwards compatibility)
        const machineName = machineType || barcode;
        
        // Get price for the machine
        const machinePrice = await getPriceForName(machineName, qcFlaw);

        // Add to Excel - use machine name for identification, serial number in the serial field
        appendMachineSpecific({
          name: machineName,
          upc: barcode, // This is the serial number when machineType is provided
          serialNumber: barcode, // The serial number is in the barcode field when using dropdown
          quantity: 1,
          date: new Date(),
        });

        // Add to session noteContent and skuEntries
        const machineNote = `Machine: ${machineName} Serial Number: ${barcode}. Price: $${machinePrice}`;
        if (!currentSession.noteContent) currentSession.noteContent = [];
        currentSession.noteContent.push(machineNote);

        if (!currentSession.skuEntries) currentSession.skuEntries = [];
        currentSession.skuEntries.push({
          description: machineName,
          size: "",
          qcFlaw: qcFlaw,
          serialNumber: barcode, // The serial number is in the barcode field when using dropdown
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
  if (!manualRef || !sessionId) {
    return res
      .status(400)
      .json({ error: "manualRef and sessionId are required" });
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

    const noteContent = `${barcode ? `SKU scanned: ${barcode}` : "No barcode available"}. Spreadsheet match: ${
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
          ...(barcode && { UPC: barcode }), // Only set UPC if barcode exists
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
        upc: barcode || "", // Pass empty string if no barcode
      });
      if (barcode) { // Only write UPC if barcode exists
        await writeUPCToMongoDB({
          collection: matchResult.collection,
          matchedColumn: matchResult.matchedColumn,
          rowValue: matchResult.row[matchResult.matchedColumn],
          upc: barcode,
        });
      }
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

    // Get the last item before removing it
    const undoneItem = currentSession.skuEntries[currentSession.skuEntries.length - 1];
    
    // Try to decrement quantity in the database if the item has collection/UPC info
    if (undoneItem.collection && undoneItem.upc) {
      try {
        const monthEndCollection = undoneItem.collection === "Inventory" ? MonthEndInventory : MonthEndOverstock;
        
        // Find the document and decrement quantity by 1
        const doc = await monthEndCollection.findOne({ UPC: undoneItem.upc });
        if (doc && doc.Quantity > 0) {
          const newQuantity = Math.max(0, doc.Quantity - 1);
          await monthEndCollection.findOneAndUpdate(
            { UPC: undoneItem.upc },
            {
              $set: {
                Quantity: newQuantity,
                Date: new Date()
              }
            }
          );
          console.log(`[Undo] Decremented quantity to ${newQuantity} for UPC: ${undoneItem.upc}`);
        }
      } catch (dbError) {
        console.error("Error decrementing database quantity:", dbError);
        // Continue with session cleanup even if database update fails
      }
    }

    // Remove the last item from the session
    currentSession.skuEntries.pop();
    
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
  if (!description || !sessionId) {
    return res.status(400).json({ error: "description and sessionId are required" });
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
        ...(barcode && { UPC: barcode }), // Only set UPC if barcode exists
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
        ...(barcode && { UPC: barcode }), // Only set UPC if barcode exists
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
        // Use RefNum as primary key if provided, otherwise use UPC (if available)
        ...(manualRef ? 
          { RefNum: manualRef, Style: description, Size: size || "", MFR: mfr || (isInventoryItem ? "Unknown" : "Unknown") } :
          barcode ? 
            { UPC: barcode, Style: description, Size: size || "", MFR: mfr || (isInventoryItem ? "Unknown" : "Unknown") } :
            { Style: description, Size: size || "", MFR: mfr || (isInventoryItem ? "Unknown" : "Unknown") } // No primary key fallback
        )
      },
      {
        $setOnInsert: { 
          ...(manualRef ? {} : { RefNum: "" }), // Only set RefNum to "" on insert when no manualRef
          Quantity: 0 // Set to 0 for new items from regular workflow
        },
        $set: { 
          ...(barcode && { UPC: barcode }), // Only set UPC if barcode exists
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
      upc: barcode || "", // Use empty string if no barcode
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

// MagentoInventory API endpoints
app.get("/api/magento-inventory", async (req, res) => {
  try {
    console.log("Attempting to fetch Magento Inventory data...");
    console.log("MagentoInventory model collection name:", MagentoInventory.collection.name);
    
    const magentoInventoryData = await MagentoInventory.find();
    console.log("Found Magento Inventory documents:", magentoInventoryData.length);
    console.log("Sample document:", magentoInventoryData[0]);
    
    // Convert Decimal128 Price values to numbers for frontend
    const processedData = magentoInventoryData.map(item => ({
      ...item.toObject(),
      Price: item.Price ? parseFloat(item.Price.toString()) : 0
    }));
    
    res.json({ data: processedData });
  } catch (err) {
    console.error("Error fetching magento inventory:", err);
    res.status(500).json({ error: "Failed to fetch magento inventory data" });
  }
});

// Magento Inventory CSV export endpoint
app.get("/api/magento-inventory/export-csv", async (req, res) => {
  try {
    console.log("CSV Export request received for Magento Inventory");
    const magentoInventoryData = await MagentoInventory.find();
    console.log("Found documents for export:", magentoInventoryData.length);
    
    // Define CSV headers
    const headers = ["RefNum", "UPC", "MFR", "Style", "Size", "Quantity", "Price", "Date", "QcFlaw", "SerialNumber", "Source"];
    
    // Convert data to CSV format
    let csvContent = headers.join(",") + "\n";
    
    if (magentoInventoryData.length === 0) {
      console.log("No data found, returning empty CSV with headers");
    } else {
      magentoInventoryData.forEach(item => {
        const row = [
          `"${item.RefNum || ""}"`,
          `"${item.UPC || ""}"`,
          `"${item.MFR || ""}"`,
          `"${item.Style || ""}"`,
          `"${item.Size || ""}"`,
          item.Quantity || 0,
          item.Price ? (item.Price.$numberDecimal || item.Price) : 0,
          `"${item.Date ? new Date(item.Date).toLocaleDateString() : ""}"`,
          `"${item.QcFlaw || ""}"`,
          `"${item.SerialNumber || ""}"`,
          `"${item.Source || ""}"`
        ];
        csvContent += row.join(",") + "\n";
      });
    }
    
    // Set headers for file download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=magento_inventory_export.csv");
    
    console.log("Sending CSV response");
    res.send(csvContent);
  } catch (err) {
    console.error("Error exporting Magento inventory to CSV:", err);
    res.status(500).json({ error: "Failed to export Magento inventory data" });
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
  const { scanType, barcode, sessionId, price, serialNumber, qcFlaw, quantity = 1, machineType } = req.body;
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
      
      // Check if machine type is explicitly provided or if barcode contains machine keywords
      const isMachine = machineType || machineKeywords.some((keyword) =>
        barcode.toLowerCase().includes(keyword.toLowerCase())
      );

      if (isMachine) {
        // Use machineType if provided, otherwise use barcode (for backwards compatibility)
        const machineName = machineType || barcode;
        
        // Get price for the machine
        const machinePrice = await getPriceForName(machineName, qcFlaw);

        // Store machine data in session for month end processing
        if (!currentSession.noteContent) currentSession.noteContent = [];
        currentSession.noteContent.push(`Machine: ${machineName} Serial Number: ${barcode}. Price: $${machinePrice}`);

        if (!currentSession.skuEntries) currentSession.skuEntries = [];
        currentSession.skuEntries.push({
          description: machineName,
          size: "",
          qcFlaw: qcFlaw,
          serialNumber: barcode, // The serial number is in the barcode field when using dropdown
          price: machinePrice,
          quantity: quantity, // Add quantity field
          isMachine: true,
          upc: barcode, // This is the serial number when machineType is provided
          name: machineName,
        });

        // Save machine immediately to Month End Overstock - increment if exists
        await MonthEndOverstock.findOneAndUpdate(
          {
            UPC: barcode, // Use serial number as UPC
            Style: machineName, // Use machine name as Style
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
        console.error("Error writing to spreadsheet or adding note:", error);
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
  if (!manualRef || !sessionId) {
    return res.status(400).json({ error: "manualRef and sessionId are required" });
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

    const noteContent = `${barcode ? `SKU scanned: ${barcode}` : "No barcode available"}. Spreadsheet match: ${
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
          ...(barcode && { UPC: barcode }), // Only set UPC if barcode exists
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

    // Two-way integration: Also update the regular inventory collection with UPC if barcode exists
    if (barcode && matchResult.row) {
      try {
        const regularCollection = matchResult.collection === "Inventory" ? Inventory : Overstock;
        await regularCollection.findOneAndUpdate(
          {
            RefNum: matchResult.row.RefNum || manualRef
          },
          {
            $set: { 
              UPC: barcode,
              Date: new Date()
            }
          },
          {
            new: true
          }
        );
        
        // Also call writeUPCToMongoDB for additional Pipedrive integration
        await writeUPCToMongoDB({
          collection: matchResult.collection,
          matchedColumn: matchResult.matchedColumn,
          rowValue: matchResult.row[matchResult.matchedColumn],
          upc: barcode,
        });
        
        console.log(`✅ Two-way integration: Updated UPC ${barcode} in regular ${matchResult.collection} collection for RefNum: ${matchResult.row.RefNum || manualRef}`);
      } catch (error) {
        console.error("Error updating regular inventory collection with UPC:", error);
        // Don't fail the request if this update fails - log and continue
      }
    }

    await setSession(sessionId, currentSession);

    let descriptionResult;
    try {
      descriptionResult = await returnProductDescription({
        collection: matchResult.collection,
        matchedColumn: matchResult.matchedColumn,
        rowValue: matchResult.row,
        properValue: matchResult.row[matchResult.matchedColumn],
        upc: barcode || "", // Pass empty string if no barcode
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
  
  // Allow null/empty barcode if manualRef is provided
  if (!description || !sessionId || (!barcode && !manualRef)) {
    return res.status(400).json({ error: "description, sessionId, and either barcode or manualRef are required" });
  }

  try {
    // Determine which month end collection to use and save with increment logic (use appropriate primary key)
    const isInventoryItem = mfr && (mfr.toUpperCase() === "RESMED" || mfr.toUpperCase() === "RESPIRONICS");
    const monthEndCollection = isInventoryItem ? MonthEndInventory : MonthEndOverstock;
    
    // Calculate price using existing pricing logic or provided price
    const calculatedPrice = price ? parseFloat(price) : await getPriceForName(description, qcFlaw);
    
    const newProduct = await monthEndCollection.findOneAndUpdate(
      {
        // Use RefNum as primary key if provided, otherwise use UPC (only if barcode exists)
        ...(manualRef ? 
          { RefNum: manualRef, Style: description, Size: size || "", MFR: mfr } :
          barcode ? { UPC: barcode, Style: description, Size: size || "", MFR: mfr } :
          { Style: description, Size: size || "", MFR: mfr } // No barcode case
        )
      },
      {
        $inc: { Quantity: quantity },
        $setOnInsert: { 
          ...(manualRef ? {} : { RefNum: "" }) // Only set RefNum to "" on insert when no manualRef
        },
        $set: { 
          ...(barcode ? { UPC: barcode } : {}), // Only set UPC if barcode exists
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

    // Two-way integration: Also add/update the product in regular inventory collection
    if (barcode || manualRef) {
      try {
        const regularCollection = isInventoryItem ? Inventory : Overstock;
        await regularCollection.findOneAndUpdate(
          {
            // Match by RefNum if available, otherwise by UPC, otherwise by description
            ...(manualRef ? 
              { RefNum: manualRef } :
              barcode ? { UPC: barcode } :
              { Style: description, Size: size || "", MFR: mfr }
            )
          },
          {
            $set: { 
              RefNum: manualRef || "",
              Style: description,
              Size: size || "",
              MFR: mfr || "",
              ...(barcode ? { UPC: barcode } : {}),
              Date: new Date(),
              Price: calculatedPrice
            }
          },
          {
            upsert: true,
            new: true
          }
        );
        
        console.log(`✅ Two-way integration: Added/updated product in regular ${isInventoryItem ? 'Inventory' : 'Overstock'} collection - RefNum: ${manualRef || 'N/A'}, UPC: ${barcode || 'N/A'}`);
      } catch (error) {
        console.error("Error updating regular inventory collection with new product:", error);
        // Don't fail the request if this update fails - log and continue
      }
    }

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
      upc: barcode || null, // Handle null barcode
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

    const monthEndInventoryProducts = await MonthEndInventory.find({}, {
      _id: 1,
      RefNum: 1,
      UPC: 1,
      MFR: 1,
      Style: 1,
      Size: 1,
      Price: 1
    }).lean();

    const monthEndOverstockProducts = await MonthEndOverstock.find({}, {
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
    const monthEndInventoryWithType = monthEndInventoryProducts.map(p => ({ ...p, collection: 'MonthEndInventory' }));
    const monthEndOverstockWithType = monthEndOverstockProducts.map(p => ({ ...p, collection: 'MonthEndOverstock' }));

    const allProducts = [...inventoryWithType, ...overstockWithType, ...monthEndInventoryWithType, ...monthEndOverstockWithType];
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
    } else if (collection === 'MonthEndInventory') {
      model = MonthEndInventory;
    } else if (collection === 'MonthEndOverstock') {
      model = MonthEndOverstock;
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

    // Also update corresponding collections if they exist (only for regular collections)
    if (collection === 'Inventory' || collection === 'Overstock') {
      const monthEndModel = collection === 'Inventory' ? MonthEndInventory : MonthEndOverstock;
      await monthEndModel.updateMany(
        { RefNum: updatedProduct.RefNum },
        { $set: { Price: numericPrice } }
      );
    }

    res.json({ 
      message: "Price updated successfully",
      product: updatedProduct
    });
  } catch (error) {
    console.error("Error updating product price:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// General product update endpoint for all fields
app.put("/api/products/:collection/:id", async (req, res) => {
  try {
    console.log("PUT request received for:", req.params.collection, req.params.id);
    console.log("Request body:", req.body);
    
    const { collection, id } = req.params;
    const updates = req.body;

    // Validate collection
    let model;
    if (collection === 'Inventory') {
      model = Inventory;
    } else if (collection === 'Overstock') {
      model = Overstock;
    } else if (collection === 'MonthEndInventory') {
      model = MonthEndInventory;
    } else if (collection === 'MonthEndOverstock') {
      model = MonthEndOverstock;
    } else {
      return res.status(400).json({ error: "Invalid collection" });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    // Build update object with proper field mappings
    const updateObj = {};
    
    if (updates.refNum !== undefined) updateObj.RefNum = updates.refNum;
    if (updates.upc !== undefined) updateObj.UPC = updates.upc;
    if (updates.mfr !== undefined) updateObj.MFR = updates.mfr;
    if (updates.style !== undefined) updateObj.Style = updates.style;
    if (updates.size !== undefined) updateObj.Size = updates.size;
    if (updates.price !== undefined) {
      const numericPrice = parseFloat(updates.price);
      if (isNaN(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ error: "Price must be a valid non-negative number" });
      }
      updateObj.Price = numericPrice;
    }

    if (Object.keys(updateObj).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updatedProduct = await model.findByIdAndUpdate(
      id,
      updateObj,
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Also update corresponding Month End collections if they exist
    const monthEndModel = collection === 'Inventory' ? MonthEndInventory : MonthEndOverstock;
    const monthEndUpdates = {};
    
    // Only update Month End collections with fields that exist there
    if (updateObj.RefNum !== undefined) monthEndUpdates.RefNum = updateObj.RefNum;
    if (updateObj.UPC !== undefined) monthEndUpdates.UPC = updateObj.UPC;
    if (updateObj.MFR !== undefined) monthEndUpdates.MFR = updateObj.MFR;
    if (updateObj.Style !== undefined) monthEndUpdates.Style = updateObj.Style;
    if (updateObj.Size !== undefined) monthEndUpdates.Size = updateObj.Size;
    if (updateObj.Price !== undefined) monthEndUpdates.Price = updateObj.Price;

    if (Object.keys(monthEndUpdates).length > 0) {
      await monthEndModel.updateMany(
        { RefNum: updatedProduct.RefNum },
        { $set: monthEndUpdates }
      );
    }

    res.json({ 
      message: "Product updated successfully",
      product: updatedProduct
    });
  } catch (error) {
    console.error("Error updating product:", error);
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

// Magento Inventory barcode scanning endpoint
app.post("/api/magento-inventory/barcode", async (req, res) => {
  try {
    const { barcode, qcFlaw, serialNumber, quantity, sessionId } = req.body;
    
    console.log(`[Magento Inventory] Barcode scan received:`, { barcode, qcFlaw, serialNumber, quantity, sessionId });

    // Handle null or empty barcode
    if (!barcode || barcode.trim() === '') {
      console.log(`[Magento Inventory] Empty barcode received, returning no match`);
      return res.json({
        match: false,
        message: "No barcode provided. Please use manual entry."
      });
    }

    // Try to match the barcode with MagentoInventory database only
    const matchResult = await matchSkuWithMagentoInventory(barcode);
    
    // If no match found, return match: false to trigger manual reference workflow
    if (!matchResult || !matchResult.match) {
      console.log(`[Magento Inventory] No match found for barcode: ${barcode}`);
      return res.json({
        match: false,
        message: `UPC ${barcode} not found in MagentoInventory database. Please enter manual reference.`
      });
    }

    // Product found, calculate price and update existing document
    const name = matchResult.row.Style || "";
    let calculatedPrice = 0;
    calculatedPrice = await getPriceFromDatabase(matchResult.row, name, qcFlaw);

    // Update the existing MagentoInventory document instead of creating a new one
    const magentoInventoryItem = await MagentoInventory.findOneAndUpdate(
      { UPC: barcode }, // Find by UPC since this was a barcode match
      {
        $set: {
          Quantity: (matchResult.row.Quantity || 0) + (quantity || 1), // Add to existing quantity
          Price: calculatedPrice,
          Date: new Date(),
          QcFlaw: qcFlaw || "none",
          SerialNumber: serialNumber || "",
          Source: `Magento Inventory Scan - ${sessionId}`
        }
      },
      { 
        new: true, // Return the updated document
        upsert: false // Don't create if not found (we already verified it exists)
      }
    );

    console.log(`[Magento Inventory] Barcode scan updated existing document:`, magentoInventoryItem);

    // Add to session for undo functionality
    const currentSession = await getSession(sessionId);
    if (!currentSession.scannedItems) currentSession.scannedItems = [];
    if (!currentSession.totalPrice) currentSession.totalPrice = 0;

    currentSession.scannedItems.push({
      upc: barcode,
      refNum: matchResult.row.RefNum || "",
      description: matchResult.row.Style || "",
      size: matchResult.row.Size || "",
      price: calculatedPrice,
      quantity: quantity || 1,
      qcFlaw: qcFlaw || "none",
      serialNumber: serialNumber || "",
      timestamp: new Date(),
      source: "barcode_scan"
    });

    currentSession.totalPrice += calculatedPrice * (quantity || 1);
    await setSession(sessionId, currentSession);

    res.json({
      match: true,
      message: `Product found and added to Magento inventory!`,
      spreadsheetMatch: matchResult.collection,
      descriptionResult: { description: matchResult.row.Style || "" },
      price: calculatedPrice,
      row: matchResult.row,
      totalPrice: currentSession.totalPrice,
      scannedItemsCount: currentSession.scannedItems.length
    });

  } catch (err) {
    console.error(`[Magento Inventory] Error in barcode endpoint:`, err);
    res.status(500).json({ error: "Failed to process barcode scan" });
  }
});

// Magento Inventory manual entry endpoint
app.post("/api/magento-inventory/barcode/manual", async (req, res) => {
  try {
    const { manualRef, barcode, qcFlaw, serialNumber, quantity, sessionId } = req.body;
    
    console.log(`[Magento Inventory] Manual entry received:`, { manualRef, barcode, qcFlaw, serialNumber, quantity, sessionId });

    if (!manualRef || manualRef.trim() === '') {
      return res.status(400).json({ error: "Manual reference number is required" });
    }

    // Try to find product by manual reference in MagentoInventory database only
    const matchResult = await matchSkuWithMagentoInventoryManual(barcode, manualRef);
    
    if (!matchResult || !matchResult.match) {
      console.log(`[Magento Inventory] No match found for manual ref: ${manualRef}`);
      return res.json({
        match: false,
        message: `No product found for reference: ${manualRef} in MagentoInventory database`
      });
    }

    // Product found, calculate price
    let nameForPricing = (matchResult.row && (matchResult.row.Name || matchResult.row.Description || matchResult.row.Style)) || "";
    let calculatedPrice = 0;
    calculatedPrice = await getPriceFromDatabase(matchResult.row, nameForPricing, qcFlaw);

    // Update the existing MagentoInventory document instead of creating a new one
    const magentoInventoryItem = await MagentoInventory.findOneAndUpdate(
      { RefNum: manualRef }, // Find by the manual reference number
      {
        $set: {
          UPC: barcode || "", // Update UPC with the scanned barcode
          Quantity: (matchResult.row.Quantity || 0) + (quantity || 1), // Add to existing quantity
          Price: calculatedPrice,
          Date: new Date(),
          QcFlaw: qcFlaw || "none",
          SerialNumber: serialNumber || "",
          Source: `Magento Inventory Manual - ${sessionId}`
        }
      },
      { 
        new: true, // Return the updated document
        upsert: false // Don't create if not found (we already verified it exists)
      }
    );

    console.log(`[Magento Inventory] Manual entry updated existing document:`, magentoInventoryItem);

    // Add to session for undo functionality
    const currentSession = await getSession(sessionId);
    if (!currentSession.scannedItems) currentSession.scannedItems = [];
    if (!currentSession.totalPrice) currentSession.totalPrice = 0;

    currentSession.scannedItems.push({
      upc: barcode || "",
      refNum: manualRef,
      description: matchResult.row.Description || matchResult.row.Name || matchResult.row.Style || "",
      size: matchResult.row.Size || "",
      price: calculatedPrice,
      quantity: quantity || 1,
      qcFlaw: qcFlaw || "none",
      serialNumber: serialNumber || "",
      timestamp: new Date(),
      source: "manual_entry"
    });

    currentSession.totalPrice += calculatedPrice * (quantity || 1);
    await setSession(sessionId, currentSession);

    res.json({
      match: true,
      message: `Product added to Magento inventory via manual reference!`,
      spreadsheetMatch: matchResult.collection,
      descriptionResult: { description: matchResult.row.Description || matchResult.row.Name || matchResult.row.Style || "" },
      price: calculatedPrice,
      totalPrice: currentSession.totalPrice,
      scannedItemsCount: currentSession.scannedItems.length
    });

  } catch (err) {
    console.error(`[Magento Inventory] Error in manual entry endpoint:`, err);
    res.status(500).json({ error: "Failed to process manual entry" });
  }
});

// Magento Inventory new product endpoint
app.post("/api/magento-inventory/new-product", async (req, res) => {
  try {
    const { product, sessionId } = req.body;
    
    console.log(`[Magento Inventory] New product received:`, { product, sessionId });

    if (!product || !product.refNum) {
      return res.status(400).json({ error: "Product reference number is required" });
    }

    // Save the new product to MagentoInventory collection
    const magentoInventoryItem = new MagentoInventory({
      RefNum: product.refNum,
      UPC: product.barcode || "",
      MFR: product.manufacturer || "",
      Style: product.name || "",
      Size: product.size || "",
      Quantity: parseInt(product.quantity) || 1,
      Price: parseFloat(product.price) || 0,
      Date: new Date(),
      QcFlaw: product.qcFlaw || "none",
      SerialNumber: product.serialNumber || "",
      Source: `Magento Inventory New Product - ${sessionId}`
    });

    await magentoInventoryItem.save();
    console.log(`[Magento Inventory] New product saved:`, magentoInventoryItem);

    // Add to session for undo functionality
    const currentSession = await getSession(sessionId);
    if (!currentSession.scannedItems) currentSession.scannedItems = [];
    if (!currentSession.totalPrice) currentSession.totalPrice = 0;

    const calculatedPrice = parseFloat(product.price) || 0;
    const quantity = parseInt(product.quantity) || 1;

    currentSession.scannedItems.push({
      upc: product.barcode || "",
      refNum: product.refNum,
      description: product.name || "",
      size: product.size || "",
      price: calculatedPrice,
      quantity: quantity,
      qcFlaw: product.qcFlaw || "none",
      serialNumber: product.serialNumber || "",
      timestamp: new Date(),
      source: "new_product"
    });

    currentSession.totalPrice += calculatedPrice * quantity;
    await setSession(sessionId, currentSession);

    res.json({
      success: true,
      message: `New product added to Magento inventory successfully!`,
      product: magentoInventoryItem,
      totalPrice: currentSession.totalPrice,
      scannedItemsCount: currentSession.scannedItems.length
    });

  } catch (err) {
    console.error(`[Magento Inventory] Error in new product endpoint:`, err);
    res.status(500).json({ error: "Failed to add new product" });
  }
});

// Magento Inventory finish/complete session endpoint
app.post("/api/magento-inventory/finish", async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    console.log(`[Magento Inventory] Finish session received:`, { sessionId });

    // Clear the session data
    const currentSession = await getSession(sessionId);
    if (currentSession) {
      await setSession(sessionId, {
        scannedItems: [],
        totalPrice: 0
      });
      console.log(`[Magento Inventory] Session ${sessionId} cleared`);
    }
    
    res.json({
      success: true,
      message: `Magento inventory session ${sessionId} completed successfully!`
    });

  } catch (err) {
    console.error(`[Magento Inventory] Error in finish endpoint:`, err);
    res.status(500).json({ error: "Failed to complete Magento inventory session" });
  }
});

// Magento Inventory undo last scan endpoint
app.post("/api/magento-inventory/undo", async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    console.log(`[Magento Inventory] Undo request received:`, { sessionId });

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    // Get current session state
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
      
      console.log(`[Magento Inventory] Cleared pending state:`, pendingState.type);
      return res.json({
        message: "Cancelled pending operation",
        action: "clearPendingState",
        pendingType: pendingState.type,
        clearedSku: pendingState.sku || null,
        remainingItems: currentSession.scannedItems ? currentSession.scannedItems.length : 0
      });
    }

    // Check if there are any scanned items to undo
    if (!currentSession.scannedItems || currentSession.scannedItems.length === 0) {
      return res.status(400).json({ error: "No items to undo" });
    }

    // Get the last scanned item
    const lastItem = currentSession.scannedItems[currentSession.scannedItems.length - 1];
    console.log(`[Magento Inventory] Undoing last item:`, lastItem);

    // Reverse the database operation based on the last item
    if (lastItem.upc || lastItem.refNum) {
      try {
        // Find the document that was modified
        let findQuery = {};
        if (lastItem.upc) {
          findQuery.UPC = lastItem.upc;
        } else if (lastItem.refNum) {
          findQuery.RefNum = lastItem.refNum;
        }

        const existingDoc = await MagentoInventory.findOne(findQuery);
        
        if (existingDoc) {
          const newQuantity = Math.max(0, (existingDoc.Quantity || 0) - 1);
          
          // Always just decrement quantity, never remove the document
          await MagentoInventory.findOneAndUpdate(
            findQuery,
            {
              $set: {
                Quantity: newQuantity,
                Date: new Date()
              }
            }
          );
          console.log(`[Magento Inventory] Reduced quantity to ${newQuantity} for:`, findQuery);
        }
      } catch (dbError) {
        console.error(`[Magento Inventory] Error reversing database operation:`, dbError);
        // Continue with session cleanup even if database reversal fails
      }
    }

    // Remove the last item from session arrays
    currentSession.scannedItems.pop();
    
    if (currentSession.totalPrice && lastItem.price) {
      currentSession.totalPrice = Math.max(0, currentSession.totalPrice - lastItem.price);
    }

    // Save the updated session
    await setSession(sessionId, currentSession);

    console.log(`[Magento Inventory] Undo completed successfully`);
    return res.json({
      message: "Last scan undone successfully",
      action: "undoLastScan",
      undoneItem: lastItem,
      remainingItems: currentSession.scannedItems.length,
      newTotalPrice: currentSession.totalPrice || 0
    });

  } catch (err) {
    console.error(`[Magento Inventory] Error in undo endpoint:`, err);
    res.status(500).json({ error: "Failed to undo last scan" });
  }
});
