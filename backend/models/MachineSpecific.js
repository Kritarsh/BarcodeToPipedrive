import mongoose from "mongoose";

const machineSpecificSchema = new mongoose.Schema({
  Name: { type: String, required: true },
  UPC: { type: String, required: true },
  SerialNumber: { type: String },
  Quantity: { type: Number, default: 1 },
  Date: { type: Date, default: Date.now },
});

export default mongoose.model("MachineSpecific", machineSpecificSchema);
