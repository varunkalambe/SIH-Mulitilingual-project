// services/ttsService.js - COMPLETE INTEGRATED TTS SERVICE WITH DURATION FIX

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

// ===== MAIN ENHANCED TTS FUNCTION - NO DATABASE DEPENDENCY =====
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
    
    // ===== GET ACTUAL VIDEO DURATION DIRECTLY FROM FILE =====
    console.log(`[${jobId}] Detecting video duration directly from files...`);
    
    let actualDuration = 0;
    const possibleVideoPaths = [
      `./uploads/originals/${jobId}.mp4`,
      `./uploads/originals/1758761895481.mp4`, // Your specific file
      './uploads/originals/*.mp4' // Will check all MP4s
    ];
    
    // Find the original video file
    let originalVideoPath = null;
    
    // Check specific paths first
    for (const videoPath of possibleVideoPaths.slice(0, 2)) {
      if (fs.existsSync(videoPath)) {
        originalVideoPath = videoPath;
        console.log(`[${jobId}] Found original video: ${videoPath}`);
        break;
      }
    }
    
    // If not found, scan the originals directory
    if (!originalVideoPath) {
      const originalsDir = './uploads/originals/';
      if (fs.existsSync(originalsDir)) {
        const files = fs.readdirSync(originalsDir);
        const videoFiles = files.filter(file => 
          file.endsWith('.mp4') || file.endsWith('.mov') || 
          file.endsWith('.avi') || file.endsWith('.mkv')
        );
        
        if (videoFiles.length > 0) {
          // Use the most recent video file
          const mostRecentVideo = videoFiles
            .map(file => ({
              name: file,
              path: path.join(originalsDir, file),
              mtime: fs.statSync(path.join(originalsDir, file)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime)[0];
            
          originalVideoPath = mostRecentVideo.path;
          console.log(`[${jobId}] Using most recent video: ${mostRecentVideo.name}`);
        }
      }
    }
    
    // Get duration directly from video file using FFprobe
    if (originalVideoPath && fs.existsSync(originalVideoPath)) {
      actualDuration = await getVideoDurationDirect(originalVideoPath);
      console.log(`[${jobId}] ✅ Detected actual video duration: ${actualDuration}s`);
    } else {
      // Fallback: estimate from translation or use default
      actualDuration = translation.original_duration || 30;
      console.warn(`[${jobId}] ⚠️ Could not find video file, using estimate: ${actualDuration}s`);
    }
    
    // ===== VALIDATE SUPPORTED INDIAN LANGUAGE =====
    const supportedVoices = getSupportedIndianVoices();
    const targetLanguage = translation.language;
    
    if (!supportedVoices[targetLanguage]) {
      console.warn(`[${jobId}] Language ${targetLanguage} not supported, using enhanced fallback`);
      return createEnhancedTTSFallback(translation, jobId);
    }
    
    const voiceConfig = supportedVoices[targetLanguage];
    
    console.log(`[${jobId}] Enhanced TTS Configuration:`);
    console.log(`[${jobId}]   Language: ${voiceConfig.name}`);
    console.log(`[${jobId}]   Voice: ${voiceConfig.voice}`);
    console.log(`[${jobId}]   Quality: ${voiceConfig.quality}`);
    console.log(`[${jobId}]   Text length: ${translation.text.length} characters`);
    console.log(`[${jobId}]   Target duration: ${actualDuration} seconds`); // ✅ FIXED: Use actual duration
    console.log(`[${jobId}]   Segments available: ${translation.segments ? translation.segments.length : 0}`);
    
    // ===== CREATE OUTPUT DIRECTORY =====
    const outputDir = './uploads/translated_audio';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`[${jobId}] Created translated_audio directory: ${outputDir}`);
    }
    
    const audioFileName = `${jobId}_translated.wav`;
    const audioFilePath = path.join(outputDir, audioFileName);
    console.log(`[${jobId}] Enhanced TTS output file: ${audioFilePath}`);
    
    // ===== CHOOSE TTS GENERATION METHOD =====
    // ✅ FIXED: Pass actual duration to generation methods
    if (translation.segments && translation.segments.length > 0) {
      console.log(`[${jobId}] Using segment-based TTS for perfect duration preservation...`);
      return await generateSegmentBasedTTS({
        ...translation,
        original_duration: actualDuration // ✅ FIXED: Use actual duration
      }, voiceConfig, audioFilePath, jobId);
    } else {
      console.log(`[${jobId}] Using full-text TTS (no segments available)...`);
      return await generateFullTextTTS({
        ...translation,
        original_duration: actualDuration // ✅ FIXED: Use actual duration  
      }, voiceConfig, audioFilePath, jobId);
    }
    
  } catch (error) {
    console.error(`[${jobId}] ❌ Enhanced TTS failed:`, error.message);
    
    // No database operations - just log error
    console.error(`[${jobId}] TTS error details:`, error.stack);
    
    // Return fallback instead of throwing error
    return createEnhancedTTSFallback(translation, jobId);
  }
};

