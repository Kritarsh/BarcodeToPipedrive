import xlsx from "xlsx";
import mongoose from "mongoose";
import Inventory from "./models/Inventory.js";
import Overstock from "./models/Overstock.js";
import MachineSpecific from "./models/MachineSpecific.js";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    migrateData();
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

async function migrateData() {
  // Migrate Inventory Supplies
  const inventoryFilePath = join(__dirname, "Inventory Supplies 2024.xlsx");
  const inventoryWorkbook = xlsx.readFile(inventoryFilePath);
  const inventorySheet =
    inventoryWorkbook.Sheets[inventoryWorkbook.SheetNames[0]];
  const inventoryData = xlsx.utils.sheet_to_json(inventorySheet);
  const inventoryDocs = inventoryData.map((item) => {
    item.RefNum = String(item["Ref #"]);
    return item;
  });
  await Inventory.insertMany(inventoryDocs);
  console.log("Inventory data migrated");

  // Migrate Overstock Supplies
  const overstockFilePath = join(
    __dirname,
    "Overstock supplies other companies.xlsx"
  );
  const overstockWorkbook = xlsx.readFile(overstockFilePath);
  const overstockSheet =
    overstockWorkbook.Sheets[overstockWorkbook.SheetNames[0]];
  const overstockData = xlsx.utils.sheet_to_json(overstockSheet);
  const overstockDocs = overstockData.map((item) => {
    item.RefNum = String(item["Ref #"]);
    return item;
  });
  await Overstock.insertMany(overstockDocs);
  console.log("Overstock data migrated");

  // Migrate Machine Specifics
  const machineFilePath = join(__dirname, "machinespecifics.xlsx");
  const machineWorkbook = xlsx.readFile(machineFilePath);
  const machineSheet = machineWorkbook.Sheets[machineWorkbook.SheetNames[0]];
  const machineData = xlsx.utils.sheet_to_json(machineSheet);
  for (const item of machineData) {
    await MachineSpecific.findOneAndUpdate({ UPC: item.UPC }, item, {
      upsert: true,
    });
  }
  console.log("Machine specifics data migrated");

  mongoose.disconnect();
}
