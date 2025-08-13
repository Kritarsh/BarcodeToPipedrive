import axios from "axios";
import xlsx from "xlsx";
import stringSimilarity from "string-similarity";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import Merged from "./models/Merged.js";
import MachineSpecific from "./models/MachineSpecific.js";
import MagentoInventory from "./models/MagentoInventory.js";

const UPC_API_KEY = process.env.UPC_API_KEY; // Set this in your .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const priceRules = [
  { keyword: "Mask", price: 10 },
  { keyword: "Cushion", price: 3 },
  { keyword: "Water Chamber", price: 5 },
  { keyword: "Heated", price: 5 },
  { keyword: "Standard", price: 0.5 },
  { keyword: "Filters", price: 0 },
  { keyword: "AirSense 10", price: 25 },
  { keyword: "AirSense 11", price: 100 },
  { keyword: "AirCurve VAuto", price: 75 },
  { keyword: "AirCurve ASV", price: 125 },
  { keyword: "AirCurve ST", price: 200 },
  { keyword: "Trilogy Evo", price: 200 },
  { keyword: "AirMini AutoSet", price: 50 },
  { keyword: "Astral", price: 400 },
  { keyword: "Series 9 AutoSet", price: 5 },
  { keyword: "Series 9 CPAP", price: 5 },
  { keyword: "Series 9 BiPAP", price: 5 },
  { keyword: "Series 9 Elite", price: 5 },
  { keyword: "CoughAssist T70", price: 250 },
  { keyword: "Oxygen Concentrator", price: 50 },
  {keyword: "FFM", price: 10},
  {keyword: "Leak", price: 10},
  {keyword: "Climatelinear", price: 5},
  {keyword: "STPK", price: 10},
  {keyword: "fitpack", price: 10},
  {keyword: "Frame", price: 10},
  {keyword: "Pillows", price: 3},
  {keyword: "Pillow", price: 3},
  {keyword: "W/", price: 10}




];

// New function to get price from database or fallback to pricing rules
export function getPriceFromDatabase(product, name, flaw) {
  // First check if the product has a price in the database
  if (product && product.Price !== undefined && product.Price !== undefined) {
    const dbPrice = product.Price; // Now it's already a Number
    // Apply flaw adjustments to database price
    if (flaw !== "none") {
      // Check if it's a machine by looking at product name/category
      const isMachine = name && (
        name.toLowerCase().includes("airsense") ||
        name.toLowerCase().includes("aircurve") ||
        name.toLowerCase().includes("trilogy") ||
        name.toLowerCase().includes("airmini") ||
        name.toLowerCase().includes("astral") ||
        name.toLowerCase().includes("series 9") ||
        name.toLowerCase().includes("coughassist") ||
        name.toLowerCase().includes("oxygen concentrator")
      );
      
      if (isMachine) {
        return dbPrice * 0.5; // Half price for flawed machines
      } else {
        return 0; // No value for flawed supplies
      }
    }
    return dbPrice;
  }
  
  // Fallback to pricing rules (mainly for machines without DB prices)
  return getPriceForName(name, flaw);
}

export function getPriceForName(name, flaw) {
  let price = 0;
  if (!name) return price;
  
  for (const rule of priceRules) {
    if (name.toLowerCase().includes(rule.keyword.toLowerCase())) {
      price += rule.price;
      
      // Check if it's a machine (based on machine keywords)
      const isMachine = (
        rule.keyword.toLowerCase().includes("airsense") ||
        rule.keyword.toLowerCase().includes("aircurve") ||
        rule.keyword.toLowerCase().includes("trilogy") ||
        rule.keyword.toLowerCase().includes("airmini") ||
        rule.keyword.toLowerCase().includes("astral") ||
        rule.keyword.toLowerCase().includes("series 9") ||
        rule.keyword.toLowerCase().includes("coughassist") ||
        rule.keyword.toLowerCase().includes("oxygen concentrator")
      );
      
      // Default condition: if flaw and it's a machine, do half off
      if (flaw != "none" && isMachine) {
        price = rule.price * 0.5;
      } 
      // Else if flaw and it's a supply item, price = 0
      else if (flaw != "none") {
        price = 0;
      }
      // Else return the actual price (no flaw)
      else {
        price = rule.price;
      }
      
      return price;
    }
  }
  return price;
}
export async function matchSkuWithDatabase(barcode) {
  // 1. Check MongoDB collections first
  const mergedMatch = await Merged.findOne({ UPC: barcode });
  if (mergedMatch) {
    console.log("Found exact match in Merged collection");
    return {
      match: true,
      collection: "Merged",
      row: mergedMatch,
      matchedColumn: "UPC",
      score: 1,
      brand: mergedMatch.MFR || null,
      model: mergedMatch.Style || null,
      foundInMongoDB: true,
    };
  }

  // 2. If not found, query UPCdatabase.org
  let productInfo;
  try {
    const upcRes = await axios.get(
      `https://api.upcdatabase.org/product/${barcode}`,
      {
        params: { apikey: UPC_API_KEY },
      }
    );
    productInfo = upcRes.data;
  } catch (err) {
    console.error("UPC API error:", err.message);
    return { match: false, reason: "UPC API error" };
  }

  const { brand, model } = productInfo;
  if (!brand && !model) {
    console.log("No brand or model found in UPC API response");
    return {
      match: false,
      reason: "no_brand_or_model",
      message:
        "Enter the reference number manually, the barcode reference number association will be saved next time",
    };
  }

  // 3. (Optional) Fuzzy match brand/model with MongoDB as before...
  // ...existing fuzzy match logic...
}

