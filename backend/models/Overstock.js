import mongoose from "mongoose";

const overstockSchema = new mongoose.Schema({
  RefNum: { type: String, required: true },
  UPC: { type: String },
  MFR: { type: String },
  Style: { type: String },
  Size: { type: String },
  Quantity: { type: Number, default: 0 },
  Date: { type: Date, default: Date.now },
});

export default mongoose.model("Overstock", overstockSchema);
