import Upload from "../models/uploadModel.js";
import { processVideo } from "../controllers/processController.js";  // ADD THIS

export const uploadVideo = async (req, res) => {
    try {
        const file = req.file;
        const fromLang = req.body.fromLang;
        const toLang = req.body.toLang;

        if(!file) return res.status(400).json({ error: "No file uploaded" });

        // Create full file path
        const filePath = `uploads/originals/${file.filename}`;
        
        // Save to database with processing fields
        const upload = new Upload({
            filename: file.filename,
            originalName: file.originalname,
            size: file.size,
            file_path: filePath,  // For process controller
            target_language: toLang,
            source_language: fromLang,
            processing_status: "uploaded"
        });

        const savedUpload = await upload.save();
        
        console.log("File uploaded:", file.filename);
        console.log("From:", fromLang, "To:", toLang);
        console.log("Job ID:", savedUpload._id);

        // Start processing pipeline asynchronously
        processVideo(savedUpload._id.toString()).catch(error => {
            console.error("Processing failed:", error.message);
        });

        // Return job info immediately
        const downloadUrl = `http://localhost:${process.env.PORT || 5000}/uploads/originals/${file.filename}`;
        
        res.json({ 
            downloadUrl,
            jobId: savedUpload._id,
            status: "uploaded",
            message: "Upload successful, processing started"
        });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
};
