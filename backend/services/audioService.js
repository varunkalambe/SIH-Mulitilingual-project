// services/audioService.js

// ===== IMPORT REQUIRED MODULES =====
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import Upload from '../models/uploadModel.js';
import { getFilePath } from '../utils/fileUtils.js';

// Set FFmpeg binary path (required for fluent-ffmpeg to work)
ffmpeg.setFfmpegPath(ffmpegStatic);

// ===== FUNCTION 1: EXTRACT AUDIO FROM VIDEO =====
/**
 * Extract audio track from uploaded video file
 * Called by processController.js in step 2 of processing pipeline
 * @param {string} jobId - Unique job identifier to locate video and save audio
 * @returns {Promise<string>} - Path to extracted audio file
 */
export const extractAudio = async (jobId) => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`[${jobId}] Starting audio extraction...`);
      
      // ===== GET VIDEO FILE INFO FROM DATABASE =====
      const video = await Upload.findById(jobId);
      
      if (!video) {
        throw new Error(`Video record not found in database for job: ${jobId}`);
      }
      
      // Get paths for input video and output audio
      const inputVideoPath = video.file_path;
      const outputAudioPath = getFilePath('audio', jobId, '.wav');
      
      console.log(`[${jobId}] Input video: ${inputVideoPath}`);
      console.log(`[${jobId}] Output audio: ${outputAudioPath}`);
      
      // ===== VERIFY INPUT FILE EXISTS =====
      if (!fs.existsSync(inputVideoPath)) {
        throw new Error(`Input video file not found: ${inputVideoPath}`);
      }
      
      // ===== EXTRACT AUDIO USING FFMPEG =====
      ffmpeg(inputVideoPath)
        .noVideo()                    // Remove video stream, keep only audio
        .audioCodec('pcm_s16le')      // Use PCM 16-bit little-endian (uncompressed, high quality)
        .audioChannels(1)             // Mono audio (required for Whisper)
        .audioFrequency(16000)        // 16kHz sample rate (required for Whisper)
        .format('wav')                // Output as WAV format (widely supported)
        .output(outputAudioPath)      // Where to save the extracted audio
        
        // ===== EVENT HANDLERS =====
        .on('start', (commandLine) => {
          console.log(`[${jobId}] FFmpeg command: ${commandLine}`);
        })
        
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`[${jobId}] Audio extraction progress: ${Math.round(progress.percent)}%`);
          }
        })
        
        .on('end', async () => {
          console.log(`[${jobId}] ✅ Audio extraction completed successfully`);
          console.log(`[${jobId}] Audio file saved to: ${outputAudioPath}`);
          
          // Update database with extraction status
          try {
            await Upload.findByIdAndUpdate(jobId, {
              audioExtracted: true,
              audioOutputPath: outputAudioPath
            });
            console.log(`[${jobId}] Database updated with audio extraction status`);
          } catch (dbError) {
            console.error(`[${jobId}] ⚠️ Failed to update database:`, dbError.message);
          }
          
          resolve(outputAudioPath);
        })
        
        .on('error', (error) => {
          console.error(`[${jobId}] ❌ FFmpeg audio extraction failed:`, error.message);
          
          if (error.message.includes('No such file')) {
            reject(new Error(`Input video file not accessible: ${inputVideoPath}`));
          } else if (error.message.includes('Permission denied')) {
            reject(new Error(`Permission denied accessing files. Check file permissions.`));
          } else if (error.message.includes('Invalid data found')) {
            reject(new Error(`Video file appears to be corrupted or invalid format.`));
          } else {
            reject(new Error(`Audio extraction failed: ${error.message}`));
          }
        })
        
        .run();
        
    } catch (error) {
      console.error(`[${jobId}] ❌ Audio extraction setup failed:`, error.message);
      
      try {
        await Upload.findByIdAndUpdate(jobId, {
          audioExtracted: false,
          $push: { errorMessages: `Audio extraction setup failed: ${error.message}` }
        });
      } catch (dbError) {
        console.error(`[${jobId}] Failed to update database with error:`, dbError.message);
      }
      
      reject(error);
    }
  });
};

