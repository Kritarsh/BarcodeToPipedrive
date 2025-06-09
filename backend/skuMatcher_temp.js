import axios from "axios";
import xlsx from "xlsx";
import stringSimilarity from "string-similarity";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const UPC_API_KEY = process.env.UPC_API_KEY; // Set this in your .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const priceRules = [
  { keyword: "Mask", price: 10 },
  { keyword: "Cushion", price: 3 },
  { keyword: "Water Chamber", price: 5 },
  { keyword: "Heated Tubing", price: 5 },
  { keyword: "Standard Tubing", price: 0.5 },
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
];

export function getPriceForName(name, flaw) {
  let price = 0;
  if (!name) return price;
  for (const rule of priceRules) {
    if (name.toLowerCase().includes(rule.keyword.toLowerCase())) {
      price += rule.price;
      if (
        flaw != "none" &&
        (rule.keyword.toLowerCase().includes("mask") ||
          rule.keyword.toLowerCase().includes("Cushion") ||
          rule.keyword.toLowerCase().includes("Water Chamber") ||
          rule.keyword.toLowerCase().includes("Heated Tubing") ||
          rule.keyword.toLowerCase().includes("Standard Tubing") ||
          rule.keyword.toLowerCase().includes("Filters"))
      ) {
        price = 0;
      } else if (flaw != "none") {
        price = rule.price * 0.5;
      }
    }
  }
  return price;
}
export async function matchSkuWithDatabase(barcode) {
  // 1. Check spreadsheets first
  const spreadsheetFiles = [
    { file: "Inventory Supplies 2024.xlsx", columns: ["UPC"] },
    { file: "Overstock supplies other companies.xlsx", columns: ["UPC"] },
  ];

  for (const { file, columns } of spreadsheetFiles) {
    const filePath = join(__dirname, file);
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    for (const row of data) {
      for (const col of columns) {
        const cellValue = row[col] && row[col].toString();
        if (!cellValue) continue;

        // Direct match with barcode
        if (cellValue === barcode) {
          console.log(`Found exact match in ${file} at column ${col}`);
          return {
            match: true,
            file,
            row,
            matchedColumn: col,
            score: 1,
            brand: row["MFR"] || row["Brand"] || null,
            model: row["Style"] || row["Model"] || null,
            foundInSpreadsheet: true,
          };
        }
      }
    }
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

  // 3. (Optional) Fuzzy match brand/model with spreadsheet as before...
  // ...existing fuzzy match logic...
}

export async function matchSkuWithDatabaseManual(barcode, manualRef) {
  const spreadsheetFiles = [
    { file: "Inventory Supplies 2024.xlsx", columns: ["Ref #"] },
    { file: "Overstock supplies other companies.xlsx", columns: ["Ref #"] },
  ];

  for (const { file, columns } of spreadsheetFiles) {
    const filePath = join(__dirname, file);
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    const headers = xlsx.utils.sheet_to_json(sheet, { header: 1 })[0];
    console.log("Sheet names:", workbook.SheetNames);
    console.log("Headers", headers);
    try {
      for (const row of data) {
        for (const col of columns) {
          const cellValue = row[col] && row[col].toString();
          if (!cellValue) continue;
          console.log("cellValue", cellValue);
          const score = stringSimilarity.compareTwoStrings(
            manualRef,
            cellValue
          );
          if (score > 0.7) {
            return {
              match: true,
              file,
              row,
              matchedColumn: col,
              score,
              manualRef,
            };
          }
        }
      }
    } catch (error) {
      console.error("Error reading spreadsheet:", error.message);
      return { match: false, reason: "Spreadsheet read error" };
    }
  }

  // Only return "not found" after all files have been checked
  return {
    match: false,
    reason: "No fuzzy match found in sheets with manual reference",
    manualRef,
  };
}

export async function returnProductDescription({
  file,
  matchedColumn,
  rowValue,
  properValue,
  upc,
}) {
  const filePath = join(__dirname, file);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet);
  const relevantColumns = ["MFR", "Style", "Size"];

  for (const row of data) {
    if (
      row[matchedColumn] &&
      row[matchedColumn].toString() === properValue.toString()
    ) {
      // If the row matches, return the relevant columns
      const descriptionParts = [];
      for (const col of relevantColumns) {
        if (row[col]) {
          descriptionParts.push(row[col].toString());
        }
      }
      const description = descriptionParts.join(" ").trim();
      return {
        upc,
        description,
        file,
        matchedRow: row,
      };
    }
  }

  return "No matching row found";
}
export async function matchDescriptionWithDatabase(description) {
  const spreadsheetFiles = [
    { file: "Inventory Supplies 2024.xlsx", columns: ["MFR", "Style", "Size"] },
    {
      file: "Overstock supplies other companies.xlsx",
      columns: ["MFR", "Style", "Size"],
    },
  ];

  for (const { file, columns } of spreadsheetFiles) {
    const filePath = join(__dirname, file);
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    for (const row of data) {
      // Concatenate the two columns (with a space in between)
      for (let i = 0; i < columns.length - 1; i++) {
        if (!row[columns[i]] || !row[columns[i + 1]]) continue;

        // Ensure both columns exist and are strings
        const part1 = row[columns[i]] ? row[columns[i]].toString() : "";
        const part2 = row[columns[i + 1]] ? row[columns[i + 1]].toString() : "";
        const combined = `${part1} ${part2}`.trim();

        if (!combined) continue;

        // Fuzzy match description with the concatenated string
        const score = stringSimilarity.compareTwoStrings(description, combined);
        if (score > 0.7) {
          return {
            match: true,
            file,
            row,
            matchedColumns: [columns[i], columns[i + 1]],
            score,
            combined,
          };
        }
      }
    }
  }

  return {
    match: false,
    reason: "No fuzzy match found in sheets",
  };
}

