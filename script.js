// Wait until DOM is loaded
document.addEventListener('DOMContentLoaded', () => {

    // === SELECT ELEMENTS ===
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const languageSelector = document.getElementById('languageSelector');
    const translateBtn = document.getElementById('translateBtn');
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');

    // === SMOOTH SCROLL FOR NAV LINKS ===
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = anchor.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // === DRAG & DROP / CLICK UPLOAD HANDLERS ===
    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // === HANDLE FILE SELECTION ===
    function handleFileSelect(file) {
        // Validate file type
        const allowedTypes = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-ms-wmv'];
        if (!allowedTypes.includes(file.type)) {
            showNotification('❌ Please select a valid video file (MP4, AVI, MOV, WMV)');
            return;
        }

        // Validate file size (100 MB max)
        const maxSize = 100 * 1024 * 1024; // 100MB in bytes
        if (file.size > maxSize) {
            showNotification('❌ File size exceeds 100MB limit');
            return;
        }

        // Show file info
        fileName.textContent = file.name;
        fileSize.textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';
        fileInfo.style.display = 'block';

        // Show progress bar
        progressBar.style.display = 'block';
        simulateUploadProgress();
    }

    // === SIMULATE UPLOAD PROGRESS ===
    function simulateUploadProgress() {
        progressFill.style.width = '0%';
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 100) progress = 100;
            progressFill.style.width = progress + '%';

            if (progress >= 100) {
                clearInterval(interval);
                languageSelector.style.display = 'block';
                translateBtn.classList.add('active');
                showNotification('✅ File uploaded successfully! You can now select languages.');
            }
        }, 300);
    }

    // === TRANSLATE BUTTON CLICK ===
    translateBtn.addEventListener('click', () => {
        if (!translateBtn.classList.contains('active')) return;
        showNotification('🚀 Translation started! Please wait...');
        
        // Simulate translation delay
        setTimeout(() => {
            showNotification('✅ Translation completed! 🎉 Click download to save your file.');
        }, 4000);
    });

    // === SHOW NOTIFICATION FUNCTION ===
    function showNotification(message) {
        notificationText.textContent = message;
        notification.classList.add('show');

        setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    }
});
