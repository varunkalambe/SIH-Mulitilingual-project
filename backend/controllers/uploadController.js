export const uploadVideo = async (req, res) => {
    try {
        const file = req.file;
        const fromLang = req.body.fromLang;
        const toLang = req.body.toLang;

        if(!file) return res.status(400).json({ error: "No file uploaded" });

        console.log("File uploaded:", file.filename);
        console.log("From:", fromLang, "To:", toLang);

        // Return URL to download the uploaded file
        const downloadUrl = `http://localhost:${process.env.PORT || 5000}/uploads/original/${file.filename}`;
        res.json({ downloadUrl });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
};
