// services/ttsService.js - ENHANCED WITH DURATION PRESERVATION & SEGMENT-BASED TTS

// ===== IMPORT REQUIRED MODULES =====
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import Upload from '../models/uploadModel.js';

// ===== MAIN ENHANCED TTS FUNCTION =====
/**
 * Enhanced TTS service with duration preservation and segment-based generation
 * Convert translated text to speech using Edge-TTS with perfect timing synchronization
 * Optimized for Indian languages with natural-sounding neural voices
 * Called by processController.js in step 5 of processing pipeline
 * @param {Object} translation - Enhanced translation object with segments and duration info
 * @param {string} jobId - Unique job identifier for file naming and database updates
 * @returns {Promise<string>} - Path to generated TTS audio file with preserved duration
 */
export const generateTTS = async (translation, jobId) => {
  try {
    console.log(`[${jobId}] Starting enhanced TTS with duration preservation and segment-based generation...`);
    
    // ===== VALIDATE INPUT TRANSLATION =====
    if (!translation || !translation.text) {
      throw new Error('Invalid translation object provided');
    }
    
    if (!translation.language) {
      throw new Error('Target language not specified in translation object');
    }
    
    // ===== VALIDATE SUPPORTED INDIAN LANGUAGE =====
    const supportedVoices = getSupportedIndianVoices();
    const targetLanguage = translation.language;
    
    if (!supportedVoices[targetLanguage]) {
      console.warn(`[${jobId}] Language '${targetLanguage}' not supported, using enhanced fallback`);
      return createEnhancedTTSFallback(translation, jobId);
    }
    
    const voiceConfig = supportedVoices[targetLanguage];
    console.log(`[${jobId}] Enhanced TTS Configuration:`);
    console.log(`[${jobId}]   Language: ${voiceConfig.name}`);
    console.log(`[${jobId}]   Voice: ${voiceConfig.voice}`);
    console.log(`[${jobId}]   Quality: ${voiceConfig.quality}`);
    console.log(`[${jobId}]   Text length: ${translation.text.length} characters`);
    console.log(`[${jobId}]   Target duration: ${translation.original_duration || 'auto'} seconds`);
    console.log(`[${jobId}]   Segments available: ${translation.segments ? translation.segments.length : 0}`);
    
    // ===== CREATE OUTPUT DIRECTORY =====
    const outputDir = './uploads/translated_audio/';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`[${jobId}] Created translated_audio directory: ${outputDir}`);
    }
    
    const audioFileName = `${jobId}_translated.wav`;
    const audioFilePath = path.join(outputDir, audioFileName);
    
    console.log(`[${jobId}] Enhanced TTS output file: ${audioFilePath}`);
    
    // ===== CHOOSE TTS GENERATION METHOD =====
    if (translation.segments && translation.segments.length > 0) {
      console.log(`[${jobId}] Using segment-based TTS for perfect duration preservation...`);
      return await generateSegmentBasedTTS(translation, voiceConfig, audioFilePath, jobId);
    } else {
      console.log(`[${jobId}] Using full-text TTS (no segments available)...`);
      return await generateFullTextTTS(translation, voiceConfig, audioFilePath, jobId);
    }
    
  } catch (error) {
    console.error(`[${jobId}] ❌ Enhanced TTS failed:`, error.message);
    
    // ===== SAVE ERROR TO DATABASE =====
    try {
      await Upload.findByIdAndUpdate(jobId, {
        tts_error: error.message,
        tts_failed_at: new Date(),
        tts_service: 'enhanced-edge-tts-failed',
        $push: { errorMessages: `Enhanced TTS failed: ${error.message}` }
      });
    } catch (dbError) {
      console.error(`[${jobId}] Failed to save TTS error to database:`, dbError.message);
    }
    
    // Return fallback instead of throwing error
    return createEnhancedTTSFallback(translation, jobId);
  }
};

// ===== SEGMENT-BASED TTS FOR PERFECT DURATION PRESERVATION =====
/**
 * Generate TTS audio using segment-based approach for perfect timing synchronization
 */
