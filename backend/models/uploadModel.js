import mongoose from "mongoose";

const uploadSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  size: Number,
  status: { type: String, default: "uploaded" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Upload", uploadSchema);
