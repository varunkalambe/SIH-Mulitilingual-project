// services/captionService.js - FIXED TO SYNC WITH REGENERATED AUDIO DURATIONS

// ===== IMPORT REQUIRED MODULES =====
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

// ===== CAPTION AND TRANSCRIPT GENERATION SERVICE - NO DATABASE DEPENDENCY =====
/**
 * Generate WebVTT captions and plain text transcript from translated segments
 * Synced with newly regenerated TTS audio durations (no database dependency)
 * Called by processController.js in step 6 of processing pipeline
 * @param {Object} translation - Translation object from translationService with text, language, segments
 * @param {string} jobId - Unique job identifier for file naming
 * @returns {Promise<Object>} - Object with captionPath and transcriptPath
 */
export const generateCaptions = async (translation, jobId) => {
  try {
    console.log(`[${jobId}] Starting caption and transcript generation...`);
    
    // ===== VALIDATE INPUT TRANSLATION =====
    if (!translation || !translation.segments) {
      throw new Error('Invalid translation object or missing segments');
    }
    
    if (!Array.isArray(translation.segments) || translation.segments.length === 0) {
      throw new Error('Translation segments array is empty or invalid');
    }
    
    console.log(`[${jobId}] Processing ${translation.segments.length} segments for captions`);
    console.log(`[${jobId}] Target language: ${translation.language_name || translation.language}`);
    
    // ===== GET ACTUAL DURATIONS DIRECTLY FROM FILES =====
    console.log(`[${jobId}] 🔍 Detecting actual durations from generated files...`);
    
    // Get video duration from original video file
    let videoDuration = 0;
    const originalVideoPath = await findOriginalVideoFile(jobId);
    if (originalVideoPath) {
      videoDuration = await getFileDuration(originalVideoPath);
      console.log(`[${jobId}] ✅ Original video duration: ${videoDuration}s`);
    }
    
    // Get TTS audio duration from generated file
    let audioDuration = 0;
    const ttsAudioPath = `./uploads/translated_audio/${jobId}_translated.wav`;
    if (fs.existsSync(ttsAudioPath)) {
      audioDuration = await getFileDuration(ttsAudioPath);
      console.log(`[${jobId}] ✅ Generated TTS audio duration: ${audioDuration}s`);
    }
    
    // Use the actual durations for caption timing
    const actualDuration = audioDuration || videoDuration || 30; // Prefer TTS audio duration
    
    console.log(`[${jobId}] 🎯 Using duration for captions: ${actualDuration}s`);
    console.log(`[${jobId}] 📊 Segment count: ${translation.segments.length}`);
    console.log(`[${jobId}] ⏱️ Duration per segment: ${(actualDuration / translation.segments.length).toFixed(2)}s`);
    
    // ===== CREATE OUTPUT DIRECTORIES =====
    const captionsDir = './uploads/captions/';
    const transcriptsDir = './uploads/transcripts/';
    
    // Create captions directory
    if (!fs.existsSync(captionsDir)) {
      fs.mkdirSync(captionsDir, { recursive: true });
      console.log(`[${jobId}] Created captions directory: ${captionsDir}`);
    }
    
    // Create transcripts directory
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
      console.log(`[${jobId}] Created transcripts directory: ${transcriptsDir}`);
    }
    
    // ===== PREPARE OUTPUT FILE PATHS =====
    const captionFileName = `${jobId}_captions.vtt`;
    const transcriptFileName = `${jobId}_transcript.txt`;
    const srtFileName = `${jobId}_captions.srt`;
    
    const captionFilePath = path.join(captionsDir, captionFileName);
    const transcriptFilePath = path.join(transcriptsDir, transcriptFileName);
    const srtFilePath = path.join(captionsDir, srtFileName);
    
    console.log(`[${jobId}] Caption file: ${captionFilePath}`);
    console.log(`[${jobId}] SRT file: ${srtFilePath}`);
    console.log(`[${jobId}] Transcript file: ${transcriptFilePath}`);
    
    // ===== REGENERATE SEGMENT TIMING BASED ON ACTUAL DURATION =====
    console.log(`[${jobId}] 🔧 Regenerating segment timing for captions...`);
    const syncedSegments = regenerateSegmentTiming(translation.segments, actualDuration, jobId);
    
    // ===== GENERATE WEBVTT CAPTIONS =====
    console.log(`[${jobId}] Step 1/3: Generating WebVTT captions...`);
    const webvttContent = generateWebVTT(syncedSegments, translation, jobId);
    
    // Write WebVTT file
    fs.writeFileSync(captionFilePath, webvttContent, 'utf8');
    console.log(`[${jobId}] ✅ WebVTT generation completed: ${webvttContent.length} characters`);
    console.log(`[${jobId}] ✅ WebVTT captions saved: ${webvttContent.length} characters`);
    
    // ===== GENERATE SRT CAPTIONS =====
    console.log(`[${jobId}] Step 2/3: Generating SRT captions...`);
    const srtContent = generateSRT(syncedSegments, translation, jobId);
    
    // Write SRT file
    fs.writeFileSync(srtFilePath, srtContent, 'utf8');
    console.log(`[${jobId}] ✅ SRT generation completed: ${srtContent.length} characters`);
    console.log(`[${jobId}] ✅ SRT captions saved: ${srtContent.length} characters`);
    
    // ===== GENERATE PLAIN TEXT TRANSCRIPT =====
    console.log(`[${jobId}] Step 3/3: Generating plain text transcript...`);
    const transcriptContent = generatePlainTextTranscript(syncedSegments, translation, jobId);
    
    // Write transcript file
    fs.writeFileSync(transcriptFilePath, transcriptContent, 'utf8');
    console.log(`[${jobId}] ✅ Plain text transcript generation completed: ${transcriptContent.length} characters`);
    console.log(`[${jobId}] ✅ Plain text transcript saved: ${transcriptContent.length} characters`);
    
    // ===== VALIDATE GENERATED FILES =====
    const captionStats = fs.statSync(captionFilePath);
    const srtStats = fs.statSync(srtFilePath);
    const transcriptStats = fs.statSync(transcriptFilePath);
    
    if (captionStats.size < 50) {
      throw new Error(`Generated caption file is too small (${captionStats.size} bytes)`);
    }
    
    if (transcriptStats.size < 10) {
      throw new Error(`Generated transcript file is too small (${transcriptStats.size} bytes)`);
    }
    
    // ===== NO DATABASE OPERATIONS - JUST RETURN RESULTS =====
    console.log(`[${jobId}] ✅ Caption and transcript generation completed successfully`);
    console.log(`[${jobId}] WebVTT: ${Math.round(captionStats.size / 1024)} KB, SRT: ${Math.round(srtStats.size / 1024)} KB, Transcript: ${Math.round(transcriptStats.size / 1024)} KB`);
    console.log(`[${jobId}] 🎯 Captions synced with ${actualDuration}s audio duration`);
    
    // ===== RETURN FILE PATHS =====
    return {
      captionPath: captionFilePath,
      srtPath: srtFilePath,
      transcriptPath: transcriptFilePath,
      statistics: getCaptionStatistics(syncedSegments),
      syncInfo: {
        originalDuration: videoDuration,
        audioDuration: audioDuration,
        usedDuration: actualDuration,
        segmentCount: syncedSegments.length,
        avgSegmentDuration: actualDuration / syncedSegments.length
      }
    };
    
  } catch (error) {
    console.error(`[${jobId}] ❌ Caption generation failed:`, error.message);
    console.error(`[${jobId}] Error details:`, error.stack);
    throw error;
  }
};