export async function writeUPCToSpreadsheet({
  file,
  matchedColumn,
  rowValue,
  upc,
}) {
  console.log("About to join path", __dirname, file);
  const filePath = join(__dirname, file);
  console.log("File path:", filePath);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet);

  let updated = false;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (
      row[matchedColumn] &&
      row[matchedColumn].toString() === rowValue.toString()
    ) {
      data[i]["UPC"] = upc;
      updated = true;
      break;
    }
  }

  if (updated) {
    // Convert updated data back to worksheet and save
    const newSheet = xlsx.utils.json_to_sheet(data);
    workbook.Sheets[sheetName] = newSheet;
    xlsx.writeFile(workbook, filePath);
  }
}
export function appendMachineSpecific({
  name,
  upc,
  serialNumber,
  quantity = 1,
  date = new Date(),
}) {
  const filePath = join(__dirname, "machinespecifics.xlsx");
  let workbook, worksheet, data;

  try {
    workbook = xlsx.readFile(filePath);
    worksheet = workbook.Sheets[workbook.SheetNames[0]];
    data = xlsx.utils.sheet_to_json(worksheet);
  } catch (err) {
    // If file doesn't exist, create new
    workbook = xlsx.utils.book_new();
    data = [];
  }

  // Prepare new row
  const newRow = {
    Date: date.toISOString().split("T")[0],
    Quantity: quantity,
    Name: name,
    UPC: upc,
    "Serial Number": serialNumber,
  };

  data.push(newRow);

  // Convert back to worksheet and save
  const newSheet = xlsx.utils.json_to_sheet(data, {
    header: ["Date", "Quantity", "Name", "UPC", "Serial Number"],
  });
  workbook.SheetNames[0] = workbook.SheetNames[0] || "Sheet1";
  workbook.Sheets[workbook.SheetNames[0]] = newSheet;
  xlsx.writeFile(workbook, filePath);
}
