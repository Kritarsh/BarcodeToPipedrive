import mongoose from "mongoose";

const magentoInventorySchema = new mongoose.Schema({
  RefNum: String,
  UPC: String,
  MFR: String,
  Style: String,
  Size: String,
  Quantity: { type: Number, default: 0 },
  Date: { type: Date, default: Date.now },
  Price: { type: Number, default: 0 },
  QcFlaw: { type: String, default: "none" },
  SerialNumber: String,
  Source: { type: String, default: "magento" }, // To identify this as Magento inventory
});

// Export the model with the collection name "magentoinventory"
export default mongoose.model("MagentoInventory", magentoInventorySchema, "magentoinventory");