// ===== FUNCTION 2: REPLACE ORIGINAL AUDIO WITH TRANSLATED AUDIO =====
/**
 * Replace original video audio with translated audio track
 * Called by processController.js in step 7 of processing pipeline
 * @param {string} jobId - Unique job identifier to locate files
 * @returns {Promise<string>} - Path to final video with translated audio
 */
export const replaceAudioInVideo = async (jobId) => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`[${jobId}] Starting audio replacement...`);
      
      const video = await Upload.findById(jobId);
      
      if (!video) {
        throw new Error(`Video record not found in database for job: ${jobId}`);
      }
      
      // ===== DEFINE FILE PATHS =====
      const originalVideoPath = video.file_path;
      const translatedAudioPath = getFilePath('translated_audio', jobId, '.mp3');
      const outputVideoPath = getFilePath('processed', jobId, '.mp4');
      
      console.log(`[${jobId}] Original video: ${originalVideoPath}`);
      console.log(`[${jobId}] Translated audio: ${translatedAudioPath}`);  
      console.log(`[${jobId}] Output video: ${outputVideoPath}`);
      
      // ===== VERIFY INPUT FILES EXIST =====
      if (!fs.existsSync(originalVideoPath)) {
        throw new Error(`Original video file not found: ${originalVideoPath}`);
      }
      
      if (!fs.existsSync(translatedAudioPath)) {
        throw new Error(`Translated audio file not found: ${translatedAudioPath}`);
      }
      
      // ===== REPLACE AUDIO USING FFMPEG =====
      ffmpeg()
        .input(originalVideoPath)
        .input(translatedAudioPath)
        .videoCodec('copy')
        .audioCodec('aac')
        .audioBitrate('192k')
        .outputOptions([
          '-shortest',
          '-avoid_negative_ts', 'make_zero',
          '-map', '0:v:0',
          '-map', '1:a:0'
        ])
        .output(outputVideoPath)
        
        .on('start', (commandLine) => {
          console.log(`[${jobId}] FFmpeg audio replacement command: ${commandLine}`);
        })
        
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`[${jobId}] Audio replacement progress: ${Math.round(progress.percent)}%`);
          }
        })
        
        .on('end', async () => {
          console.log(`[${jobId}] ✅ Audio replacement completed successfully`);
          console.log(`[${jobId}] Final translated video saved to: ${outputVideoPath}`);
          
          try {
            const outputStats = fs.statSync(outputVideoPath);
            await Upload.findByIdAndUpdate(jobId, {
              processed_file_path: outputVideoPath,
              processed_file_size: outputStats.size,
              video_codec: 'copy',
              audio_codec: 'aac',
              processing_service: 'ffmpeg-audio-replacement'
            });
            console.log(`[${jobId}] Database updated with final video info`);
          } catch (dbError) {
            console.error(`[${jobId}] ⚠️ Failed to update database:`, dbError.message);
          }
          
          resolve(outputVideoPath);
        })
        
        .on('error', (error) => {
          console.error(`[${jobId}] ❌ FFmpeg audio replacement failed:`, error.message);
          
          if (error.message.includes('No such file')) {
            reject(new Error(`Input file not found. Check video and audio file paths.`));
          } else if (error.message.includes('Invalid data found')) {
            reject(new Error(`Corrupted input file detected during audio replacement.`));
          } else if (error.message.includes('Permission denied')) {
            reject(new Error(`File permission error during audio replacement.`));
          } else {
            reject(new Error(`Audio replacement failed: ${error.message}`));
          }
        })
        
        .run();
        
    } catch (error) {
      console.error(`[${jobId}] ❌ Audio replacement setup failed:`, error.message);
      
      try {
        await Upload.findByIdAndUpdate(jobId, {
          video_assembly_error: error.message,
          video_assembly_failed_at: new Date(),
          processing_service: 'ffmpeg-audio-replacement-failed',
          $push: { errorMessages: `Audio replacement setup failed: ${error.message}` }
        });
      } catch (dbError) {
        console.error(`[${jobId}] Failed to save audio replacement error to database:`, dbError.message);
      }
      
      reject(error);
    }
  });
};
