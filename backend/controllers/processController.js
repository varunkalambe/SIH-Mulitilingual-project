// controllers/processController.js - FIXED TO USE PROPER VIDEO ASSEMBLY

// ===== IMPORT REQUIRED MODULES =====
import Upload from '../models/uploadModel.js'; 
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { extractAudio } from '../services/audioService.js';
import { transcribeAudio } from '../services/transcriptionService.js';
import { translateText } from '../services/translationService.js';
import { generateTTS } from '../services/ttsService.js';
import { generateCaptions } from '../services/captionService.js';
import { assembleVideoWithCaptions, assembleVideoWithAudioOnly } from '../services/videoService.js'; // ✅ FIXED: Import proper video service

// Set FFmpeg binary path (required for fluent-ffmpeg to work)
ffmpeg.setFfmpegPath(ffmpegStatic);

// ===== MAIN PROCESSING FUNCTION =====
/**
 * Main video processing pipeline function
 * This function orchestrates all processing steps in the correct order
 * @param {string} jobId - Unique identifier for the video processing job
 */
export const processVideo = async (jobId) => {
  try {
    // ===== STEP 1: MARK PROCESSING AS STARTED =====
    console.log(`[${jobId}] Starting video processing pipeline`);
    await Upload.findByIdAndUpdate(jobId, {
      processing_status: 'processing',
      processing_step: 'audio_extraction',
      processing_started_at: new Date()
    });

    // ===== STEP 2: EXTRACT AUDIO FROM VIDEO =====
    console.log(`[${jobId}] Step 1/6: Extracting audio from video...`);
    const audioPath = await extractAudio(jobId);
    console.log(`[${jobId}] ✅ Audio extraction completed: ${audioPath}`);
    
    await Upload.findByIdAndUpdate(jobId, {
      processing_step: 'transcription'
    });

    // ===== STEP 3: CONVERT AUDIO TO TEXT =====
    console.log(`[${jobId}] Step 2/6: Converting speech to text...`);
    const transcription = await transcribeAudio(jobId);
    console.log(`[${jobId}] ✅ Transcription completed`);
    console.log(`[${jobId}]    Language detected: ${transcription.language}`);
    console.log(`[${jobId}]    Text preview: "${transcription.text.substring(0, 100)}..."`);
    
    await Upload.findByIdAndUpdate(jobId, {
      processing_step: 'translation',
      transcription_completed_at: new Date()
    });

    // ===== STEP 4: TRANSLATE TEXT TO TARGET LANGUAGE =====
    console.log(`[${jobId}] Step 3/6: Translating text to target language...`);
    const translation = await translateText(transcription, jobId);
    console.log(`[${jobId}] ✅ Translation completed`);
    console.log(`[${jobId}]    Original: "${transcription.text.substring(0, 50)}..."`);
    console.log(`[${jobId}]    Translated: "${translation.text.substring(0, 50)}..."`);
    
    await Upload.findByIdAndUpdate(jobId, {
      processing_step: 'tts_generation',
      translatedText: translation.text,
      translation_completed_at: new Date()
    });

    // ===== STEP 5: GENERATE TRANSLATED SPEECH =====
    console.log(`[${jobId}] Step 4/6: Generating speech in target language...`);
    const ttsAudioPath = await generateTTS(translation, jobId);
    console.log(`[${jobId}] ✅ Speech generation completed: ${ttsAudioPath}`);
    
    await Upload.findByIdAndUpdate(jobId, {
      processing_step: 'caption_generation',
      tts_audio_path: ttsAudioPath,
      tts_completed_at: new Date()
    });

    // ===== STEP 6: CREATE CAPTIONS AND TRANSCRIPT =====
    console.log(`[${jobId}] Step 5/6: Creating captions and transcript files...`);
    const captionResult = await generateCaptions(translation, jobId);
    console.log(`[${jobId}] ✅ Caption generation completed`);
    console.log(`[${jobId}]    WebVTT file: ${captionResult.captionPath}`);
    console.log(`[${jobId}]    SRT file: ${captionResult.srtPath}`);
    console.log(`[${jobId}]    Transcript file: ${captionResult.transcriptPath}`);
    
    await Upload.findByIdAndUpdate(jobId, {
      processing_step: 'video_assembly',
      caption_file_path: captionResult.captionPath,
      caption_srt_path: captionResult.srtPath,
      transcript_file_path: captionResult.transcriptPath,
      captions_completed_at: new Date()
    });

    // ===== STEP 7: ASSEMBLE FINAL VIDEO WITH CAPTIONS =====
    // ✅ FIXED: Now uses proper videoService.js function instead of placeholder
    console.log(`[${jobId}] Step 6/6: Assembling final translated video with captions...`);
    const finalVideoPath = await assembleVideoWithCaptions(jobId); // ✅ Uses proper video service
    console.log(`[${jobId}] ✅ Video assembly completed: ${finalVideoPath}`);

    // ===== STEP 8: MARK JOB AS COMPLETED =====
    const upload = await Upload.findById(jobId).select('processing_started_at');
    const processingDuration = new Date() - upload.processing_started_at;

    await Upload.findByIdAndUpdate(jobId, {
      processing_status: 'completed',
      processing_step: 'completed',
      processed_file_path: finalVideoPath,
      completed_at: new Date(),
      processing_duration_ms: processingDuration,
      video_assembly_completed_at: new Date()
    });

    console.log(`[${jobId}] 🎉 PROCESSING COMPLETED SUCCESSFULLY!`);
    console.log(`[${jobId}] All files are ready for user download and viewing`);
    
  } catch (error) {
    console.error(`[${jobId}] ❌ PROCESSING FAILED!`);
    console.error(`[${jobId}] Error message: ${error.message}`);
    console.error(`[${jobId}] Error stack trace:`, error.stack);
    
    try {
      await Upload.findByIdAndUpdate(jobId, {
        processing_status: 'failed',
        processing_step: 'failed',
        error_message: error.message,
        error_details: error.stack,
        failed_at: new Date(),
        $push: { errorMessages: error.message }
      });
      
      console.log(`[${jobId}] Database updated with failure status`);
      
    } catch (dbError) {
      console.error(`[${jobId}] Failed to update database with error status:`, dbError.message);
    }
    
    throw error;
  }
};

