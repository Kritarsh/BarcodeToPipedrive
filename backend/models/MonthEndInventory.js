import mongoose from "mongoose";

const monthEndInventorySchema = new mongoose.Schema({
  RefNum: String,
  UPC: String,
  MFR: String,
  Style: String,
  Size: String,
  Quantity: { type: Number, default: 0 },
  Date: { type: Date, default: Date.now },
  Price: { type: mongoose.Schema.Types.Decimal128, default: 0 }, // Added Price field
});

// Add the third parameter to match your actual MongoDB collection name
export default mongoose.model("MonthEndInventory", monthEndInventorySchema, "inventoriesMonthEnd");
