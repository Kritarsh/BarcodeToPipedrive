import mongoose from "mongoose";

const magentoInventorySchema = new mongoose.Schema({
  ID: { type: Number, unique: true }, // Auto-generated ID
  Name: String, // Product name
  RefNum: String,
  UPC: String,
  Manufacturer: String, // Changed from MFR
  size: String, // Changed from Size (lowercase)
  Quantity: { type: Number, default: 0 },
  Price: { type: Number, default: 0 },
  Websites: { type: String, default: "Main Website" }, // Always "Main Website" for new products
  Date: { type: Date, default: Date.now },
  QcFlaw: { type: String, default: "none" },
  SerialNumber: String,
  Source: { type: String, default: "magento" }, // To identify this as Magento inventory
});

// Export the model with the collection name "magentoinventory"
export default mongoose.model("MagentoInventory", magentoInventorySchema, "magentoinventory");