export async function matchSkuWithDatabaseManual(barcode, manualRef) {
  // Case-insensitive search using regex
  const refRegex = new RegExp(`^${manualRef}$`, 'i');
  
  const mergedMatch = await Merged.findOne({ "RefNum": refRegex });
  if (mergedMatch) {
    return {
      match: true,
      collection: "Merged",
      row: mergedMatch,
      matchedColumn: "RefNum",
      score: 1,
      manualRef,
    };
  }

  return {
    match: false,
    reason: "No fuzzy match found in MongoDB collections with manual reference",
    manualRef,
  };
}

export async function returnProductDescription({
  collection,
  matchedColumn,
  rowValue,
  properValue,
  upc,
}) {
  let model;
  if (collection === "Merged") {
    model = Merged;
  } else {
    return "Invalid collection";
  }

  const row = await model.findOne({ [matchedColumn]: properValue });
  if (row) {
    const descriptionParts = [];
    if (row.MFR) descriptionParts.push(row.MFR);
    if (row.Style) descriptionParts.push(row.Style);
    if (row.Size) descriptionParts.push(row.Size);
    const description = descriptionParts.join(" ").trim();
    return {
      upc,
      description,
      collection,
      matchedRow: row,
    };
  }

  return "No matching row found";
}

export async function writeUPCToMongoDB({
  collection,
  matchedColumn,
  rowValue,
  upc,
}) {
  let model;
  if (collection === "Merged") {
    model = Merged;
  } else {
    return "Invalid collection";
  }

  const result = await model.updateOne(
    { [matchedColumn]: rowValue },
    { $set: { UPC: upc } }
  );
  return result;
}

export async function appendMachineSpecific({
  name,
  upc,
  serialNumber,
  quantity = 1,
  date = new Date(),
}) {
  const newMachine = new MachineSpecific({
    Name: name,
    UPC: upc,
    SerialNumber: serialNumber,
    Quantity: quantity,
    Date: date,
  });
  await newMachine.save();
}

export async function incrementSupplyQuantity({
  collection,
  name,
  upc,
  size = "",
  quantity = 1,
  date = new Date(),
}) {
  let model;
  if (collection === "Merged") {
    model = Merged;
  } else {
    return "Invalid collection";
  }

  const query = upc ? { UPC: upc } : { Name: name, Size: size };
  const result = await model.findOneAndUpdate(
    query,
    { $inc: { Quantity: quantity }, $set: { Date: date } },
    { upsert: true, new: true }
  );
  return result;
}

export async function matchSkuWithMagentoInventory(barcode) {
  // Only check MagentoInventory collection
  const magentoMatch = await MagentoInventory.findOne({ UPC: barcode });
  if (magentoMatch) {
    console.log("Found exact match in MagentoInventory collection");
    return {
      match: true,
      collection: "MagentoInventory",
      row: magentoMatch,
      matchedColumn: "UPC",
      score: 1,
      brand: magentoMatch.Manufacturer || null,
      model: magentoMatch.Name || null,
      foundInMongoDB: true,
    };
  }

  // If not found in MagentoInventory, return no match
  console.log("No match found in MagentoInventory collection for barcode:", barcode);
  return { 
    match: false, 
    reason: "no_match_in_magento_inventory",
    message: "Barcode not found in MagentoInventory database"
  };
}

export async function matchSkuWithMagentoInventoryManual(barcode, manualRef) {
  // Only check MagentoInventory collection by RefNum
  const magentoMatch = await MagentoInventory.findOne({ "RefNum": manualRef });
  if (magentoMatch) {
    return {
      match: true,
      collection: "MagentoInventory",
      row: magentoMatch,
      matchedColumn: "RefNum",
      score: 1,
      manualRef,
    };
  }

  return {
    match: false,
    reason: "No match found in MagentoInventory collection with manual reference",
    manualRef,
  };
}
