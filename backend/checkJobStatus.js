// checkJobStatus.js - Check what data exists for the job
import mongoose from 'mongoose';
import Upload from './models/uploadModel.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ===== DATABASE CONNECTION =====
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

// ===== MAIN FUNCTION TO CHECK JOB STATUS =====
async function checkJobStatus() {
  try {
    console.log('🔍 Checking Job Status in Database...');
    console.log('📋 Connecting to database...');
    
    // Connect to database
    await connectDB();
    
    // Job ID from your previous processing attempt
    const jobId = '68d403a075ed1a5cf8543db3';
    console.log(`🔍 Looking for job: ${jobId}`);
    
    // Find job in database
    const jobData = await Upload.findById(jobId);
    
    if (!jobData) {
      console.log('❌ Job not found in database!');
      console.log('💡 This means the job ID is incorrect or the job was deleted');
      console.log('🔧 Try running your video upload process again to create a new job');
      process.exit(1);
    }
    
    // Display comprehensive job information
    console.log(`\n📋 Job Details for: ${jobId}`);
    console.log('='.repeat(60));
    
    // ===== BASIC JOB INFO =====
    console.log('📁 FILE INFORMATION:');
    console.log(`   📁 Original filename: ${jobData.original_filename || 'NOT SET'}`);
    console.log(`   📁 Original file path: ${jobData.original_file_path || 'NOT SET'}`);
    console.log(`   📁 Audio file path: ${jobData.audio_file_path || 'NOT SET'}`);
    console.log(`   🔄 Current status: ${jobData.status || 'NOT SET'}`);
    console.log(`   📅 Created at: ${jobData.createdAt || 'NOT SET'}`);
    console.log(`   📅 Updated at: ${jobData.updatedAt || 'NOT SET'}`);
    
    // ===== LANGUAGE INFO =====
    console.log('\n🗣️ LANGUAGE INFORMATION:');
    console.log(`   🗣️ Original language: ${jobData.original_language || 'NOT SET'}`);
    console.log(`   🌐 Target language: ${jobData.target_language || 'NOT SET'}`);
    console.log(`   🌐 Target language name: ${jobData.target_language_name || 'NOT SET'}`);
    
    // ===== PROCESSING DATA =====
    console.log('\n📝 PROCESSING DATA:');
    console.log(`   📝 Transcribed text: ${jobData.transcribed_text ? `${jobData.transcribed_text.substring(0, 100)}...` : 'NOT SET'}`);
    console.log(`   🌐 Translated text: ${jobData.translated_text ? `${jobData.translated_text.substring(0, 100)}...` : 'NOT SET'}`);
    console.log(`   🎯 Translated segments: ${jobData.translated_segments ? `${jobData.translated_segments.length} segments` : 'NOT SET'}`);
    
    // ===== DURATION INFO =====
    console.log('\n⏱️ DURATION INFORMATION:');
    console.log(`   ⏱️ Audio duration: ${jobData.audio_duration || 'NOT SET'} seconds`);
    console.log(`   ⏱️ Video duration: ${jobData.video_duration || 'NOT SET'} seconds`);
    console.log(`   ⏱️ Original duration: ${jobData.original_duration || 'NOT SET'} seconds`);
    
    // ===== OUTPUT FILES =====
    console.log('\n🎵 OUTPUT FILES:');
    console.log(`   🔊 TTS audio path: ${jobData.tts_audio_path || 'NOT SET'}`);
    console.log(`   📝 Caption VTT path: ${jobData.caption_vtt_path || 'NOT SET'}`);
    console.log(`   📝 Caption SRT path: ${jobData.caption_srt_path || 'NOT SET'}`);
    console.log(`   📄 Transcript path: ${jobData.transcript_path || 'NOT SET'}`);
    console.log(`   🎥 Processed video path: ${jobData.processed_video_path || 'NOT SET'}`);
    
    // ===== ERROR MESSAGES =====
    if (jobData.errorMessages && jobData.errorMessages.length > 0) {
      console.log('\n⚠️ ERROR MESSAGES:');
      jobData.errorMessages.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
    
    // ===== PROCESSING STEPS ANALYSIS =====
    console.log('\n📊 PROCESSING STEPS COMPLETED:');
    const steps = [
      { name: 'Upload', check: !!jobData.original_file_path, icon: '📁' },
      { name: 'Audio Extraction', check: !!jobData.audio_file_path, icon: '🎵' },
      { name: 'Transcription', check: !!jobData.transcribed_text, icon: '📝' },
      { name: 'Translation', check: !!jobData.translated_text, icon: '🌐' },
      { name: 'TTS Generation', check: !!jobData.tts_audio_path, icon: '🔊' },
      { name: 'Caption Generation', check: !!(jobData.caption_vtt_path || jobData.caption_srt_path), icon: '📄' },
      { name: 'Final Video Assembly', check: !!jobData.processed_video_path, icon: '🎥' }
    ];
    
    steps.forEach(step => {
      const status = step.check ? '✅' : '❌';
      console.log(`   ${step.icon} ${step.name}: ${status}`);
    });
    
    // ===== COMPLETION PERCENTAGE =====
    const completedSteps = steps.filter(step => step.check).length;
    const completionPercentage = Math.round((completedSteps / steps.length) * 100);
    console.log(`\n📈 Overall Progress: ${completedSteps}/${steps.length} (${completionPercentage}%)`);
    
    // ===== RECOMMENDED ACTIONS =====
    console.log('\n🔧 RECOMMENDED ACTION:');
    
    if (!jobData.original_file_path) {
      console.log('❌ Job missing original file - may be corrupted');
      console.log('💡 Command: Re-upload your video file');
      
    } else if (!jobData.audio_file_path) {
      console.log('⚠️ Need audio extraction');
      console.log('💡 Command: Run audio extraction service');
      
    } else if (!jobData.transcribed_text) {
      console.log('⚠️ Need transcription (speech-to-text)');
      console.log('💡 Command: Use your normal video upload/processing endpoint');
      console.log('💡 Alternative: Run transcription service manually');
      
    } else if (!jobData.translated_text) {
      console.log('⚠️ Need translation');
      console.log('💡 Command: Run translation service manually');
      console.log('💡 Command: node fixJobData.js (to populate from previous logs)');
      
    } else if (!jobData.tts_audio_path) {
      console.log('✅ Ready for TTS step!');
      console.log('💡 Command: node resumeTTS.js or npm run resume-tts');
      console.log('🎯 This will use the corrected Edge-TTS parameters');
      
    } else if (!jobData.processed_video_path) {
      console.log('✅ Ready for final video assembly!');
      console.log('💡 Command: node completeProcessing.js or npm run complete-processing');
      
    } else {
      console.log('🎉 Job is COMPLETE!');
      console.log('✅ All processing steps finished successfully');
      console.log(`🎥 Final video: ${jobData.processed_video_path}`);
      console.log('💡 You can download and use your translated video!');
    }
    
    // ===== FILE EXISTENCE CHECK =====
    console.log('\n🗂️ FILE EXISTENCE CHECK:');
    const fs = await import('fs');
    const filesToCheck = [
      { label: 'Original Video', path: jobData.original_file_path },
      { label: 'Audio File', path: jobData.audio_file_path },
      { label: 'TTS Audio', path: jobData.tts_audio_path },
      { label: 'Final Video', path: jobData.processed_video_path }
    ];
    
    filesToCheck.forEach(file => {
      if (file.path) {
        const exists = fs.existsSync(file.path);
        const status = exists ? '✅' : '❌ MISSING';
        console.log(`   📁 ${file.label}: ${status}`);
        if (!exists) {
          console.log(`      Path: ${file.path}`);
        }
      }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('🔍 Job status check completed!');
    
    // Close database connection
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error checking job status:', error.message);
    console.error('📍 Full error:', error.stack);
    
    // Close database connection on error
    try {
      await mongoose.connection.close();
    } catch (closeError) {
      console.error('❌ Error closing database connection:', closeError.message);
    }
    
    process.exit(1);
  }
}

// ===== HANDLE SCRIPT TERMINATION =====
process.on('SIGINT', async () => {
  console.log('\n⚠️ Script interrupted by user (Ctrl+C)');
  try {
    await mongoose.connection.close();
    console.log('✅ Database connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing database connection:', error.message);
  }
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️ Script terminated');
  try {
    await mongoose.connection.close();
    console.log('✅ Database connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing database connection:', error.message);
  }
  process.exit(1);
});

// ===== INITIALIZE SCRIPT =====
console.log('🔧 Job Status Checker Initialized');
console.log('🎯 Target Job ID: 68d403a075ed1a5cf8543db3');
console.log('🔍 Starting database check...\n');

// Run the check
checkJobStatus();