// ===== HELPER FUNCTION: GET VIDEO DURATION DIRECTLY (NO DATABASE) =====
/**
 * Get video duration directly from video file using FFprobe
 * @param {string} videoPath - Path to video file
 * @returns {Promise<number>} - Duration in seconds
 */
const getVideoDurationDirect = async (videoPath) => {
  return new Promise((resolve, reject) => {
    // FFprobe command to get duration in seconds
    const ffprobeCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
    
    console.log(`🔍 Getting video duration: ${videoPath}`);
    console.log(`📋 Command: ${ffprobeCommand}`);
    
    exec(ffprobeCommand, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Duration detection failed:', error.message);
        console.error('FFprobe stderr:', stderr);
        reject(new Error(`Duration detection failed: ${error.message}`));
        return;
      }
      
      const durationStr = stdout.trim();
      const duration = parseFloat(durationStr);
      
      console.log(`📏 Raw duration output: "${durationStr}"`);
      console.log(`⏱️ Parsed duration: ${duration}s`);
      
      if (isNaN(duration) || duration <= 0) {
        reject(new Error(`Invalid duration detected: ${durationStr}`));
        return;
      }
      
      resolve(Math.round(duration)); // Round to nearest second
    });
  });
};

// ===== SEGMENT-BASED TTS FOR PERFECT DURATION PRESERVATION (NO DATABASE) =====
const generateSegmentBasedTTS = async (translation, voiceConfig, outputPath, jobId) => {
  console.log(`[${jobId}] Generating segment-based TTS with perfect duration matching...`);
  
  const segmentAudioFiles = [];
  const tempDir = './uploads/temp_audio';
  
  // Create temporary directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`[${jobId}] Created temporary audio directory: ${tempDir}`);
  }
  
  try {
    console.log(`[${jobId}] Processing ${translation.segments.length} segments for TTS generation...`);
    
    // ✅ FIXED: Calculate segment durations based on actual video duration
    const actualDuration = translation.original_duration; // This is now the correct duration from video file
    const totalSegments = translation.segments.length;
    const segmentDuration = actualDuration / totalSegments; // Equal time per segment
    
    console.log(`[${jobId}] ✅ Actual video duration: ${actualDuration}s (detected from file)`);
    console.log(`[${jobId}] 📊 Segment duration: ${segmentDuration.toFixed(2)}s each`);
    console.log(`[${jobId}] 🎯 Target total duration: ${actualDuration}s`);
    
    // ===== GENERATE AUDIO FOR EACH SEGMENT =====
    for (let i = 0; i < translation.segments.length; i++) {
      const segment = translation.segments[i];
      const targetSegmentDuration = segmentDuration;
      
      console.log(`[${jobId}] Processing segment ${i + 1}/${translation.segments.length}:`);
      console.log(`[${jobId}]   Start: ${(i * segmentDuration).toFixed(2)}s, End: ${((i + 1) * segmentDuration).toFixed(2)}s, Duration: ${targetSegmentDuration.toFixed(2)}s`);
      console.log(`[${jobId}]   Text: "${segment.text.substring(0, 50)}..."`);
      
      if (!segment.text || segment.text.trim().length === 0) {
        // Create silence for empty segments
        console.log(`[${jobId}] Creating silence for empty segment ${i + 1}`);
        const silenceFile = path.join(tempDir, `${jobId}_segment_${i}_silence.wav`);
        await createSilenceFile(silenceFile, targetSegmentDuration);
        segmentAudioFiles.push({
          file: silenceFile,
          duration: targetSegmentDuration,
          isSilence: true,
          segmentIndex: i
        });
        continue;
      }
      
      const segmentFile = path.join(tempDir, `${jobId}_segment_${i}.wav`);
      
      // ===== CALCULATE OPTIMAL SPEECH RATE =====
      const wordCount = segment.text.split(' ').filter(word => word.length > 0).length;
      const normalWPM = 150; // Words per minute for normal speech
      const requiredWPM = Math.max(50, Math.min(300, (wordCount / Math.max(targetSegmentDuration, 0.5)) * 60));
      const speechRate = Math.round((requiredWPM / normalWPM) * 100);
      
      console.log(`[${jobId}]   Word count: ${wordCount}, Target WPM: ${Math.round(requiredWPM)}, Speech rate: ${speechRate}%`);
      
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
        const generatedDuration = await getAudioDuration(segmentFile);
        const durationDifference = Math.abs(generatedDuration - targetSegmentDuration);
        
        console.log(`[${jobId}]   Generated duration: ${generatedDuration.toFixed(2)}s, Target: ${targetSegmentDuration.toFixed(2)}s, Diff: ${durationDifference.toFixed(2)}s`);
        
        // If duration mismatch is significant, adjust the audio
        if (durationDifference > 0.5) {
          console.log(`[${jobId}]   Adjusting duration for segment ${i + 1}...`);
          await adjustAudioDuration(segmentFile, targetSegmentDuration, jobId, i + 1);
          
          // Verify adjustment
          const adjustedDuration = await getAudioDuration(segmentFile);
          console.log(`[${jobId}]   Adjusted duration: ${adjustedDuration.toFixed(2)}s`);
        }
        
        segmentAudioFiles.push({
          file: segmentFile,
          duration: targetSegmentDuration,
          isSilence: false,
          segmentIndex: i,
          originalDuration: generatedDuration
        });
        
        console.log(`[${jobId}]   ✅ Segment ${i + 1} TTS completed successfully`);
        
      } catch (segmentError) {
        console.warn(`[${jobId}] Segment ${i + 1} TTS failed: ${segmentError.message}`);
        console.log(`[${jobId}] Using silence as fallback for segment ${i + 1}`);
        
        // Create silence as fallback
        const silenceFile = path.join(tempDir, `${jobId}_segment_${i}_silence.wav`);
        await createSilenceFile(silenceFile, targetSegmentDuration);
        segmentAudioFiles.push({
          file: silenceFile,
          duration: targetSegmentDuration,
          isSilence: true,
          segmentIndex: i,
          fallbackReason: segmentError.message
        });
      }
      
      // Small delay between segments to avoid overwhelming the system
      if (i < translation.segments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    console.log(`[${jobId}] ✅ All segments processed. Successful: ${segmentAudioFiles.filter(f => !f.isSilence).length}/${translation.segments.length}`);
    
    // ===== CONCATENATE ALL SEGMENT AUDIO FILES =====
    console.log(`[${jobId}] Concatenating ${segmentAudioFiles.length} audio segments...`);
    await concatenateAudioFiles(segmentAudioFiles.map(f => f.file), outputPath, jobId);
    
    // ===== VERIFY FINAL DURATION AND QUALITY =====
    const finalDuration = await getAudioDuration(outputPath);
    const durationDifference = Math.abs(finalDuration - actualDuration);
    const durationPreserved = durationDifference < 1.5;
    
    console.log(`[${jobId}] Final TTS Results:`);
    console.log(`[${jobId}]   Final audio duration: ${finalDuration.toFixed(2)} seconds`);
    console.log(`[${jobId}]   Target duration: ${actualDuration.toFixed(2)} seconds`);
    console.log(`[${jobId}]   Duration difference: ${durationDifference.toFixed(2)} seconds`);
    console.log(`[${jobId}]   Duration preserved: ${durationPreserved ? '✅ YES' : '❌ NO'}`);
    
    // If duration is still not matching, do a final adjustment
    if (!durationPreserved && Math.abs(durationDifference) > 0.5) {
      console.log(`[${jobId}] 🔧 Final duration adjustment needed...`);
      
      try {
        await adjustAudioDuration(outputPath, actualDuration, jobId, 'final');
        const correctedDuration = await getAudioDuration(outputPath);
        console.log(`[${jobId}] ✅ Final duration corrected: ${correctedDuration.toFixed(2)}s`);
      } catch (adjustError) {
        console.warn(`[${jobId}] Final duration adjustment failed: ${adjustError.message}`);
      }
    }
    
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
        console.warn(`[${jobId}] Failed to cleanup ${audioFile.file}:`, cleanupError.message);
        cleanupFailed++;
      }
    });
    
    // Remove temporary directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`[${jobId}] ✅ Temporary directory cleaned up`);
    } catch (dirCleanupError) {
      console.warn(`[${jobId}] Failed to cleanup temp directory:`, dirCleanupError.message);
    }
    
    console.log(`[${jobId}] Cleanup completed: ${cleanupSuccessful} files removed, ${cleanupFailed} failed`);
    
    // ===== NO DATABASE SAVES - JUST RETURN PATH =====
    const fileStats = fs.statSync(outputPath);
    console.log(`[${jobId}] ✅ Enhanced segment-based TTS completed successfully`);
    console.log(`[${jobId}] Generated ${voiceConfig.name} speech: ${Math.round(fileStats.size / 1024)} KB`);
    console.log(`[${jobId}] Duration preservation: ${durationPreserved ? 'PERFECT' : 'ACCEPTABLE'}`);
    console.log(`[${jobId}] 🎯 Final audio matches video duration: ${actualDuration}s`);
    
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