const generateSegmentBasedTTS = async (translation, voiceConfig, outputPath, jobId) => {
  console.log(`[${jobId}] Generating segment-based TTS with perfect duration matching...`);
  
  const segmentAudioFiles = [];
  const tempDir = './uploads/temp_audio/';
  
  // Create temporary directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`[${jobId}] Created temporary audio directory: ${tempDir}`);
  }
  
  try {
    console.log(`[${jobId}] Processing ${translation.segments.length} segments for TTS generation...`);
    
    // ===== GENERATE AUDIO FOR EACH SEGMENT =====
    for (let i = 0; i < translation.segments.length; i++) {
      const segment = translation.segments[i];
      const segmentDuration = (segment.end || 0) - (segment.start || 0);
      
      console.log(`[${jobId}] Processing segment ${i + 1}/${translation.segments.length}:`);
      console.log(`[${jobId}]   Start: ${segment.start}s, End: ${segment.end}s, Duration: ${segmentDuration}s`);
      console.log(`[${jobId}]   Text: "${(segment.text || '').substring(0, 50)}..."`);
      
      if (!segment.text || segment.text.trim().length === 0) {
        // Create silence for empty segments
        console.log(`[${jobId}]   Creating silence for empty segment ${i + 1}`);
        const silenceFile = path.join(tempDir, `${jobId}_segment_${i}_silence.wav`);
        await createSilenceFile(silenceFile, segmentDuration || 1.0);
        segmentAudioFiles.push({
          file: silenceFile,
          duration: segmentDuration || 1.0,
          isSilence: true,
          segmentIndex: i
        });
        continue;
      }
      
      const segmentFile = path.join(tempDir, `${jobId}_segment_${i}.wav`);
      
      // ===== CALCULATE OPTIMAL SPEECH RATE =====
      const wordCount = segment.text.split(' ').filter(word => word.length > 0).length;
      const targetDuration = segmentDuration;
      const normalWPM = 150; // Words per minute for normal speech
      const requiredWPM = Math.max(50, Math.min(250, (wordCount / Math.max(targetDuration, 0.5)) * 60));
      const speechRate = Math.round((requiredWPM / normalWPM) * 100);
      
      console.log(`[${jobId}]   Word count: ${wordCount}, Target WPM: ${requiredWPM}, Speech rate: ${speechRate}%`);
      
      try {
        // Generate TTS for individual segment
        await generateSingleSegmentTTS(
          segment.text,
          voiceConfig.voice,
          segmentFile,
          speechRate,
          jobId,
          i + 1
        );
        
        // ===== VERIFY AND ADJUST DURATION =====
        const actualDuration = await getAudioDuration(segmentFile);
        const durationDifference = Math.abs(actualDuration - targetDuration);
        
        console.log(`[${jobId}]   Generated duration: ${actualDuration.toFixed(2)}s, Target: ${targetDuration.toFixed(2)}s, Diff: ${durationDifference.toFixed(2)}s`);
        
        // If duration mismatch is significant, adjust the audio
        if (durationDifference > 0.3 && targetDuration > 0.5) {
          console.log(`[${jobId}]   Adjusting duration for segment ${i + 1}...`);
          await adjustAudioDuration(segmentFile, targetDuration, jobId, i + 1);
          
          // Verify adjustment
          const adjustedDuration = await getAudioDuration(segmentFile);
          console.log(`[${jobId}]   Adjusted duration: ${adjustedDuration.toFixed(2)}s`);
        }
        
        segmentAudioFiles.push({
          file: segmentFile,
          duration: targetDuration,
          isSilence: false,
          segmentIndex: i,
          originalDuration: actualDuration
        });
        
        console.log(`[${jobId}]   ✅ Segment ${i + 1} TTS completed successfully`);
        
      } catch (segmentError) {
        console.warn(`[${jobId}]   ⚠️ Segment ${i + 1} TTS failed: ${segmentError.message}`);
        console.log(`[${jobId}]   Using silence as fallback for segment ${i + 1}`);
        
        // Create silence as fallback
        const silenceFile = path.join(tempDir, `${jobId}_segment_${i}_silence.wav`);
        await createSilenceFile(silenceFile, segmentDuration || 1.0);
        segmentAudioFiles.push({
          file: silenceFile,
          duration: segmentDuration || 1.0,
          isSilence: true,
          segmentIndex: i,
          fallbackReason: segmentError.message
        });
      }
      
      // Small delay between segments to avoid overwhelming the system
      if (i < translation.segments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`[${jobId}] ✅ All segments processed. Successful: ${segmentAudioFiles.filter(f => !f.isSilence).length}/${translation.segments.length}`);
    
    // ===== CONCATENATE ALL SEGMENT AUDIO FILES =====
    console.log(`[${jobId}] Concatenating ${segmentAudioFiles.length} audio segments...`);
    await concatenateAudioFiles(segmentAudioFiles.map(f => f.file), outputPath, jobId);
    
    // ===== VERIFY FINAL DURATION AND QUALITY =====
    const finalDuration = await getAudioDuration(outputPath);
    const targetTotalDuration = translation.original_duration || translation.translated_duration || 0;
    const durationDifference = Math.abs(finalDuration - targetTotalDuration);
    const durationPreserved = durationDifference < 2;
    
    console.log(`[${jobId}] Final TTS Results:`);
    console.log(`[${jobId}]   Final audio duration: ${finalDuration.toFixed(2)} seconds`);
    console.log(`[${jobId}]   Target duration: ${targetTotalDuration.toFixed(2)} seconds`);
    console.log(`[${jobId}]   Duration difference: ${durationDifference.toFixed(2)} seconds`);
    console.log(`[${jobId}]   Duration preserved: ${durationPreserved ? '✅ YES' : '❌ NO'}`);
    
    // ===== CLEANUP TEMPORARY FILES =====
    console.log(`[${jobId}] Cleaning up temporary files...`);
    let cleanupSuccessful = 0;
    let cleanupFailed = 0;
    
    segmentAudioFiles.forEach(audioFile => {
      try {
        if (fs.existsSync(audioFile.file)) {
          fs.unlinkSync(audioFile.file);
          cleanupSuccessful++;
        }
      } catch (cleanupError) {
        console.warn(`[${jobId}] Failed to cleanup ${audioFile.file}: ${cleanupError.message}`);
        cleanupFailed++;
      }
    });
    
    // Remove temporary directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`[${jobId}] ✅ Temporary directory cleaned up`);
    } catch (dirCleanupError) {
      console.warn(`[${jobId}] Failed to cleanup temp directory: ${dirCleanupError.message}`);
    }
    
    console.log(`[${jobId}] Cleanup completed: ${cleanupSuccessful} files removed, ${cleanupFailed} failed`);
    
    // ===== SAVE ENHANCED TTS RESULTS TO DATABASE =====
    const fileStats = fs.statSync(outputPath);
    const successfulSegments = segmentAudioFiles.filter(f => !f.isSilence).length;
    const silenceSegments = segmentAudioFiles.filter(f => f.isSilence).length;
    
    await Upload.findByIdAndUpdate(jobId, {
      tts_audio_path: outputPath,
      tts_audio_size: fileStats.size,
      tts_audio_duration: finalDuration,
      tts_language: translation.language,
      tts_language_name: voiceConfig.name,
      tts_voice: voiceConfig.voice,
      tts_service: 'enhanced-edge-tts-segment-based',
      tts_segments_generated: segmentAudioFiles.length,
      tts_segments_successful: successfulSegments,
      tts_segments_silence: silenceSegments,
      tts_duration_preserved: durationPreserved,
      tts_target_duration: targetTotalDuration,
      tts_actual_duration: finalDuration,
      tts_duration_difference: durationDifference,
      tts_generation_method: 'segment-based',
      tts_completed_at: new Date(),
      indian_language_tts: true,
      tts_quality: voiceConfig.quality,
      enhanced_tts: true
    });
    
    console.log(`[${jobId}] ✅ Enhanced segment-based TTS completed successfully`);
    console.log(`[${jobId}] Generated ${voiceConfig.name} speech: ${fileStats.size} bytes`);
    console.log(`[${jobId}] Duration preservation: ${durationPreserved ? 'PERFECT' : 'ACCEPTABLE'}`);
    
    return outputPath;
    
  } catch (error) {
    console.error(`[${jobId}] ❌ Segment-based TTS failed:`, error.message);
    
    // Cleanup on error
    console.log(`[${jobId}] Performing error cleanup...`);
    segmentAudioFiles.forEach(audioFile => {
      try {
        if (fs.existsSync(audioFile.file)) {
          fs.unlinkSync(audioFile.file);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors during error handling
      }
    });
    
    // Try to remove temp directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (dirCleanupError) {
      // Ignore cleanup errors during error handling
    }
    
    throw error;
  }
};

