// services/videoService.js - FIXED VIDEO ASSEMBLY WITH PROPER AUDIO REPLACEMENT

// ===== IMPORT REQUIRED MODULES =====
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import Upload from '../models/uploadModel.js';

// Set FFmpeg binary path (required for fluent-ffmpeg to work)
ffmpeg.setFfmpegPath(ffmpegStatic);

// ===== MAIN VIDEO ASSEMBLY FUNCTION =====
/**
 * Combine original video with translated audio and embed captions
 * Called by processController.js in step 6 of processing pipeline
 * @param {string} jobId - Unique job identifier to locate all required files
 * @returns {Promise<string>} - Path to final processed video with translated audio and embedded captions
 */
export const assembleVideoWithCaptions = async (jobId) => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`[${jobId}] Starting complete video assembly with captions...`);
      
      // ===== GET VIDEO INFO FROM DATABASE =====
      const video = await Upload.findById(jobId);
      
      if (!video) {
        throw new Error(`Video record not found in database for job: ${jobId}`);
      }
      
      // ===== DEFINE FILE PATHS =====
      const originalVideoPath = video.original_file_path;                           // ✅ FIXED: Use mongoose field name
      const translatedAudioPath = video.tts_audio_path || `./uploads/translated_audio/${jobId}_translated.wav`; // ✅ FIXED: Use .wav extension
      const captionFilePath = video.caption_file_path || `./uploads/captions/${jobId}_captions.vtt`;           // Generated WebVTT captions
      const outputVideoPath = `./uploads/processed/${jobId}_final.mp4`;             // Final processed video
      
      console.log(`[${jobId}] Original video: ${originalVideoPath}`);
      console.log(`[${jobId}] Translated audio: ${translatedAudioPath}`);
      console.log(`[${jobId}] Caption file: ${captionFilePath}`);
      console.log(`[${jobId}] Output video: ${outputVideoPath}`);
      
      // ===== CREATE OUTPUT DIRECTORY =====
      const processedDir = './uploads/processed/';
      if (!fs.existsSync(processedDir)) {
        fs.mkdirSync(processedDir, { recursive: true });
        console.log(`[${jobId}] Created processed directory: ${processedDir}`);
      }
      
      // ===== VERIFY INPUT FILES EXIST =====
      if (!fs.existsSync(originalVideoPath)) {
        throw new Error(`Original video file not found: ${originalVideoPath}`);
      }
      
      if (!fs.existsSync(translatedAudioPath)) {
        throw new Error(`Translated audio file not found: ${translatedAudioPath}`);
      }
      
      if (!fs.existsSync(captionFilePath)) {
        console.warn(`[${jobId}] ⚠️  Caption file not found: ${captionFilePath}. Proceeding without embedded captions.`);
      }
      
      // ===== DETERMINE ASSEMBLY TYPE =====
      const hasCaptions = fs.existsSync(captionFilePath);
      console.log(`[${jobId}] Assembly mode: ${hasCaptions ? 'Video + Audio + Captions' : 'Video + Audio only'}`);
      
      // ===== ASSEMBLE VIDEO USING FFMPEG - PROPER AUDIO REPLACEMENT =====
      let ffmpegCommand = ffmpeg()
        .input(originalVideoPath)     // Input 0: Original video (has video track + old audio)
        .input(translatedAudioPath);  // Input 1: Translated audio track
      
      // ===== CONFIGURE VIDEO PROCESSING WITH PROPER AUDIO REPLACEMENT =====
      ffmpegCommand
        .videoCodec('libx264')        // H.264 codec (widely supported)
        .audioCodec('aac')            // AAC audio codec (widely supported)  
        .audioBitrate('128k')         // Good quality audio bitrate
        .videoFilter('scale=-2:720')  // Scale to 720p (maintain aspect ratio)
        .outputOptions([
          '-preset', 'fast',          // Encoding speed vs quality balance
          '-crf', '23',               // Constant Rate Factor (good quality)
          '-shortest',                // Match shortest stream duration
          '-avoid_negative_ts', 'make_zero', // Handle timestamp issues
          '-map', '0:v:0',           // ✅ FIXED: Map video from input 0 (original video)
          '-map', '1:a:0'            // ✅ FIXED: Map audio from input 1 (translated audio) - REPLACES original audio
        ]);
      
      // ===== ADD CAPTION EMBEDDING IF AVAILABLE =====
      if (hasCaptions) {
        console.log(`[${jobId}] Adding embedded captions from: ${captionFilePath}`);
        
        // Add caption subtitle filter (burn subtitles into video)
        ffmpegCommand.videoFilter([
          `scale=-2:720`,
          `subtitles='${captionFilePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
        ]);
      }
      
      // ===== SET OUTPUT AND EVENT HANDLERS =====
      ffmpegCommand
        .output(outputVideoPath)
        
        // ===== EVENT HANDLERS =====
        .on('start', (commandLine) => {
          console.log(`[${jobId}] FFmpeg video assembly command: ${commandLine}`);
          console.log(`[${jobId}] Processing: Original video + Translated audio${hasCaptions ? ' + Embedded captions' : ''}`);
        })
        
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`[${jobId}] Video assembly progress: ${Math.round(progress.percent)}%`);
          }
          
          // Log processing speed and time estimates
          if (progress.currentFps) {
            console.log(`[${jobId}] Processing speed: ${Math.round(progress.currentFps)} fps`);
          }
        })
        
        .on('end', async () => {
          try {
            // ===== VIDEO ASSEMBLY COMPLETED =====
            console.log(`[${jobId}] ✅ Video assembly completed successfully`);
            
            // ===== VALIDATE OUTPUT FILE =====
            if (!fs.existsSync(outputVideoPath)) {
              throw new Error('Output video file was not created');
            }
            
            const outputStats = fs.statSync(outputVideoPath);
            console.log(`[${jobId}] Final video file size: ${Math.round(outputStats.size / 1024 / 1024)} MB`);
            
            if (outputStats.size < 100000) { // Less than 100KB is suspicious
              throw new Error(`Output video file is too small (${outputStats.size} bytes)`);
            }
            
            // ===== SAVE VIDEO ASSEMBLY INFO TO DATABASE =====
            await Upload.findByIdAndUpdate(jobId, {
              processed_file_path: outputVideoPath,
              processed_file_size: outputStats.size,
              video_codec: 'libx264',
              audio_codec: 'aac',
              video_resolution: '720p',
              has_embedded_captions: hasCaptions,
              processing_service: 'ffmpeg-video-assembly',
              video_assembly_completed_at: new Date(),
              final_processing_stats: {
                original_video_path: originalVideoPath,
                translated_audio_path: translatedAudioPath,
                caption_file_path: hasCaptions ? captionFilePath : null,
                output_file_size_mb: Math.round(outputStats.size / 1024 / 1024)
              }
            });
            
            console.log(`[${jobId}] ✅ Final translated video ready: ${outputVideoPath}`);
            console.log(`[${jobId}] Features: Translated audio${hasCaptions ? ' + Embedded captions' : ''} + 720p quality`);
            
            resolve(outputVideoPath); // Return path to final video
            
          } catch (postProcessError) {
            console.error(`[${jobId}] ❌ Post-processing error:`, postProcessError.message);
            reject(postProcessError);
          }
        })
        
        .on('error', (error) => {
          // ===== FFMPEG ERROR HANDLING =====
          console.error(`[${jobId}] ❌ FFmpeg video assembly failed:`, error.message);
          
          // Check for common FFmpeg errors
          if (error.message.includes('No such file')) {
            reject(new Error('Input file not found. Check file paths.'));
          } else if (error.message.includes('Invalid data found')) {
            reject(new Error('Corrupted input file detected.'));
          } else if (error.message.includes('Permission denied')) {
            reject(new Error('File permission error. Check write permissions.'));
          } else {
            reject(new Error(`Video assembly failed: ${error.message}`));
          }
        })
        
        // Start the FFmpeg process
        .run();
        
    } catch (error) {
      // ===== GENERAL ERROR HANDLING =====
      console.error(`[${jobId}] ❌ Video assembly setup failed:`, error.message);
      
      // Save error to database
      try {
        await Upload.findByIdAndUpdate(jobId, {
          video_assembly_error: error.message,
          video_assembly_failed_at: new Date(),
          processing_service: 'ffmpeg-video-assembly-failed'
        });
      } catch (dbError) {
        console.error(`[${jobId}] Failed to save video assembly error to database:`, dbError.message);
      }
      
      reject(error);
    }
  });
};

// ===== ALTERNATIVE FUNCTION: VIDEO + AUDIO ONLY (WITHOUT CAPTIONS) =====
/**
 * Combine original video with translated audio (no captions)
 * Fallback function for cases where caption embedding is not needed
 * @param {string} jobId - Unique job identifier
 * @returns {Promise<string>} - Path to final video
 */
export const assembleVideoWithAudioOnly = async (jobId) => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`[${jobId}] Starting video + audio assembly (no captions)...`);
      
      // ===== GET VIDEO INFO FROM DATABASE =====
      const video = await Upload.findById(jobId);
      
      if (!video) {
        throw new Error(`Video record not found for job: ${jobId}`);
      }
      
      // ===== DEFINE FILE PATHS =====
      const originalVideoPath = video.original_file_path;
      const translatedAudioPath = video.tts_audio_path || `./uploads/translated_audio/${jobId}_translated.wav`;
      const outputVideoPath = `./uploads/processed/${jobId}_final.mp4`;
      
      // ===== VERIFY INPUT FILES =====
      if (!fs.existsSync(originalVideoPath)) {
        throw new Error(`Original video not found: ${originalVideoPath}`);
      }
      
      if (!fs.existsSync(translatedAudioPath)) {
        throw new Error(`Translated audio not found: ${translatedAudioPath}`);
      }
      
      // ===== CREATE OUTPUT DIRECTORY =====
      const processedDir = './uploads/processed/';
      if (!fs.existsSync(processedDir)) {
        fs.mkdirSync(processedDir, { recursive: true });
      }
      
      // ===== SIMPLE VIDEO + AUDIO ASSEMBLY WITH PROPER AUDIO REPLACEMENT =====
      ffmpeg()
        .input(originalVideoPath)     // Input 0: Original video
        .input(translatedAudioPath)   // Input 1: Translated audio
        .videoCodec('copy')           // Copy video without re-encoding (faster)
        .audioCodec('aac')            // Encode audio to AAC
        .audioBitrate('192k')         // High quality audio bitrate
        .outputOptions([
          '-shortest',                // Match shortest stream duration
          '-avoid_negative_ts', 'make_zero',
          '-map', '0:v:0',           // ✅ Map video from input 0
          '-map', '1:a:0'            // ✅ Map audio from input 1 (REPLACES original)
        ])
        .output(outputVideoPath)
        
        .on('start', (commandLine) => {
          console.log(`[${jobId}] Simple assembly command: ${commandLine}`);
        })
        
        .on('end', () => {
          console.log(`[${jobId}] ✅ Simple video assembly completed: ${outputVideoPath}`);
          resolve(outputVideoPath);
        })
        
        .on('error', (error) => {
          console.error(`[${jobId}] ❌ Simple video assembly failed:`, error.message);
          reject(error);
        })
        
        .run();
        
    } catch (error) {
      reject(error);
    }
  });
};

// ===== HELPER FUNCTION: GET VIDEO INFORMATION =====
/**
 * Get detailed information about a video file using FFmpeg
 * @param {string} videoPath - Path to video file
 * @param {string} jobId - Job ID for logging
 * @returns {Promise<Object>} - Video metadata
 */
export const getVideoInfo = async (videoPath, jobId) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (error, metadata) => {
      if (error) {
        console.error(`[${jobId}] Failed to get video info:`, error.message);
        reject(error);
        return;
      }
      
      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
      
      const info = {
        duration: metadata.format.duration || 0,
        size: metadata.format.size || 0,
        bitrate: metadata.format.bit_rate || 0,
        video: {
          codec: videoStream?.codec_name || 'unknown',
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          fps: videoStream?.r_frame_rate || '0/0'
        },
        audio: {
          codec: audioStream?.codec_name || 'unknown',
          sample_rate: audioStream?.sample_rate || 0,
          channels: audioStream?.channels || 0
        }
      };
      
      console.log(`[${jobId}] Video info: ${info.video.width}x${info.video.height}, ${Math.round(info.duration)}s, ${Math.round(info.size/1024/1024)}MB`);
      resolve(info);
    });
  });
};

// ===== HELPER FUNCTION: VALIDATE FFMPEG INSTALLATION =====
/**
 * Check if FFmpeg is properly installed and accessible
 * @returns {Promise<boolean>} - True if FFmpeg is available
 */
export const validateFFmpegInstallation = async () => {
  return new Promise((resolve) => {
    ffmpeg()
      .input('test')
      .on('error', (error) => {
        if (error.message.includes('spawn')) {
          console.error('❌ FFmpeg not found. Please install FFmpeg.');
          resolve(false);
        } else {
          // Other errors are OK - means FFmpeg is installed but input is invalid
          resolve(true);
        }
      })
      .format('null')
      .output('null')
      .run();
  });
};
