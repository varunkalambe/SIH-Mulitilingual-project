import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";

import connectDB from "./config/db.js";
import uploadRoutes from "./routes/uploadRoutes.js";

dotenv.config();
connectDB();

const app = express();

// Enable CORS for frontend (running outside backend folder)
app.use(cors({
    origin: "*", // or restrict to your frontend URL, e.g., "http://localhost:5500"
    methods: ["GET", "POST"]
}));

app.use(express.json());

// Serve uploaded videos
app.use("/uploads", express.static(path.join(path.resolve(), "backend/uploads")));

// Routes
app.use("/api/upload", uploadRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
