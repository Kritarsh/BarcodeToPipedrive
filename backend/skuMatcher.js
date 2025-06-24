import axios from "axios";
import xlsx from "xlsx";
import stringSimilarity from "string-similarity";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import Inventory from "./models/Inventory.js";
import Overstock from "./models/Overstock.js";
import MachineSpecific from "./models/MachineSpecific.js";

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



];

export function getPriceForName(name, flaw) {
  let price = 0;
  if (!name) return price;
  for (const  rule of priceRules) {
    if (name.toLowerCase().includes(rule.keyword.toLowerCase())) {
      price += rule.price;
      if (
        flaw != "none" &&
        (
          rule.keyword.toLowerCase().includes("mask") ||
          rule.keyword.toLowerCase().includes("cushion") ||
          rule.keyword.toLowerCase().includes("water chamber") ||
          rule.keyword.toLowerCase().includes("heated") ||
          rule.keyword.toLowerCase().includes("standard") ||
          rule.keyword.toLowerCase().includes("filters") ||
          rule.keyword.toLowerCase().includes("ffm") ||
          rule.keyword.toLowerCase().includes("leak") ||
          rule.keyword.toLowerCase().includes("climatelinear") ||
          rule.keyword.toLowerCase().includes("stpk") ||
          rule.keyword.toLowerCase().includes("fitpack") ||
          rule.keyword.toLowerCase().includes("frame") ||
          rule.keyword.toLowerCase().includes("pillows") ||
          rule.keyword.toLowerCase().includes("pillow")
        )
      ) {
        price = 0;
      } else if (flaw != "none") {
        price = rule.price * 0.5;
      }
      return price;
    }
  }
  return price;
}
export async function matchSkuWithDatabase(barcode) {
  // 1. Check MongoDB collections first
  const inventoryMatch = await Inventory.findOne({ UPC: barcode });
  if (inventoryMatch) {
    console.log("Found exact match in Inventory collection");
    return {
      match: true,
      collection: "Inventory",
      row: inventoryMatch,
      matchedColumn: "UPC",
      score: 1,
      brand: inventoryMatch.MFR || null,
      model: inventoryMatch.Style || null,
      foundInMongoDB: true,
    };
  }

  const overstockMatch = await Overstock.findOne({ UPC: barcode });
  if (overstockMatch) {
    console.log("Found exact match in Overstock collection");
    return {
      match: true,
      collection: "Overstock",
      row: overstockMatch,
      matchedColumn: "UPC",
      score: 1,
      brand: overstockMatch.MFR || null,
      model: overstockMatch.Style || null,
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
  const inventoryMatch = await Inventory.findOne({ "RefNum": manualRef });
  if (inventoryMatch) {
    return {
      match: true,
      collection: "Inventory",
      row: inventoryMatch,
      matchedColumn: "RefNum",
      score: 1,
      manualRef,
    };
  }

  const overstockMatch = await Overstock.findOne({ "RefNum": manualRef });
  if (overstockMatch) {
    return {
      match: true,
      collection: "Overstock",
      row: overstockMatch,
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
  if (collection === "Inventory") {
    model = Inventory;
  } else if (collection === "Overstock") {
    model = Overstock;
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
  if (collection === "Inventory") {
    model = Inventory;
  } else if (collection === "Overstock") {
    model = Overstock;
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
  if (collection === "Inventory") {
    model = Inventory;
  } else if (collection === "Overstock") {
    model = Overstock;
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