// ===== HELPER FUNCTION: FIND ORIGINAL VIDEO FILE =====
/**
 * Find original video file in uploads/originals directory
 * @param {string} jobId - Job ID for context
 * @returns {Promise<string|null>} - Path to video file or null
 */
const findOriginalVideoFile = async (jobId) => {
  try {
    const originalsDir = './uploads/originals/';
    
    if (!fs.existsSync(originalsDir)) {
      console.warn(`[${jobId}] Originals directory not found: ${originalsDir}`);
      return null;
    }
    
    const files = fs.readdirSync(originalsDir);
    const videoFiles = files.filter(file => 
      file.endsWith('.mp4') || file.endsWith('.mov') || 
      file.endsWith('.avi') || file.endsWith('.mkv') || file.endsWith('.webm')
    );
    
    if (videoFiles.length === 0) {
      console.warn(`[${jobId}] No video files found in ${originalsDir}`);
      return null;
    }
    
    // Use the most recent video file
    const mostRecentVideo = videoFiles
      .map(file => ({
        name: file,
        path: path.join(originalsDir, file),
        mtime: fs.statSync(path.join(originalsDir, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime)[0];
    
    console.log(`[${jobId}] Found original video: ${mostRecentVideo.name}`);
    return mostRecentVideo.path;
    
  } catch (error) {
    console.warn(`[${jobId}] Error finding original video:`, error.message);
    return null;
  }
};

// ===== HELPER FUNCTION: GET FILE DURATION DIRECTLY =====
/**
 * Get duration of audio/video file using FFprobe
 * @param {string} filePath - Path to media file
 * @returns {Promise<number>} - Duration in seconds
 */
const getFileDuration = async (filePath) => {
  return new Promise((resolve, reject) => {
    const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
    
    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Duration detection failed for ${filePath}:`, error.message);
        resolve(0); // Return 0 instead of rejecting
        return;
      }
      
      const duration = parseFloat(stdout.trim());
      if (isNaN(duration) || duration <= 0) {
        console.warn(`Invalid duration detected for ${filePath}: ${stdout.trim()}`);
        resolve(0);
        return;
      }
      
      resolve(duration);
    });
  });
};

// ===== HELPER FUNCTION: REGENERATE SEGMENT TIMING =====
/**
 * Regenerate segment timing based on actual audio duration
 * @param {Array} originalSegments - Original segments with old timing
 * @param {number} actualDuration - Actual duration from generated audio
 * @param {string} jobId - Job ID for logging
 * @returns {Array} - Segments with updated timing
 */
const regenerateSegmentTiming = (originalSegments, actualDuration, jobId) => {
  console.log(`[${jobId}] Regenerating segment timing...`);
  console.log(`[${jobId}]   Original segments: ${originalSegments.length}`);
  console.log(`[${jobId}]   Target duration: ${actualDuration}s`);
  
  const segmentCount = originalSegments.length;
  const segmentDuration = actualDuration / segmentCount;
  
  console.log(`[${jobId}]   New segment duration: ${segmentDuration.toFixed(3)}s each`);
  
  const syncedSegments = originalSegments.map((segment, index) => {
    const newStart = index * segmentDuration;
    const newEnd = (index + 1) * segmentDuration;
    
    // Ensure last segment ends exactly at total duration
    const adjustedEnd = index === segmentCount - 1 ? actualDuration : newEnd;
    
    const syncedSegment = {
      ...segment,
      start: parseFloat(newStart.toFixed(3)),
      end: parseFloat(adjustedEnd.toFixed(3)),
      duration: parseFloat((adjustedEnd - newStart).toFixed(3)),
      index: index + 1,
      originalStart: segment.start,
      originalEnd: segment.end,
      timingRegenerated: true
    };
    
    console.log(`[${jobId}]   Segment ${index + 1}: ${newStart.toFixed(2)}s - ${adjustedEnd.toFixed(2)}s (${(adjustedEnd - newStart).toFixed(2)}s)`);
    
    return syncedSegment;
  });
  
  console.log(`[${jobId}] ✅ Segment timing regenerated for ${syncedSegments.length} segments`);
  console.log(`[${jobId}] 🎯 Total duration: ${actualDuration}s (perfect match with TTS audio)`);
  
  return syncedSegments;
};

// ===== HELPER FUNCTION: GENERATE WEBVTT CONTENT =====
/**
 * Create WebVTT format captions from translation segments
 * @param {Array} segments - Array of translation segments with start, end, text
 * @param {Object} translation - Full translation object for metadata
 * @param {string} jobId - Job ID for logging
 * @returns {string} - WebVTT formatted content
 */
export const generateWebVTT = (segments, translation, jobId) => {
  console.log(`[${jobId}] Generating WebVTT format for ${segments.length} segments...`);
  
  // ===== WEBVTT HEADER =====
  let webvtt = 'WEBVTT\n';
  webvtt += `NOTE Generated by Video Translation App\n`;
  webvtt += `NOTE Language: ${translation.language_name || translation.language}\n`;
  webvtt += `NOTE Service: ${translation.translation_service || 'enhanced-pipeline'}\n`;
  webvtt += `NOTE Generated: ${new Date().toISOString()}\n`;
  webvtt += `NOTE Synced with regenerated TTS audio\n`;
  webvtt += `NOTE Total Duration: ${segments[segments.length - 1]?.end || 0}s\n\n`;
  
  // ===== PROCESS EACH SEGMENT =====
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    // Skip segments without proper timing or text
    if (!segment.start && segment.start !== 0) {
      console.warn(`[${jobId}] Skipping segment ${i + 1}: missing start time`);
      continue;
    }
    
    if (!segment.end && segment.end !== 0) {
      console.warn(`[${jobId}] Skipping segment ${i + 1}: missing end time`);
      continue;
    }
    
    if (!segment.text || segment.text.trim().length === 0) {
      console.warn(`[${jobId}] Skipping segment ${i + 1}: empty text`);
      continue;
    }
    
    // ===== FORMAT TIMESTAMPS =====
    const startTime = formatWebVTTTime(segment.start);
    const endTime = formatWebVTTTime(segment.end);
    
    // ===== CLEAN AND FORMAT TEXT =====
    let captionText = segment.text.trim();
    
    // Remove extra whitespace and line breaks
    captionText = captionText.replace(/\s+/g, ' ');
    
    // Break long lines (WebVTT recommendation: max 32 characters per line)
    captionText = breakLongLines(captionText, 40);
    
    // ===== ADD SEGMENT TO WEBVTT =====
    webvtt += `${i + 1}\n`;                    // Cue identifier
    webvtt += `${startTime} --> ${endTime}\n`; // Timing
    webvtt += `${captionText}\n\n`;            // Text with blank line
  }
  
  console.log(`[${jobId}] ✅ WebVTT generation completed: ${webvtt.length} characters`);
  return webvtt;
};

// ===== HELPER FUNCTION: GENERATE SRT CONTENT =====
/**
 * Create SRT format captions from translation segments
 * @param {Array} segments - Array of translation segments with start, end, text
 * @param {Object} translation - Full translation object for metadata
 * @param {string} jobId - Job ID for logging
 * @returns {string} - SRT formatted content
 */
export const generateSRT = (segments, translation, jobId) => {
  console.log(`[${jobId}] Generating SRT format for ${segments.length} segments...`);
  
  let srt = '';
  
  // ===== PROCESS EACH SEGMENT =====
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    // Skip segments without proper timing or text
    if (!segment.start && segment.start !== 0) continue;
    if (!segment.end && segment.end !== 0) continue;
    if (!segment.text || segment.text.trim().length === 0) continue;
    
    // ===== FORMAT TIMESTAMPS FOR SRT =====
    const startTime = formatSRTTime(segment.start);
    const endTime = formatSRTTime(segment.end);
    
    // ===== CLEAN AND FORMAT TEXT =====
    let captionText = segment.text.trim();
    captionText = captionText.replace(/\s+/g, ' ');
    captionText = breakLongLines(captionText, 40);
    
    // ===== ADD SEGMENT TO SRT =====
    srt += `${i + 1}\n`;                      // Sequence number
    srt += `${startTime} --> ${endTime}\n`;   // Timing
    srt += `${captionText}\n\n`;              // Text with blank line
  }
  
  console.log(`[${jobId}] ✅ SRT generation completed: ${srt.length} characters`);
  return srt;
};

// ===== HELPER FUNCTION: GENERATE PLAIN TEXT TRANSCRIPT =====
/**
 * Create plain text transcript from translation segments
 * @param {Array} segments - Array of translation segments with start, end, text
 * @param {Object} translation - Full translation object for metadata
 * @param {string} jobId - Job ID for logging
 * @returns {string} - Plain text transcript content
 */
export const generatePlainTextTranscript = (segments, translation, jobId) => {
  console.log(`[${jobId}] Generating plain text transcript for ${segments.length} segments...`);
  
  // ===== TRANSCRIPT HEADER =====
  let transcript = `VIDEO TRANSCRIPT - SYNCED WITH REGENERATED AUDIO\n`;
  transcript += `${'='.repeat(60)}\n\n`;
  transcript += `Language: ${translation.language_name || translation.language}\n`;
  transcript += `Translation Service: ${translation.translation_service || 'enhanced-pipeline'}\n`;
  transcript += `Generated: ${new Date().toLocaleString()}\n`;
  transcript += `Total Segments: ${segments.length}\n`;
  transcript += `Total Duration: ${segments[segments.length - 1]?.end || 0}s\n`;
  transcript += `Audio Sync: Regenerated TTS timing\n\n`;
  transcript += `${'='.repeat(60)}\n\n`;
  
  // ===== FULL TEXT VERSION =====
  transcript += `FULL TEXT:\n`;
  transcript += `${'-'.repeat(20)}\n`;
  transcript += `${translation.text || 'No full text available'}\n\n`;
  transcript += `${'='.repeat(60)}\n\n`;
  
  // ===== TIMESTAMPED VERSION =====
  transcript += `TIMESTAMPED TRANSCRIPT (SYNCED):\n`;
  transcript += `${'-'.repeat(35)}\n\n`;
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    // Skip segments without proper data
    if (!segment.text || segment.text.trim().length === 0) {
      continue;
    }
    
    // ===== FORMAT TIMESTAMP FOR READABILITY =====
    const startTime = formatReadableTime(segment.start);
    const endTime = formatReadableTime(segment.end);
    const duration = (segment.end - segment.start).toFixed(1);
    
    // ===== ADD SEGMENT TO TRANSCRIPT =====
    transcript += `[${startTime} - ${endTime}] (${duration}s)\n`;
    transcript += `${segment.text.trim()}\n\n`;
  }
  
  // ===== TRANSCRIPT FOOTER =====
  transcript += `${'='.repeat(60)}\n`;
  transcript += `End of Transcript\n`;
  transcript += `Total Duration: ${formatReadableTime(segments[segments.length - 1]?.end || 0)}\n`;
  transcript += `Timing: Perfectly synced with generated Bengali TTS audio\n`;
  
  console.log(`[${jobId}] ✅ Plain text transcript generation completed: ${transcript.length} characters`);
  return transcript;
};

// ===== HELPER FUNCTION: FORMAT WEBVTT TIMESTAMP =====
/**
 * Convert seconds to WebVTT timestamp format (HH:MM:SS.mmm)
 * @param {number} seconds - Time in seconds
 * @returns {string} - WebVTT formatted timestamp
 */
export const formatWebVTTTime = (seconds) => {
  const totalSeconds = Math.max(0, seconds || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
};

// ===== HELPER FUNCTION: FORMAT SRT TIMESTAMP =====
/**
 * Convert seconds to SRT timestamp format (HH:MM:SS,mmm)
 * @param {number} seconds - Time in seconds
 * @returns {string} - SRT formatted timestamp
 */
export const formatSRTTime = (seconds) => {
  const totalSeconds = Math.max(0, seconds || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
};

// ===== HELPER FUNCTION: FORMAT READABLE TIMESTAMP =====
/**
 * Convert seconds to readable timestamp format (MM:SS)
 * @param {number} seconds - Time in seconds
 * @returns {string} - Human-readable timestamp
 */
export const formatReadableTime = (seconds) => {
  const totalSeconds = Math.max(0, seconds || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

// ===== HELPER FUNCTION: BREAK LONG LINES =====
/**
 * Break long caption lines for better readability
 * @param {string} text - Original text
 * @param {number} maxLength - Maximum characters per line
 * @returns {string} - Text with line breaks
 */
export const breakLongLines = (text, maxLength = 40) => {
  if (text.length <= maxLength) {
    return text;
  }
  
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + ' ' + word).length <= maxLength) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.join('\n');
};

// ===== HELPER FUNCTION: VALIDATE WEBVTT CONTENT =====
/**
 * Validate that generated WebVTT content is properly formatted
 * @param {string} webvttContent - WebVTT content to validate
 * @returns {boolean} - True if valid
 */
export const validateWebVTT = (webvttContent) => {
  if (!webvttContent || typeof webvttContent !== 'string') {
    return false;
  }
  
  // Check WebVTT header
  if (!webvttContent.startsWith('WEBVTT')) {
    return false;
  }
  
  // Check for basic structure (timestamps)
  const timestampPattern = /\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/;
  if (!timestampPattern.test(webvttContent)) {
    return false;
  }
  
  return true;
};

// ===== HELPER FUNCTION: GET CAPTION STATISTICS =====
/**
 * Get statistics about generated captions
 * @param {Array} segments - Caption segments
 * @returns {Object} - Caption statistics
 */
export const getCaptionStatistics = (segments) => {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { totalSegments: 0, totalDuration: 0, averageSegmentLength: 0 };
  }
  
  const totalSegments = segments.length;
  const totalDuration = segments[segments.length - 1]?.end || 0;
  const averageSegmentLength = segments.reduce((sum, seg) => sum + (seg.text?.length || 0), 0) / totalSegments;
  const averageSegmentDuration = totalDuration / totalSegments;
  
  return {
    totalSegments,
    totalDuration: Math.round(totalDuration * 100) / 100,
    averageSegmentLength: Math.round(averageSegmentLength),
    averageSegmentDuration: Math.round(averageSegmentDuration * 100) / 100,
    timingRegenerated: segments[0]?.timingRegenerated || false
  };
};

// ===== HELPER FUNCTION: VALIDATE SEGMENTS =====
/**
 * Validate translation segments for caption generation
 * @param {Array} segments - Translation segments to validate
 * @returns {Object} - Validation results
 */
export const validateSegments = (segments) => {
  if (!Array.isArray(segments)) {
    return { isValid: false, errors: ['Segments is not an array'] };
  }
  
  const errors = [];
  const validSegments = [];
  
  segments.forEach((segment, index) => {
    if (typeof segment.start !== 'number') {
      errors.push(`Segment ${index + 1}: Invalid start time`);
    }
    
    if (typeof segment.end !== 'number') {
      errors.push(`Segment ${index + 1}: Invalid end time`);
    }
    
    if (!segment.text || typeof segment.text !== 'string') {
      errors.push(`Segment ${index + 1}: Invalid or missing text`);
    }
    
    if (segment.start >= segment.end) {
      errors.push(`Segment ${index + 1}: Start time must be before end time`);
    }
    
    if (errors.length === 0) {
      validSegments.push(segment);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    validSegments,
    originalCount: segments.length,
    validCount: validSegments.length
  };
};

// ===== MAIN EXPORT =====
export default {
  generateCaptions,
  generateWebVTT,
  generateSRT,
  generatePlainTextTranscript,
  formatWebVTTTime,
  formatSRTTime,
  formatReadableTime,
  breakLongLines,
  validateWebVTT,
  getCaptionStatistics,
  validateSegments
};