// ===== STATUS CHECKING FUNCTION =====
/**
 * Get current processing status for a job
 */
export const getProcessingStatus = async (req, res) => {
  try {
    const jobId = req.params.jobId;
    console.log(`[${jobId}] Status check requested`);
    
    const video = await Upload.findById(jobId);
    
    if (!video) {
      console.log(`[${jobId}] Job not found in database`);
      return res.status(404).json({ 
        success: false,
        error: 'Job not found',
        jobId: jobId,
        message: 'The requested job ID does not exist'
      });
    }
    
    const statusResponse = {
      success: true,
      jobId: video._id,
      status: video.processing_status || 'uploaded',
      step: video.processing_step || 'queued',
      created_at: video.createdAt,
      processing_started_at: video.processing_started_at || null,
      completed_at: video.completed_at || null,
      failed_at: video.failed_at || null,
      error_message: video.error_message || null,
      original_filename: video.originalName,
      target_language: video.target_language || null,
      source_language: video.source_language || null,
      transcription_text: video.transcriptionText || null,
      translated_text: video.translatedText || null,
      audio_extracted: video.audioExtracted || false,
      error_messages: video.errorMessages || []
    };
    
    console.log(`[${jobId}] Status: ${statusResponse.status}, Step: ${statusResponse.step}`);
    res.json(statusResponse);
    
  } catch (error) {
    console.error('Status check database error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Status check failed',
      message: 'Unable to retrieve job status from database',
      details: error.message
    });
  }
};

// ===== HELPER FUNCTIONS =====

/**
 * Get processing statistics for monitoring
 */
export const getProcessingStats = async () => {
  try {
    const stats = await Upload.aggregate([
      {
        $group: {
          _id: '$processing_status',
          count: { $sum: 1 },
          avgDuration: { $avg: '$processing_duration_ms' }
        }
      }
    ]);
    
    return stats;
  } catch (error) {
    console.error('Failed to get processing stats:', error.message);
    throw error;
  }
};

/**
 * Cleanup failed jobs older than specified days
 */
export const cleanupFailedJobs = async (days = 7) => {
  try {
    const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    const result = await Upload.deleteMany({
      processing_status: 'failed',
      failed_at: { $lt: cutoffDate }
    });
    
    console.log(`Cleaned up ${result.deletedCount} failed jobs older than ${days} days`);
    return result.deletedCount;
  } catch (error) {
    console.error('Failed to cleanup jobs:', error.message);
    throw error;
  }
};