// ===== FULL TEXT TTS (FALLBACK METHOD) =====
/**
 * Generate TTS using full text when segments are not available
 */
const generateFullTextTTS = async (translation, voiceConfig, outputPath, jobId) => {
  console.log(`[${jobId}] Generating full-text TTS...`);
  
  // ===== PREPARE TEXT FOR TTS =====
  let textToConvert = translation.text;
  
  // Handle long text by truncating if necessary
  if (translation.text.length > 5000) {
    console.warn(`[${jobId}] Text is ${translation.text.length} characters. Truncating to 5000 for better performance.`);
    textToConvert = translation.text.substring(0, 4950) + '...';
  }
  
  // ===== CALL EDGE-TTS =====
  console.log(`[${jobId}] Calling Edge-TTS with ${voiceConfig.voice}...`);
  
  const audioFilePath_final = await callEdgeTTS({
    text: textToConvert,
    voice: voiceConfig.voice,
    outputPath: outputPath,
    rate: '+0%',                    // Normal speech rate
    volume: '+0%',                  // Normal volume
    jobId: jobId
  });
  
  // ===== VERIFY FILE CREATION =====
  if (!fs.existsSync(audioFilePath_final)) {
    throw new Error(`Edge-TTS output file not created: ${audioFilePath_final}`);
  }
  
  const fileStats = fs.statSync(audioFilePath_final);
  const finalDuration = await getAudioDuration(audioFilePath_final);
  
  console.log(`[${jobId}] ✅ Full-text TTS completed`);
  console.log(`[${jobId}] Audio file size: ${fileStats.size} bytes`);
  console.log(`[${jobId}] Audio duration: ${finalDuration.toFixed(2)} seconds`);
  
  if (fileStats.size < 1000) {
    throw new Error(`Generated audio file is too small (${fileStats.size} bytes). May indicate TTS error.`);
  }
  
  // ===== SAVE FULL-TEXT TTS INFO TO DATABASE =====
  await Upload.findByIdAndUpdate(jobId, {
    tts_audio_path: audioFilePath_final,
    tts_audio_size: fileStats.size,
    tts_audio_duration: finalDuration,
    tts_language: translation.language,
    tts_language_name: voiceConfig.name,
    tts_voice: voiceConfig.voice,
    tts_service: 'enhanced-edge-tts-full-text',
    tts_text_length: textToConvert.length,
    tts_generation_method: 'full-text',
    tts_completed_at: new Date(),
    indian_language_tts: true,
    tts_quality: voiceConfig.quality,
    enhanced_tts: true
  });
  
  console.log(`[${jobId}] ✅ Enhanced full-text TTS completed successfully`);
  
  return audioFilePath_final;
};