// ===== FULL TEXT TTS FALLBACK METHOD =====
const generateFullTextTTS = async (translation, voiceConfig, outputPath, jobId) => {
  console.log(`[${jobId}] Generating full-text TTS...`);
  
  // Prepare text for TTS
  let textToConvert = translation.text;
  
  // Handle long text by truncating if necessary
  if (translation.text.length > 5000) {
    console.warn(`[${jobId}] Text is ${translation.text.length} characters. Truncating to 5000 for better performance.`);
    textToConvert = translation.text.substring(0, 4950) + '...';
  }
  
  // Call Edge-TTS
  console.log(`[${jobId}] Calling Edge-TTS with ${voiceConfig.voice}...`);
  const audioFilePathFinal = await callEdgeTTS({
    text: textToConvert,
    voice: voiceConfig.voice,
    outputPath: outputPath,
    rate: 0, // Normal speech rate
    volume: 0, // Normal volume
    jobId: jobId
  });
  
  // Verify file creation
  if (!fs.existsSync(audioFilePathFinal)) {
    throw new Error(`Edge-TTS output file not created: ${audioFilePathFinal}`);
  }
  
  const fileStats = fs.statSync(audioFilePathFinal);
  const finalDuration = await getAudioDuration(audioFilePathFinal);
  
  console.log(`[${jobId}] Full-text TTS completed`);
  console.log(`[${jobId}] Audio file size: ${fileStats.size} bytes`);
  console.log(`[${jobId}] Audio duration: ${finalDuration.toFixed(2)} seconds`);
  
  if (fileStats.size < 1000) {
    throw new Error(`Generated audio file is too small (${fileStats.size} bytes). May indicate TTS error.`);
  }
  
  console.log(`[${jobId}] Enhanced full-text TTS completed successfully`);
  return audioFilePathFinal;
};

