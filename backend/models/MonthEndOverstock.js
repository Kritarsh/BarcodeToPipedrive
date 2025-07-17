import mongoose from "mongoose";

const monthEndOverstockSchema = new mongoose.Schema({
  RefNum: String,
  UPC: String,
  MFR: String,
  Style: String,
  Size: String,
  Quantity: { type: Number, default: 0 },
  Date: { type: Date, default: Date.now },
  Price: { type: Number, default: 0 }, // Changed to Number type
});

// Add the third parameter to match your actual MongoDB collection name
export default mongoose.model("MonthEndOverstock", monthEndOverstockSchema, "overstocksMonthEnd");