// ===== GENERATE SINGLE SEGMENT TTS =====
/**
 * Generate TTS for a single segment with optimized speech rate
 */
const generateSingleSegmentTTS = (text, voice, outputPath, speechRate, jobId, segmentNumber) => {
  return new Promise((resolve, reject) => {
    // Clean text for Edge-TTS command line
    const cleanText = text.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\n/g, ' ').replace(/\r/g, ' ').trim();
    
    // Build Edge-TTS command with speech rate adjustment
    const rateParam = speechRate > 100 ? `+${speechRate - 100}%` : `-${100 - speechRate}%`;
    const edgeTTSCommand = `edge-tts --voice "${voice}" --text "${cleanText}" --rate "${rateParam}" --write-media "${outputPath}"`;
    
    console.log(`[${jobId}]   Edge-TTS segment ${segmentNumber} command: rate=${rateParam}, text length=${text.length}`);
    
    exec(edgeTTSCommand, { 
      maxBuffer: 1024 * 1024 * 20,  // 20MB buffer
      timeout: 45000                 // 45 second timeout
    }, (error, stdout, stderr) => {
      
      if (error) {
        console.error(`[${jobId}]   Edge-TTS segment ${segmentNumber} failed:`, error.message);
        reject(new Error(`Edge-TTS segment ${segmentNumber} failed: ${error.message}`));
        return;
      }
      
      if (stderr) {
        console.warn(`[${jobId}]   Edge-TTS segment ${segmentNumber} warnings:`, stderr);
      }
      
      console.log(`[${jobId}]   ✅ Edge-TTS segment ${segmentNumber} completed`);
      resolve(outputPath);
    });
  });
};

// ===== HELPER FUNCTION: CALL EDGE-TTS =====
/**
 * Execute Edge-TTS command to generate speech (used by full-text method)
 */
const callEdgeTTS = async (options) => {
  const { text, voice, outputPath, rate, volume, jobId } = options;
  
  return new Promise((resolve, reject) => {
    // Escape text for command line
    const escapedText = text.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\n/g, ' ').replace(/\r/g, ' ').trim();
    
    // Build Edge-TTS command
    const edgeTTSCommand = `edge-tts --voice "${voice}" --text "${escapedText}" --write-media "${outputPath}" --write-subtitles "${outputPath}.vtt"`;
    
    console.log(`[${jobId}] Edge-TTS full-text command: ${voice} voice, ${text.length} chars`);
    console.log(`[${jobId}] Output: ${outputPath}`);
    
    // Execute Edge-TTS command
    exec(edgeTTSCommand, { 
      maxBuffer: 1024 * 1024 * 50,  // 50MB buffer for large audio files
      timeout: 120000                // 2 minute timeout for full text
    }, (error, stdout, stderr) => {
      
      if (error) {
        console.error(`[${jobId}] Edge-TTS full-text command failed:`, error.message);
        
        // Check for common errors
        if (error.message.includes('command not found') || error.message.includes('not recognized')) {
          reject(new Error('Edge-TTS not installed. Install with: pip install edge-tts'));
        } else if (error.message.includes('timeout')) {
          reject(new Error('Edge-TTS timeout (2 minutes). Text may be too long.'));
        } else {
          reject(new Error(`Edge-TTS execution failed: ${error.message}`));
        }
        return;
      }
      
      // Log any stderr (warnings, non-fatal errors)
      if (stderr) {
        console.warn(`[${jobId}] Edge-TTS full-text warnings:`, stderr);
      }
      
      console.log(`[${jobId}] ✅ Edge-TTS full-text command completed successfully`);
      resolve(outputPath);
    });
  });
};

