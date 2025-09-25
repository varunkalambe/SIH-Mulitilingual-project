// resumeVideoAssembly.js - FIXED to auto-detect files from uploads folder
import { assembleVideoWithCaptions } from './services/videoService.js';
import Upload from './models/uploadModel.js';
import connectDB from './config/db.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// ===== TARGET JOB ID (from your successful processing) =====
const JOB_ID = '68d493a856b5122a37825220';

async function resumeVideoAssembly() {
  try {
    console.log('🎬 Resuming Video Assembly from Step 7...');
    console.log(`🎯 Target Job ID: ${JOB_ID}`);
    console.log('📋 This will run ONLY video assembly and completion steps');
    
    // ===== CONNECT TO DATABASE =====
    await connectDB();
    console.log('✅ MongoDB Connected');
    
    // ===== VERIFY JOB EXISTS =====
    const jobData = await Upload.findById(JOB_ID);
    if (!jobData) {
      throw new Error(`Job ${JOB_ID} not found in database`);
    }
    
    console.log(`\n📋 Job Status Check:`);
    console.log(`   🔄 Current status: ${jobData.processing_status || 'NOT SET'}`);
    console.log(`   📝 Current step: ${jobData.processing_step || 'NOT SET'}`);
    
    // ===== AUTO-DETECT FILE PATHS FROM UPLOADS FOLDER =====
    console.log(`\n🔍 Auto-detecting files from uploads folder...`);
    
    // Define expected file paths based on uploads folder structure
    const expectedPaths = {
      originalVideo: null,
      ttsAudio: `./uploads/translated_audio/${JOB_ID}_translated.wav`,
      captions: `./uploads/captions/${JOB_ID}_captions.vtt`,
      srtCaptions: `./uploads/captions/${JOB_ID}_captions.srt`,
      transcript: `./uploads/transcripts/${JOB_ID}_transcript.txt`
    };
    
    // Auto-detect original video file from uploads/originals/
    const originalsDir = './uploads/originals/';
    if (fs.existsSync(originalsDir)) {
      const files = fs.readdirSync(originalsDir);
      const videoFiles = files.filter(file => 
        file.endsWith('.mp4') || file.endsWith('.mov') || 
        file.endsWith('.avi') || file.endsWith('.mkv')
      );
      
      if (videoFiles.length > 0) {
        // Use the most recent video file or the one matching the timestamp pattern
        const targetVideoFile = videoFiles.find(file => 
          file.includes('1758761895481') // From your logs
        ) || videoFiles[videoFiles.length - 1]; // Most recent if pattern not found
        
        expectedPaths.originalVideo = path.join(originalsDir, targetVideoFile);
        console.log(`   📁 Found original video: ${targetVideoFile}`);
      }
    }
    
    // ===== VERIFY ALL REQUIRED FILES EXIST =====
    console.log(`\n✅ File Verification:`);
    const requiredFiles = [
      { name: 'Original Video', path: expectedPaths.originalVideo },
      { name: 'TTS Audio', path: expectedPaths.ttsAudio },
      { name: 'WebVTT Captions', path: expectedPaths.captions }
    ];
    
    let missingFiles = [];
    
    for (const file of requiredFiles) {
      if (!file.path) {
        missingFiles.push(`${file.name}: Path could not be determined`);
        console.log(`   ❌ ${file.name}: Not found`);
      } else if (!fs.existsSync(file.path)) {
        missingFiles.push(`${file.name}: File not found at ${file.path}`);
        console.log(`   ❌ ${file.name}: Missing at ${file.path}`);
      } else {
        const stats = fs.statSync(file.path);
        const sizeInMB = Math.round(stats.size / 1024 / 1024);
        console.log(`   ✅ ${file.name}: Found (${sizeInMB} MB)`);
      }
    }
    
    if (missingFiles.length > 0) {
      console.error(`\n❌ Missing required files:`);
      missingFiles.forEach(file => console.error(`   ❌ ${file}`));
      
      // List available files for debugging
      console.log(`\n📂 Available files in uploads folder:`);
      const uploadsDirs = ['originals', 'translated_audio', 'captions', 'transcripts', 'processed'];
      uploadsDirs.forEach(dir => {
        const dirPath = `./uploads/${dir}/`;
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath);
          console.log(`   📁 ${dir}/: ${files.length} files`);
          files.forEach(file => console.log(`      - ${file}`));
        } else {
          console.log(`   📁 ${dir}/: Directory not found`);
        }
      });
      
      throw new Error(`Cannot proceed - ${missingFiles.length} required files are missing`);
    }
    
    console.log(`\n✅ All required files found. Proceeding with video assembly...`);
    
    // ===== UPDATE DATABASE WITH CORRECT FILE PATHS =====
    console.log(`\n🔧 Updating database with correct file paths...`);
    await Upload.findByIdAndUpdate(JOB_ID, {
      original_file_path: expectedPaths.originalVideo,
      tts_audio_path: expectedPaths.ttsAudio,
      caption_file_path: expectedPaths.captions,
      caption_srt_path: expectedPaths.srtCaptions,
      transcript_file_path: expectedPaths.transcript,
      processing_status: 'processing',
      processing_step: 'video_assembly',
      video_assembly_started_at: new Date()
    });
    console.log(`✅ Database updated with correct file paths`);
    
    console.log(`\n🎬 Starting Step 7: Video Assembly...`);
    
    // ===== STEP 7: ASSEMBLE FINAL VIDEO WITH CAPTIONS =====
    console.log(`[${JOB_ID}] Step 6/6: Assembling final translated video with captions...`);
    console.log(`[${JOB_ID}] Files to combine:`);
    console.log(`[${JOB_ID}]   📹 Video: ${expectedPaths.originalVideo}`);
    console.log(`[${JOB_ID}]   🔊 Audio: ${expectedPaths.ttsAudio}`);
    console.log(`[${JOB_ID}]   📝 Captions: ${expectedPaths.captions}`);
    
    const finalVideoPath = await assembleVideoWithCaptions(JOB_ID);
    console.log(`[${JOB_ID}] ✅ Video assembly completed: ${finalVideoPath}`);
    
    // ===== STEP 8: MARK JOB AS COMPLETED =====
    console.log(`\n✅ Starting Step 8: Job Completion...`);
    
    // Calculate processing duration
    const upload = await Upload.findById(JOB_ID).select('processing_started_at video_assembly_started_at');
    let processingDuration = 0;
    
    if (upload.processing_started_at) {
      processingDuration = new Date() - upload.processing_started_at;
    } else if (upload.video_assembly_started_at) {
      processingDuration = new Date() - upload.video_assembly_started_at;
    }
    
    await Upload.findByIdAndUpdate(JOB_ID, {
      processing_status: 'completed',
      processing_step: 'completed',
      processed_file_path: finalVideoPath,
      completed_at: new Date(),
      processing_duration_ms: processingDuration,
      video_assembly_completed_at: new Date(),
      $push: { 
        errorMessages: `Video assembly resumed and completed on ${new Date().toISOString()}` 
      }
    });
    
    console.log(`[${JOB_ID}] 🎉 PROCESSING COMPLETED SUCCESSFULLY!`);
    console.log(`[${JOB_ID}] All files are ready for user download and viewing`);
    
    // ===== DISPLAY FINAL RESULTS =====
    const completedJob = await Upload.findById(JOB_ID);
    console.log(`\n📁 Final Output Files:`);
    console.log(`   🎥 Final Video: ${completedJob.processed_file_path}`);
    console.log(`   🔊 Bengali Audio: ${completedJob.tts_audio_path}`);
    console.log(`   📝 WebVTT Captions: ${completedJob.caption_file_path}`);
    console.log(`   📝 SRT Subtitles: ${completedJob.caption_srt_path}`);
    console.log(`   📄 Transcript: ${completedJob.transcript_file_path}`);
    
    // Verify final video exists
    if (fs.existsSync(finalVideoPath)) {
      const finalStats = fs.statSync(finalVideoPath);
      const finalSizeInMB = Math.round(finalStats.size / 1024 / 1024);
      console.log(`\n🎯 Processing Summary:`);
      console.log(`   ⏱️ Assembly Duration: ${Math.round(processingDuration / 1000)} seconds`);
      console.log(`   📊 Final Status: ${completedJob.processing_status}`);
      console.log(`   📁 Final Video Size: ${finalSizeInMB} MB`);
      console.log(`   ✅ Job completed at: ${completedJob.completed_at}`);
      
      console.log(`\n🚀 Your translated video is ready!`);
      console.log(`📥 Download from: ${finalVideoPath}`);
      console.log(`🎬 Features: Hindi→Bengali audio + Bengali subtitles + Original video`);
    } else {
      console.warn(`\n⚠️ Warning: Final video file not found at ${finalVideoPath}`);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error(`[${JOB_ID}] ❌ VIDEO ASSEMBLY FAILED!`);
    console.error(`[${JOB_ID}] Error message: ${error.message}`);
    console.error(`[${JOB_ID}] Error stack trace:`, error.stack);
    
    // ===== UPDATE DATABASE WITH FAILURE =====
    try {
      await Upload.findByIdAndUpdate(JOB_ID, {
        processing_status: 'failed',
        processing_step: 'video_assembly_failed',
        error_message: error.message,
        error_details: error.stack,
        failed_at: new Date(),
        $push: { errorMessages: `Video assembly failed: ${error.message}` }
      });
      
      console.log(`[${JOB_ID}] ✅ Error status saved to database`);
      
    } catch (dbError) {
      console.error(`[${JOB_ID}] ❌ Failed to update database with error status:`, dbError.message);
    }
    
    process.exit(1);
  }
}

// ===== HANDLE SCRIPT TERMINATION =====
process.on('SIGINT', () => {
  console.log('\n⚠️ Video assembly interrupted by user (Ctrl+C)');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️ Video assembly terminated');
  process.exit(1);
});

// ===== SCRIPT INITIALIZATION =====
console.log('🎬 Video Assembly Resume Script Initialized (Auto-Detect Mode)');
console.log('🎯 Target Job ID: 68d493a856b5122a37825220');
console.log('📂 Auto-detecting files from uploads/ folder structure');
console.log('🔧 Will update database with correct file paths automatically');
console.log('⏳ Starting resume process...\n');

// ===== RUN THE RESUME PROCESS =====
resumeVideoAssembly();