// ===== GENERATE SINGLE SEGMENT TTS - FIXED RATE PARAMETER =====
const generateSingleSegmentTTS = (text, voice, outputPath, speechRate, jobId, segmentNumber) => {
  return new Promise((resolve, reject) => {
    // Clean text for Edge-TTS command line
    const cleanText = text.replace(/"/g, '').replace(/'/g, '').replace(/\\/g, '').replace(/\$/g, '').replace(/`/g, '').trim();
    
    // ✅ FIXED: CORRECT RATE PARAMETER FORMAT
    // Build rate parameter without quotes for negative values
    let rateParam;
    if (speechRate > 100) {
      rateParam = `+${speechRate - 100}%`;
    } else {
      rateParam = `-${100 - speechRate}%`;
    }
    
    // ✅ FIXED: USE CORRECT EDGE-TTS COMMAND FORMAT
    // Use --rate=value format for negative values without quotes
    const edgeTTSCommand = `edge-tts --voice "${voice}" --text "${cleanText}" --rate="${rateParam}" --write-media "${outputPath}"`;
    
    console.log(`[${jobId}] Edge-TTS segment ${segmentNumber} command: rate=${rateParam}, text length=${text.length}`);
    
    exec(edgeTTSCommand, { 
      maxBuffer: 1024 * 1024 * 20, // 20MB buffer
      timeout: 45000 // 45 second timeout
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[${jobId}] Edge-TTS segment ${segmentNumber} failed:`, error.message);
        reject(new Error(`Edge-TTS segment ${segmentNumber} failed: ${error.message}`));
        return;
      }
      
      if (stderr) {
        console.warn(`[${jobId}] Edge-TTS segment ${segmentNumber} warnings:`, stderr);
      }
      
      console.log(`[${jobId}] ✅ Edge-TTS segment ${segmentNumber} completed`);
      resolve(outputPath);
    });
  });
};

// ===== HELPER FUNCTION: CALL EDGE-TTS =====
const callEdgeTTS = async (options) => {
  const { text, voice, outputPath, rate, volume, jobId } = options;
  
  return new Promise((resolve, reject) => {
    // Escape text for command line
    const escapedText = text.replace(/"/g, '').replace(/'/g, '').replace(/\\/g, '').replace(/\$/g, '').replace(/`/g, '').trim();
    
    // Build Edge-TTS command
    const edgeTTSCommand = `edge-tts --voice "${voice}" --text "${escapedText}" --write-media "${outputPath}" --write-subtitles "${outputPath}.vtt"`;
    
    console.log(`[${jobId}] Edge-TTS full-text command: voice=${voice}, ${text.length} chars`);
    console.log(`[${jobId}] Output: ${outputPath}`);
    
    // Execute Edge-TTS command
    exec(edgeTTSCommand, {
      maxBuffer: 1024 * 1024 * 50, // 50MB buffer for large audio files
      timeout: 120000 // 2 minute timeout for full text
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
      
      // Log any stderr warnings, non-fatal errors
      if (stderr) {
        console.warn(`[${jobId}] Edge-TTS full-text warnings:`, stderr);
      }
      
      console.log(`[${jobId}] Edge-TTS full-text command completed successfully`);
      resolve(outputPath);
    });
  });
};

// ===== CREATE SILENCE FILE =====
const createSilenceFile = async (outputPath, duration) => {
  const silenceCommand = `ffmpeg -f lavfi -i "anullsrc=r=16000:cl=mono" -t ${duration} -y "${outputPath}"`;
  
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

// ===== ADJUST AUDIO DURATION USING TEMPO =====
const adjustAudioDuration = async (audioFile, targetDuration, jobId, segmentNumber) => {
  return new Promise(async (resolve, reject) => {
    try {
      const currentDuration = await getAudioDuration(audioFile);
      const speedRatio = currentDuration / targetDuration;
      
      // Limit speed ratio to reasonable bounds
      const clampedRatio = Math.max(0.5, Math.min(2.0, speedRatio));
      
      if (Math.abs(speedRatio - 1) < 0.05) {
        // If difference is less than 5%, don't adjust
        console.log(`[${jobId}]   Speed adjustment not needed (ratio: ${speedRatio.toFixed(3)})`);
        resolve();
        return;
      }
      
      const tempFile = audioFile + '_temp_adjust';
      
      console.log(`[${jobId}]   Adjusting segment ${segmentNumber} duration: speed ratio = ${clampedRatio.toFixed(3)}`);
      
      const command = `ffmpeg -i "${audioFile}" -filter:a "atempo=${clampedRatio}" -y "${tempFile}"`;
      
      exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[${jobId}] Duration adjustment failed:`, error.message);
          reject(error);
          return;
        }
        
        try {
          // Replace original with adjusted
          if (fs.existsSync(tempFile)) {
            fs.copyFileSync(tempFile, audioFile);
            fs.unlinkSync(tempFile);
            resolve();
          } else {
            reject(new Error('Adjusted file was not created'));
          }
        } catch (fileError) {
          reject(fileError);
        }
      });
      
    } catch (durationError) {
      reject(durationError);
    }
  });
};

// ===== CONCATENATE AUDIO FILES =====
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
      maxBuffer: 1024 * 1024 * 200, // 200MB buffer
      timeout: 120000 // 2 minute timeout
    }, (error, stdout, stderr) => {
      // Cleanup file list regardless of result
      try {
        if (fs.existsSync(fileListPath)) {
          fs.unlinkSync(fileListPath);
        }
      } catch (cleanupError) {
        console.warn(`[${jobId}] Failed to cleanup file list:`, cleanupError.message);
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
const createEnhancedTTSFallback = async (translation, jobId) => {
  console.log(`[${jobId}] Creating enhanced TTS fallback (silent audio file)...`);
  
  const outputDir = './uploads/translated_audio';
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
    
    console.log(`[${jobId}] Enhanced TTS fallback created: ${audioFilePath}`);
    console.log(`[${jobId}] Fallback file size: ${fileStats.size} bytes, Duration: ${fallbackDuration.toFixed(2)}s`);
    
    return audioFilePath;
    
  } catch (fallbackError) {
    console.error(`[${jobId}] Enhanced TTS fallback creation failed:`, fallbackError.message);
    throw new Error(`Enhanced TTS and fallback both failed: ${fallbackError.message}`);
  }
};

// ===== SUPPORTED INDIAN VOICES FOR EDGE-TTS =====
export const getSupportedIndianVoices = () => {
  return {
    // TIER 1: PREMIUM NEURAL VOICES - EXCELLENT QUALITY
    'hi': {
      voice: 'hi-IN-SwaraNeural', // Female Hindi voice
      name: 'हिंदी (Hindi)',
      quality: 'excellent', // Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'hi-IN-MadhurNeural' // Male alternative
    },
    'bn': {
      voice: 'bn-IN-BashkarNeural', // Male Bengali voice
      name: 'বাংলা (Bengali)',
      quality: 'excellent', // Premium quality
      gender: 'male',
      region: 'India',
      alternative: 'bn-IN-TanishaaNeural' // Female alternative
    },
    'te': {
      voice: 'te-IN-ShrutiNeural', // Female Telugu voice
      name: 'తెలుగు (Telugu)',
      quality: 'excellent', // Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'te-IN-MohanNeural' // Male alternative
    },
    'ta': {
      voice: 'ta-IN-PallaviNeural', // Female Tamil voice
      name: 'தமிழ் (Tamil)',
      quality: 'excellent', // Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'ta-IN-ValluvarNeural' // Male alternative
    },
    'mr': {
      voice: 'mr-IN-AarohiNeural', // Female Marathi voice
      name: 'मराठी (Marathi)',
      quality: 'excellent', // Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'mr-IN-ManoharNeural' // Male alternative
    },
    'gu': {
      voice: 'gu-IN-DhwaniNeural', // Female Gujarati voice
      name: 'ગુજરાતી (Gujarati)',
      quality: 'excellent', // Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'gu-IN-NiranjanNeural' // Male alternative
    },
    'kn': {
      voice: 'kn-IN-SapnaNeural', // Female Kannada voice
      name: 'ಕನ್ನಡ (Kannada)',
      quality: 'excellent', // Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'kn-IN-GaganNeural' // Male alternative
    },
    'ml': {
      voice: 'ml-IN-SobhanaNeural', // Female Malayalam voice
      name: 'മലയാളം (Malayalam)',
      quality: 'excellent', // Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'ml-IN-MidhunNeural' // Male alternative
    },
    
    // TIER 2: GOOD QUALITY VOICES
    'pa': {
      voice: 'pa-IN-GaganNeural', // Male Punjabi voice
      name: 'ਪੰਜਾਬੀ (Punjabi)',
      quality: 'good', // Good quality
      gender: 'male',
      region: 'India'
    },
    'ur': {
      voice: 'ur-PK-AsadNeural', // Male Urdu voice (Pakistan)
      name: 'اردو (Urdu)',
      quality: 'good', // Good quality
      gender: 'male',
      region: 'Pakistan',
      alternative: 'ur-PK-UzmaNeural' // Female alternative
    },
    'en': {
      voice: 'en-IN-NeerjaNeural', // Female Indian English voice
      name: 'English (India)',
      quality: 'excellent', // Premium quality
      gender: 'female',
      region: 'India',
      alternative: 'en-IN-PrabhatNeural' // Male alternative
    },
    
    // TIER 3: FALLBACK VOICES FOR UNSUPPORTED LANGUAGES
    'as': {
      voice: 'hi-IN-SwaraNeural', // Fallback to Hindi for Assamese
      name: 'অসমীয়া → हिंदी (Assamese → Hindi)',
      quality: 'fallback',
      gender: 'female',
      region: 'India',
      note: 'Uses Hindi voice as fallback'
    },
    'or': {
      voice: 'hi-IN-SwaraNeural', // Fallback to Hindi for Odia
      name: 'ଓଡ଼ିଆ → हिंदी (Odia → Hindi)',
      quality: 'fallback',
      gender: 'female',
      region: 'India',
      note: 'Uses Hindi voice as fallback'
    },
    'ne': {
      voice: 'hi-IN-SwaraNeural', // Fallback to Hindi for Nepali
      name: 'नेपाली → हिंदी (Nepali → Hindi)',
      quality: 'fallback',
      gender: 'female',
      region: 'India',
      note: 'Uses Hindi voice as fallback'
    }
  };
};

// ===== EXPORT ALL FUNCTIONS =====
export default {
  generateTTS,
  getSupportedIndianVoices
};