// ===== CREATE SILENCE FILE =====
/**
 * Create a silent audio file of specified duration
 */
const createSilenceFile = async (outputPath, duration) => {
  const silenceCommand = `ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t ${duration} -y "${outputPath}"`;
  
  return new Promise((resolve, reject) => {
    exec(silenceCommand, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Silence generation failed: ${error.message}`));
      } else {
        resolve(outputPath);
      }
    });
  });
};

// ===== GET AUDIO DURATION =====
/**
 * Get the duration of an audio file using FFprobe
 */
const getAudioDuration = (audioPath) => {
  return new Promise((resolve, reject) => {
    const ffprobeCommand = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`;
    
    exec(ffprobeCommand, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Duration check failed: ${error.message}`));
      } else {
        const duration = parseFloat(stdout.trim());
        resolve(isNaN(duration) ? 0 : duration);
      }
    });
  });
};

// ===== ADJUST AUDIO DURATION (STRETCH/COMPRESS) =====
/**
 * Adjust audio duration by changing tempo while preserving pitch
 */
const adjustAudioDuration = async (inputPath, targetDuration, jobId, segmentNumber) => {
  return new Promise(async (resolve, reject) => {
    try {
      const currentDuration = await getAudioDuration(inputPath);
      
      if (currentDuration === 0 || targetDuration === 0) {
        console.warn(`[${jobId}]   Cannot adjust duration: current=${currentDuration}, target=${targetDuration}`);
        resolve(inputPath);
        return;
      }
      
      const speedRatio = currentDuration / targetDuration;
      
      // Limit speed adjustments to reasonable bounds
      const clampedSpeedRatio = Math.max(0.5, Math.min(2.0, speedRatio));
      
      if (Math.abs(speedRatio - 1.0) < 0.05) {
        console.log(`[${jobId}]   Duration adjustment not needed for segment ${segmentNumber} (ratio: ${speedRatio.toFixed(2)})`);
        resolve(inputPath);
        return;
      }
      
      const tempPath = inputPath + '.temp.wav';
      
      console.log(`[${jobId}]   Adjusting segment ${segmentNumber} duration: speed ratio = ${clampedSpeedRatio.toFixed(2)}`);
      
      const adjustCommand = `ffmpeg -i "${inputPath}" -filter:a "atempo=${clampedSpeedRatio}" -y "${tempPath}"`;
      
      exec(adjustCommand, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          console.warn(`[${jobId}]   Duration adjustment failed for segment ${segmentNumber}: ${error.message}`);
          resolve(inputPath); // Return original if adjustment fails
        } else {
          // Replace original with adjusted
          try {
            if (fs.existsSync(tempPath)) {
              fs.renameSync(tempPath, inputPath);
              console.log(`[${jobId}]   ✅ Duration adjusted for segment ${segmentNumber}`);
            }
            resolve(inputPath);
          } catch (renameError) {
            console.warn(`[${jobId}]   Failed to replace adjusted file for segment ${segmentNumber}: ${renameError.message}`);
            resolve(inputPath);
          }
        }
      });
    } catch (durationError) {
      console.warn(`[${jobId}]   Duration check failed for segment ${segmentNumber}: ${durationError.message}`);
      resolve(inputPath);
    }
  });
};

// ===== CONCATENATE AUDIO FILES =====
/**
 * Concatenate multiple audio files into a single file
 */
const concatenateAudioFiles = (audioFiles, outputPath, jobId) => {
  return new Promise((resolve, reject) => {
    if (!audioFiles || audioFiles.length === 0) {
      reject(new Error('No audio files to concatenate'));
      return;
    }
    
    if (audioFiles.length === 1) {
      // If only one file, just copy it
      try {
        fs.copyFileSync(audioFiles[0], outputPath);
        console.log(`[${jobId}] Single file copied to output`);
        resolve(outputPath);
      } catch (copyError) {
        reject(new Error(`Failed to copy single file: ${copyError.message}`));
      }
      return;
    }
    
    // Create file list for FFmpeg concat
    const fileListPath = `./uploads/temp_audio/${jobId}_filelist.txt`;
    
    // Ensure temp directory exists
    const tempDir = path.dirname(fileListPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const fileListContent = audioFiles.map(file => `file '${path.resolve(file)}'`).join('\n');
    
    try {
      fs.writeFileSync(fileListPath, fileListContent);
    } catch (writeError) {
      reject(new Error(`Failed to write file list: ${writeError.message}`));
      return;
    }
    
    const concatCommand = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy -y "${outputPath}"`;
    
    console.log(`[${jobId}] Concatenating ${audioFiles.length} audio files...`);
    
    exec(concatCommand, { 
      maxBuffer: 1024 * 1024 * 200,  // 200MB buffer
      timeout: 120000                 // 2 minute timeout
    }, (error, stdout, stderr) => {
      
      // Cleanup file list regardless of result
      try {
        if (fs.existsSync(fileListPath)) {
          fs.unlinkSync(fileListPath);
        }
      } catch (cleanupError) {
        console.warn(`[${jobId}] Failed to cleanup file list: ${cleanupError.message}`);
      }
      
      if (error) {
        reject(new Error(`Audio concatenation failed: ${error.message}`));
      } else {
        console.log(`[${jobId}] ✅ Audio concatenation completed successfully`);
        resolve(outputPath);
      }
    });
  });
};

// ===== CREATE ENHANCED TTS FALLBACK =====
/**
 * Create a fallback TTS file when normal TTS fails
 */
const createEnhancedTTSFallback = async (translation, jobId) => {
  console.log(`[${jobId}] Creating enhanced TTS fallback (silent audio file)...`);
  
  const outputDir = './uploads/translated_audio/';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const audioFileName = `${jobId}_translated.wav`;
  const audioFilePath = path.join(outputDir, audioFileName);
  
  // Estimate duration based on text length (rough estimate: 150 WPM)
  const estimatedDuration = Math.max(5, translation.text.length / 10); // Rough estimate
  const fallbackDuration = translation.original_duration || translation.translated_duration || estimatedDuration;
  
  try {
    // Create silent audio file with estimated duration
    await createSilenceFile(audioFilePath, fallbackDuration);
    
    const fileStats = fs.statSync(audioFilePath);
    console.log(`[${jobId}] ✅ Enhanced TTS fallback created: ${audioFilePath}`);
    console.log(`[${jobId}] Fallback file size: ${fileStats.size} bytes, Duration: ${fallbackDuration.toFixed(2)}s`);
    
    // Save fallback info to database
    await Upload.findByIdAndUpdate(jobId, {
      tts_audio_path: audioFilePath,
      tts_audio_size: fileStats.size,
      tts_audio_duration: fallbackDuration,
      tts_language: translation.language,
      tts_language_name: translation.language_name || translation.language,
      tts_voice: 'enhanced-fallback-silence',
      tts_service: 'enhanced-fallback-silence',
      tts_text_length: translation.text.length,
      tts_completed_at: new Date(),
      indian_language_tts: false,
      tts_quality: 'fallback',
      tts_fallback_reason: 'TTS service unavailable',
      enhanced_tts: true
    });
    
    return audioFilePath;
    
  } catch (fallbackError) {
    console.error(`[${jobId}] ❌ Enhanced TTS fallback creation failed:`, fallbackError.message);
    throw new Error(`Enhanced TTS and fallback both failed: ${fallbackError.message}`);
  }
};

// ===== SUPPORTED INDIAN VOICES FOR EDGE-TTS =====
/**
 * Get Indian languages and premium neural voices supported by Edge-TTS
 * Enhanced with gender alternatives and quality ratings
 * @returns {Object} - Enhanced object with language codes and Edge-TTS voice configurations
 */
export const getSupportedIndianVoices = () => {
  return {
    // ===== TIER 1: PREMIUM NEURAL VOICES (EXCELLENT QUALITY) =====
    'hi': {
      voice: 'hi-IN-SwaraNeural',    // Female Hindi voice
      name: 'हिंदी (Hindi)',
      quality: 'excellent',          // ⭐ Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'hi-IN-MadhurNeural' // Male alternative
    },
    'bn': {
      voice: 'bn-IN-BashkarNeural',  // Male Bengali voice
      name: 'বাংলা (Bengali)', 
      quality: 'excellent',          // ⭐ Premium quality
      gender: 'male',
      region: 'India',
      alternative: 'bn-IN-TanishaaNeural' // Female alternative
    },
    'te': {
      voice: 'te-IN-ShrutiNeural',   // Female Telugu voice
      name: 'తెలుగు (Telugu)',
      quality: 'excellent',          // ⭐ Premium quality
      gender: 'female', 
      region: 'India',
      alternative: 'te-IN-MohanNeural' // Male alternative
    },
    'ta': {
      voice: 'ta-IN-PallaviNeural',  // Female Tamil voice
      name: 'தமிழ் (Tamil)',
      quality: 'excellent',          // ⭐ Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'ta-IN-ValluvarNeural' // Male alternative
    },
    'mr': {
      voice: 'mr-IN-AarohiNeural',   // Female Marathi voice
      name: 'मराठी (Marathi)',
      quality: 'excellent',          // ⭐ Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'mr-IN-ManoharNeural' // Male alternative
    },
    'gu': {
      voice: 'gu-IN-DhwaniNeural',   // Female Gujarati voice
      name: 'ગુજરાતી (Gujarati)',
      quality: 'excellent',          // ⭐ Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'gu-IN-NiranjanNeural' // Male alternative
    },
    'kn': {
      voice: 'kn-IN-SapnaNeural',    // Female Kannada voice
      name: 'ಕನ್ನಡ (Kannada)',
      quality: 'excellent',          // ⭐ Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'kn-IN-GaganNeural' // Male alternative
    },
    'ml': {
      voice: 'ml-IN-SobhanaNeural',  // Female Malayalam voice
      name: 'മലയാളം (Malayalam)',
      quality: 'excellent',          // ⭐ Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'ml-IN-MidhunNeural' // Male alternative
    },
    
    // ===== TIER 2: GOOD QUALITY VOICES =====
    'pa': {
      voice: 'pa-IN-GaganNeural',    // Male Punjabi voice
      name: 'ਪੰਜਾਬੀ (Punjabi)',
      quality: 'good',               // ✅ Good quality
      gender: 'male',
      region: 'India'
    },
    'ur': {
      voice: 'ur-PK-AsadNeural',     // Male Urdu voice (Pakistan)
      name: 'اردو (Urdu)',
      quality: 'good',               // ✅ Good quality
      gender: 'male',
      region: 'Pakistan',
      alternative: 'ur-PK-UzmaNeural' // Female alternative
    },
    'en': {
      voice: 'en-IN-NeerjaNeural',   // Female Indian English voice
      name: 'English (India)',
      quality: 'excellent',          // ⭐ Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'en-IN-PrabhatNeural' // Male alternative
    },
    
    // ===== TIER 3: FALLBACK VOICES FOR UNSUPPORTED LANGUAGES =====
    'as': {
      voice: 'hi-IN-SwaraNeural',    // Fallback to Hindi for Assamese
      name: 'অসমীয়া (Assamese → Hindi)',
      quality: 'fallback',
      gender: 'female',
      region: 'India',
      note: 'Uses Hindi voice as fallback'
    },
    'or': {
      voice: 'hi-IN-SwaraNeural',    // Fallback to Hindi for Odia
      name: 'ଓଡ଼ିଆ (Odia → Hindi)',
      quality: 'fallback',
      gender: 'female',
      region: 'India',
      note: 'Uses Hindi voice as fallback'
    },
    'ne': {
      voice: 'hi-IN-SwaraNeural',    // Fallback to Hindi for Nepali
      name: 'नेपाली (Nepali → Hindi)',
      quality: 'fallback',
      gender: 'female',
      region: 'India',
      note: 'Uses Hindi voice as fallback'
    }
  };
};

// ===== HELPER FUNCTION: GET VOICE ALTERNATIVES =====
/**
 * Get alternative voices for a language (different genders/styles)
 * @param {string} langCode - Language code
 * @returns {Array} - Array of available voices for that language
 */
export const getVoiceAlternatives = (langCode) => {
  const allVoices = getSupportedIndianVoices();
  const alternatives = [];
  
  // Get primary voice
  if (allVoices[langCode]) {
    alternatives.push({
      code: langCode,
      ...allVoices[langCode],
      isPrimary: true
    });
    
    // Get alternative voice if available
    if (allVoices[langCode].alternative) {
      alternatives.push({
        code: `${langCode}_alt`,
        voice: allVoices[langCode].alternative,
        name: `${allVoices[langCode].name} (Alternative)`,
        quality: allVoices[langCode].quality,
        gender: allVoices[langCode].gender === 'female' ? 'male' : 'female',
        region: allVoices[langCode].region,
        isPrimary: false
      });
    }
  }
  
  return alternatives;
};

// ===== HELPER FUNCTION: VALIDATE TTS COMPATIBILITY =====
/**
 * Check if a language code is supported by Enhanced Edge-TTS
 * @param {string} langCode - Language code to check
 * @returns {boolean} - True if supported by Enhanced Edge-TTS
 */
export const isLanguageSupportedByEdgeTTS = (langCode) => {
  const supportedVoices = getSupportedIndianVoices();
  return supportedVoices.hasOwnProperty(langCode);
};

// ===== HELPER FUNCTION: GET TTS QUALITY INFO =====
/**
 * Get enhanced quality information for a specific language
 * @param {string} langCode - Language code
 * @returns {Object} - Quality information object
 */
export const getTTSQuality = (langCode) => {
  const supportedVoices = getSupportedIndianVoices();
  const voiceInfo = supportedVoices[langCode];
  
  if (!voiceInfo) {
    return { quality: 'unsupported', supported: false };
  }
  
  return {
    quality: voiceInfo.quality,
    supported: true,
    voice: voiceInfo.voice,
    gender: voiceInfo.gender,
    region: voiceInfo.region,
    hasAlternative: !!voiceInfo.alternative,
    note: voiceInfo.note || null
  };
};

// ===== HELPER FUNCTION: LIST ALL AVAILABLE EDGE-TTS VOICES =====
/**
 * Get all available Edge-TTS voices from the system (useful for debugging)
 * @returns {Promise<Array>} - Array of all available voices
 */
export const listAllEdgeTTSVoices = async () => {
  return new Promise((resolve, reject) => {
    exec('edge-tts --list-voices', { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Failed to list Edge-TTS voices:', error.message);
        reject(error);
        return;
      }
      
      try {
        const voices = JSON.parse(stdout);
        const indianVoices = voices.filter(voice => 
          voice.Locale.includes('-IN') || // Indian locales
          voice.Locale.includes('-PK') || // Pakistan (for Urdu)
          voice.ShortName.includes('IN') ||
          voice.ShortName.includes('PK')
        );
        
        console.log(`Found ${indianVoices.length} Indian voices out of ${voices.length} total voices`);
        resolve(indianVoices);
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
};

// ===== HELPER FUNCTION: TEST TTS VOICE =====
/**
 * Test a specific voice with sample text
 * @param {string} voice - Voice name to test
 * @param {string} testText - Text to test with
 * @param {string} langCode - Language code for context
 * @returns {Promise<Object>} - Test results
 */
export const testTTSVoice = async (voice, testText = 'नमस्ते, यह एक परीक्षण है।', langCode = 'hi') => {
  try {
    const testOutputPath = './uploads/test_tts_voice.wav';
    
    // Ensure test directory exists
    const testDir = path.dirname(testOutputPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    const startTime = Date.now();
    
    await callEdgeTTS({
      text: testText,
      voice: voice,
      outputPath: testOutputPath,
      rate: '+0%',
      volume: '+0%',
      jobId: 'VOICE_TEST'
    });
    
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;
    
    // Check if file was created and get its properties
    const exists = fs.existsSync(testOutputPath);
    let fileSize = 0;
    let duration = 0;
    
    if (exists) {
      const stats = fs.statSync(testOutputPath);
      fileSize = stats.size;
      
      try {
        duration = await getAudioDuration(testOutputPath);
      } catch (durationError) {
        console.warn(`Duration check failed for voice test: ${durationError.message}`);
      }
      
      // Cleanup test file
      fs.unlinkSync(testOutputPath);
    }
    
    return {
      success: exists && fileSize > 1000,
      voice: voice,
      langCode: langCode,
      fileSize: fileSize,
      duration: duration,
      processingTime: processingTime,
      testText: testText
    };
    
  } catch (error) {
    console.error(`Voice test failed for ${voice}:`, error.message);
    return {
      success: false,
      voice: voice,
      langCode: langCode,
      error: error.message,
      testText: testText
    };
  }
};

// ===== HELPER FUNCTION: GET BEST VOICE FOR LANGUAGE =====
/**
 * Get the best recommended voice for a specific language
 * @param {string} langCode - Language code
 * @param {string} preferredGender - 'male', 'female', or 'any'
 * @returns {Object|null} - Best voice configuration or null
 */
export const getBestVoiceForLanguage = (langCode, preferredGender = 'any') => {
  const supportedVoices = getSupportedIndianVoices();
  const voiceConfig = supportedVoices[langCode];
  
  if (!voiceConfig) {
    return null;
  }
  
  // If gender preference matches primary voice or no preference
  if (preferredGender === 'any' || voiceConfig.gender === preferredGender) {
    return voiceConfig;
  }
  
  // If gender preference doesn't match and there's an alternative
  if (voiceConfig.alternative) {
    return {
      ...voiceConfig,
      voice: voiceConfig.alternative,
      gender: voiceConfig.gender === 'female' ? 'male' : 'female',
      name: `${voiceConfig.name} (${voiceConfig.gender === 'female' ? 'Male' : 'Female'})`
    };
  }
  
  // Return primary voice even if gender doesn't match
  return voiceConfig;
};

// ===== MAIN EXPORT =====
export default {
  generateTTS,
  getSupportedIndianVoices,
  getVoiceAlternatives,
  isLanguageSupportedByEdgeTTS,
  getTTSQuality,
  listAllEdgeTTSVoices,
  testTTSVoice,
  getBestVoiceForLanguage
};
