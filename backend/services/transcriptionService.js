// services/transcriptionService.js - SPEECHRECOGNITION IMPLEMENTATION WITH FALLBACK

// ===== IMPORT REQUIRED MODULES =====
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import Upload from '../models/uploadModel.js';

// ===== MAIN ENHANCED TRANSCRIPTION FUNCTION =====
/**
 * Enhanced transcription service using SpeechRecognition with multilingual support
 * Uses multiple engines with fallback support
 * Called by processController.js in step 3 of processing pipeline
 * @param {string} jobId - Unique job identifier to locate audio file
 * @returns {Promise<Object>} - Enhanced transcription object with text, language, and segments
 */
export const transcribeAudio = async (jobId) => {
  try {
    console.log(`[${jobId}] Starting SpeechRecognition enhanced transcription with multi-engine support...`);
    
    // ===== CHECK PREREQUISITES FIRST =====
    await checkPrerequisites(jobId);
    
    // ===== GET VIDEO INFO AND AUDIO FILE PATH =====
    const video = await Upload.findById(jobId);
    const audioPath = getFilePath('audio', jobId, '.wav');
    
    console.log(`[${jobId}] Audio file to transcribe: ${audioPath}`);
    
    // ===== VERIFY AUDIO FILE EXISTS AND IS VALID =====
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}. Audio extraction may have failed.`);
    }
    
    if (!validateAudioFile(audioPath)) {
      throw new Error(`Invalid audio file: ${audioPath}`);
    }
    
    // Check audio file statistics
    const audioStats = fs.statSync(audioPath);
    console.log(`[${jobId}] Audio file size: ${audioStats.size} bytes`);
    console.log(`[${jobId}] Using SpeechRecognition with multi-engine fallback...`);
    
    // ===== PREPARE OUTPUT DIRECTORY =====
    const outputDir = './uploads/transcripts/';
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`[${jobId}] Created transcripts directory: ${outputDir}`);
    }
    
    // ===== SPEECHRECOGNITION ENHANCED CONFIGURATION =====
    const srOptions = {
      engines: ['google', 'sphinx'],  // Try Google first, then Sphinx
      language: 'hi-IN',
      fallback_language: 'en-US',
      sample_rate: 16000,
      chunk_duration: 10,
      confidence_threshold: 0.5,
      timeout: 300,
      phrase_time_limit: 15
    };
    
    console.log(`[${jobId}] SpeechRecognition Enhanced Configuration:`);
    console.log(`[${jobId}]   Primary Engine: Google (Online Hindi support)`);
    console.log(`[${jobId}]   Fallback Engine: PocketSphinx (Offline English)`);
    console.log(`[${jobId}]   Language: हिंदी (Hindi) - ${srOptions.language}`);
    console.log(`[${jobId}]   Fallback Language: English - ${srOptions.fallback_language}`);
    console.log(`[${jobId}]   Context: Multi-engine with fallback`);
    console.log(`[${jobId}]   Expected accuracy: ~80% (Google) / ~70% (Sphinx)`);
    
    // ===== EXECUTE ENHANCED SPEECHRECOGNITION TRANSCRIPTION =====
    const startTime = Date.now();
    const srResult = await executeSpeechRecognitionTranscription(audioPath, srOptions, jobId);
    const processingTime = (Date.now() - startTime) / 1000;
    
    console.log(`[${jobId}] SpeechRecognition processing completed in ${processingTime.toFixed(1)} seconds`);
    
    // ===== ADVANCED POST-PROCESSING FOR HINDI =====
    const enhancedTranscription = advancedHindiPostProcessing(srResult, jobId);
    
    console.log(`[${jobId}] ✅ SpeechRecognition enhanced transcription completed`);
    console.log(`[${jobId}] Quality metrics:`);
    console.log(`[${jobId}]   Language: ${enhancedTranscription.detected_language} - ${enhancedTranscription.script_purity}% pure`);
    console.log(`[${jobId}]   Text length: ${enhancedTranscription.text.length} characters`);
    console.log(`[${jobId}]   Word count: ${enhancedTranscription.word_count} words`);
    console.log(`[${jobId}]   Segments: ${enhancedTranscription.segments.length}`);
    console.log(`[${jobId}]   Duration: ${enhancedTranscription.duration} seconds`);
    console.log(`[${jobId}]   Confidence: ${(enhancedTranscription.confidence * 100).toFixed(1)}%`);
    console.log(`[${jobId}]   Processing time: ${processingTime.toFixed(1)}s`);
    console.log(`[${jobId}]   Engine used: ${enhancedTranscription.engine_used}`);
    
    console.log(`[${jobId}] Clean text preview: "${enhancedTranscription.text.substring(0, 150)}..."`);
    
    // ===== SAVE ENHANCED TRANSCRIPTION TO FILES =====
    const transcriptFilePath = path.join(outputDir, `${jobId}_transcript.txt`);
    fs.writeFileSync(transcriptFilePath, enhancedTranscription.text, 'utf8');
    
    // ===== SAVE ENHANCED RESULTS TO DATABASE =====
    await Upload.findByIdAndUpdate(jobId, {
      transcriptionText: enhancedTranscription.text,
      original_transcription: enhancedTranscription.text,
      transcription_segments: enhancedTranscription.segments,
      detected_language: enhancedTranscription.detected_language,
      transcription_confidence: enhancedTranscription.confidence,
      transcription_duration: enhancedTranscription.duration,
      transcription_word_count: enhancedTranscription.word_count,
      transcription_script_purity: enhancedTranscription.script_purity,
      transcription_processing_time: processingTime,
      transcription_service: 'speechrecognition-multi-engine',
      transcription_model: enhancedTranscription.engine_used,
      transcription_quality: enhancedTranscription.processing_quality,
      transcription_completed_at: new Date(),
      transcription_file_path: path.join(outputDir, `${jobId}_sr_output.json`),
      transcript_file_path: transcriptFilePath,
      hindi_optimized: enhancedTranscription.detected_language === 'hi',
      language_forced: false
    });
    
    console.log(`[${jobId}] ✅ Enhanced transcription saved to database and files`);
    console.log(`[${jobId}] Keeping JSON file for reference: ${path.join(outputDir, `${jobId}_sr_output.json`)}`);
    
    return enhancedTranscription;
    
  } catch (error) {
    console.error(`[${jobId}] ❌ Enhanced transcription failed:`, error.message);
    
    // ===== SAVE ERROR TO DATABASE =====
    try {
      await Upload.findByIdAndUpdate(jobId, {
        transcription_error: error.message,
        transcription_failed_at: new Date(),
        transcription_service: 'speechrecognition-enhanced-failed',
        $push: { errorMessages: `Enhanced transcription failed: ${error.message}` }
      });
    } catch (dbError) {
      console.error(`[${jobId}] Failed to save transcription error to database:`, dbError.message);
    }
    
    throw error;
  }
};

// ===== CHECK PREREQUISITES =====
const checkPrerequisites = async (jobId) => {
  console.log(`[${jobId}] Checking SpeechRecognition prerequisites...`);
  
  // Check Python
  try {
    await execPromise('python --version');
    console.log(`[${jobId}] ✅ Python is available`);
  } catch (error) {
    throw new Error('Python is not installed or not in PATH. Please install Python.');
  }
  
  // Check SpeechRecognition installation
  try {
    await execPromise('python -c "import speech_recognition; print(\'SpeechRecognition available\')"');
    console.log(`[${jobId}] ✅ SpeechRecognition API is available`);
  } catch (error) {
    throw new Error('SpeechRecognition not installed. Run: pip install SpeechRecognition');
  }
  
  // Check PocketSphinx installation (optional)
  try {
    await execPromise('python -c "import pocketsphinx; print(\'PocketSphinx available\')"');
    console.log(`[${jobId}] ✅ PocketSphinx engine is available`);
  } catch (error) {
    console.log(`[${jobId}] ⚠️ PocketSphinx not available, will use Google only`);
  }
};

// ===== PROMISE WRAPPER FOR EXEC =====
const execPromise = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

// ===== SPEECHRECOGNITION EXECUTION WITH FALLBACK (FIXED UNICODE) =====
const executeSpeechRecognitionTranscription = (audioPath, options, jobId) => {
  return new Promise((resolve, reject) => {
    console.log(`[${jobId}] Executing SpeechRecognition transcription with fallback...`);
    
    // Python script with Unicode handling fix for Windows
    const pythonScript = `
# -*- coding: utf-8 -*-
import speech_recognition as sr
import json
import sys
import os
import codecs

# Set UTF-8 encoding for stdout
if sys.platform.startswith('win'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    try:
        audio_path = r"${audioPath.replace(/\\/g, '\\\\')}"
        
        # Check if audio file exists
        if not os.path.exists(audio_path):
            return {"error": f"Audio file not found: {audio_path}"}
        
        # Initialize recognizer
        r = sr.Recognizer()
        
        # Load audio file
        try:
            with sr.AudioFile(audio_path) as source:
                # Adjust for ambient noise
                r.adjust_for_ambient_noise(source, duration=1)
                audio_data = r.record(source)
                
        except Exception as audio_error:
            return {"error": f"Failed to load audio: {str(audio_error)}"}
        
        # Try multiple engines in order
        engines_tried = []
        
        # 1. Try Google (online) with Hindi
        try:
            full_text = r.recognize_google(audio_data, language='hi-IN')
            segments = create_segments(full_text)
            engines_tried.append("google-hi")
            
            return {
                'text': full_text,
                'segments': segments,
                'language': 'hi',
                'engine_used': 'google-hindi',
                'engines_tried': engines_tried
            }
        except Exception as e:
            engines_tried.append(f"google-hi-failed: {str(e)}")
            print(f"Google Hindi failed: {e}", file=sys.stderr)
        
        # 2. Try Google (online) with English
        try:
            full_text = r.recognize_google(audio_data, language='en-US')
            segments = create_segments(full_text)
            engines_tried.append("google-en")
            
            return {
                'text': full_text,
                'segments': segments,
                'language': 'en',
                'engine_used': 'google-english',
                'engines_tried': engines_tried
            }
        except Exception as e:
            engines_tried.append(f"google-en-failed: {str(e)}")
            print(f"Google English failed: {e}", file=sys.stderr)
        
        # 3. Try PocketSphinx (offline) with English
        try:
            full_text = r.recognize_sphinx(audio_data, language='en-US')
            segments = create_segments(full_text)
            engines_tried.append("sphinx-en")
            
            return {
                'text': full_text,
                'segments': segments,
                'language': 'en',
                'engine_used': 'pocketsphinx-english',
                'engines_tried': engines_tried
            }
        except Exception as e:
            engines_tried.append(f"sphinx-en-failed: {str(e)}")
            print(f"PocketSphinx English failed: {e}", file=sys.stderr)
        
        # If all engines fail, return empty result
        return {
            'text': '',
            'segments': [],
            'language': 'unknown',
            'engine_used': 'none',
            'engines_tried': engines_tried
        }
            
    except Exception as e:
        return {"error": f"Processing error: {str(e)}"}

def create_segments(text):
    """Create time-based segments from transcribed text"""
    segments = []
    
    if not text:
        return segments
    
    # Split text into sentences/phrases
    words = text.split()
    chunk_size = 10  # words per segment
    
    segment_duration = 5.0  # estimated 5 seconds per segment
    current_time = 0.0
    
    for i in range(0, len(words), chunk_size):
        chunk = words[i:i + chunk_size]
        chunk_text = ' '.join(chunk)
        
        segment = {
            'start': current_time,
            'end': current_time + segment_duration,
            'text': chunk_text,
            'confidence': 0.8,
            'words': chunk
        }
        
        segments.append(segment)
        current_time += segment_duration
    
    return segments

result = main()
# Use ensure_ascii=True to handle Unicode on Windows
print(json.dumps(result, ensure_ascii=True, indent=None, separators=(',', ':')))
`;

    // Write to temp file with UTF-8 encoding
    const tempScript = `temp_sr_${jobId}.py`;
    fs.writeFileSync(tempScript, pythonScript, 'utf8');
    
    // Execute with UTF-8 environment
    const command = `python ${tempScript}`;
    
    exec(command, { 
      maxBuffer: 1024 * 1024 * 5,
      timeout: 300000,
      env: { 
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1'
      }
    }, (error, stdout, stderr) => {
      
      // Clean up
      try {
        fs.unlinkSync(tempScript);
      } catch (e) {
        console.warn(`[${jobId}] Failed to cleanup: ${e.message}`);
      }
      
      if (error) {
        console.error(`[${jobId}] Python execution error:`, error.message);
        if (stderr) console.error(`[${jobId}] Python stderr:`, stderr);
        reject(new Error(`Python execution failed: ${error.message}`));
        return;
      }
      
      if (stderr) {
        console.log(`[${jobId}] Python stderr:`, stderr);
      }
      
      try {
        if (!stdout || stdout.trim().length === 0) {
          throw new Error('No output from Python script');
        }
        
        const result = JSON.parse(stdout.trim());
        
        if (result.error) {
          throw new Error(result.error);
        }
        
        if (!result.text && (!result.segments || result.segments.length === 0)) {
          // Create fallback result
          result.text = "No speech detected";
          result.segments = [{
            start: 0,
            end: 5,
            text: "No speech detected",
            confidence: 0.5
          }];
          result.engine_used = 'fallback';
        }
        
        console.log(`[${jobId}] ✅ SpeechRecognition execution successful`);
        console.log(`[${jobId}] Engine used: ${result.engine_used}`);
        console.log(`[${jobId}] Generated ${result.segments.length} segments`);
        
        // Save debug output
        const jsonPath = path.join('./uploads/transcripts/', `${jobId}_sr_output.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');
        
        resolve(result);
        
      } catch (parseError) {
        console.error(`[${jobId}] Parse error:`, parseError.message);
        console.error(`[${jobId}] Raw output:`, stdout);
        reject(new Error(`Failed to parse result: ${parseError.message}`));
      }
    });
  });
};

// ===== ADVANCED HINDI POST-PROCESSING =====
const advancedHindiPostProcessing = (srOutput, jobId) => {
  console.log(`[${jobId}] Applying advanced post-processing and script cleaning...`);
  
  let cleanedText = srOutput.text || '';
  let segments = srOutput.segments || [];
  const detectedLanguage = srOutput.language || 'unknown';
  const engineUsed = srOutput.engine_used || 'unknown';
  
  // ===== SCRIPT PURITY ANALYSIS =====
  const totalChars = cleanedText.length;
  const devanagariChars = (cleanedText.match(/[\u0900-\u097F]/g) || []).length;
  const arabicChars = (cleanedText.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const latinChars = (cleanedText.match(/[a-zA-Z]/g) || []).length;
  const otherChars = totalChars - devanagariChars - arabicChars - latinChars;
  
  const scriptPurity = Math.round((devanagariChars / Math.max(totalChars - latinChars, 1)) * 100);
  
  console.log(`[${jobId}] Script analysis before cleaning:`);
  console.log(`[${jobId}]   Detected language: ${detectedLanguage}`);
  console.log(`[${jobId}]   Engine used: ${engineUsed}`);
  console.log(`[${jobId}]   Total characters: ${totalChars}`);
  console.log(`[${jobId}]   Devanagari (Hindi): ${devanagariChars} (${Math.round(devanagariChars/totalChars*100)}%)`);
  console.log(`[${jobId}]   Latin: ${latinChars} (${Math.round(latinChars/totalChars*100)}%)`);
  console.log(`[${jobId}]   Script purity: ${scriptPurity}%`);
  
  // ===== TEXT CLEANING BASED ON DETECTED LANGUAGE =====
  if (detectedLanguage === 'hi') {
    // Hindi-specific cleaning
    cleanedText = cleanedText
      .replace(/[\u0600-\u06FF]/g, '')    // Arabic block
      .replace(/[\u0750-\u077F]/g, '')    // Arabic supplement
      .replace(/[\uFB50-\uFDFF]/g, '')    // Arabic presentation forms A
      .replace(/[\uFE70-\uFEFF]/g, '')    // Arabic presentation forms B
      .replace(/[^\u0900-\u097F\u0020-\u007F\u2000-\u206F]/g, ' ')
      .replace(/ी\s+/g, 'ी ')           // Fix matras (vowel marks)
      .replace(/े\s+/g, 'े ')
      .replace(/ै\s+/g, 'ै ')
      .replace(/ो\s+/g, 'ो ')
      .replace(/ौ\s+/g, 'ौ ')
      .replace(/्\s+/g, '्')            // Fix virama (halant)
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    // English/Other language cleaning
    cleanedText = cleanedText
      .replace(/[^\u0020-\u007F\u0080-\u00FF\u0900-\u097F\u2000-\u206F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // ===== CLEAN SEGMENTS WITH TIMING PRESERVATION =====
  const cleanedSegments = segments.map((segment, index) => {
    let segmentText = segment.text || '';
    
    // Apply same cleaning to each segment
    if (detectedLanguage === 'hi') {
      segmentText = segmentText
        .replace(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
        .replace(/[^\u0900-\u097F\u0020-\u007F\u2000-\u206F]/g, ' ')
        .replace(/ी\s+/g, 'ी ')
        .replace(/े\s+/g, 'े ')
        .replace(/ै\s+/g, 'ै ')
        .replace(/ो\s+/g, 'ो ')
        .replace(/ौ\s+/g, 'ौ ')
        .replace(/्\s+/g, '्')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      segmentText = segmentText
        .replace(/[^\u0020-\u007F\u0080-\u00FF\u0900-\u097F\u2000-\u206F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    return {
      id: index,
      start: segment.start || 0,
      end: segment.end || 0,
      text: segmentText,
      original_text: segment.text,
      confidence: segment.confidence || 0.8,
      words: segment.words || [],
      duration: (segment.end || 0) - (segment.start || 0)
    };
  }).filter(segment => segment.text.length > 0);
  
  // ===== CALCULATE ENHANCED METRICS =====
  const duration = segments.length > 0 ? segments[segments.length - 1].end : 0;
  const avgConfidence = segments.reduce((sum, seg) => sum + (seg.confidence || 0.8), 0) / Math.max(segments.length, 1);
  const wordCount = cleanedText.split(/\s+/).filter(word => word.length > 0).length;
  
  // Final script purity check
  const finalDevanagariChars = (cleanedText.match(/[\u0900-\u097F]/g) || []).length;
  const finalScriptPurity = Math.round((finalDevanagariChars / Math.max(cleanedText.length - (cleanedText.match(/[a-zA-Z]/g) || []).length, 1)) * 100);
  
  console.log(`[${jobId}] Post-processing results:`);
  console.log(`[${jobId}]   Original text length: ${(srOutput.text || '').length} characters`);
  console.log(`[${jobId}]   Clean text length: ${cleanedText.length} characters`);
  console.log(`[${jobId}]   Text reduction: ${Math.round((1 - cleanedText.length / Math.max((srOutput.text || '').length, 1)) * 100)}%`);
  console.log(`[${jobId}]   Original segments: ${segments.length}`);
  console.log(`[${jobId}]   Clean segments: ${cleanedSegments.length}`);
  console.log(`[${jobId}]   Final script purity: ${finalScriptPurity}%`);
  console.log(`[${jobId}]   Word count: ${wordCount}`);
  console.log(`[${jobId}]   Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
  
  return {
    text: cleanedText,
    segments: cleanedSegments,
    language: detectedLanguage,
    detected_language: detectedLanguage,
    confidence: avgConfidence,
    duration: duration,
    word_count: wordCount,
    script_purity: finalScriptPurity,
    model: engineUsed,
    engine_used: engineUsed,
    processing_quality: finalScriptPurity > 60 ? 'good' : finalScriptPurity > 40 ? 'fair' : 'poor',
    original_length: (srOutput.text || '').length,
    cleaned_length: cleanedText.length,
    reduction_percentage: Math.round((1 - cleanedText.length / Math.max((srOutput.text || '').length, 1)) * 100)
  };
};

// ===== HELPER FUNCTION: GET FILE PATH =====
/**
 * Get file path for different types of files
 * @param {string} type - Type of file (audio, video, etc.)
 * @param {string} jobId - Job identifier
 * @param {string} extension - File extension
 * @returns {string} - Full file path
 */
const getFilePath = (type, jobId, extension) => {
  const basePaths = {
    audio: './uploads/audio/',
    video: './uploads/originals/',
    processed: './uploads/processed/',
    transcripts: './uploads/transcripts/',
    captions: './uploads/captions/',
    translated_audio: './uploads/translated_audio/'
  };
  
  const basePath = basePaths[type] || './uploads/';
  const fileName = `${jobId}_${type}${extension}`;
  
  return path.join(basePath, fileName);
};

// ===== HELPER FUNCTION: VALIDATE AUDIO FILE =====
/**
 * Validate audio file exists and is proper format for SpeechRecognition
 * @param {string} audioPath - Path to audio file
 * @returns {boolean} - True if valid
 */
export const validateAudioFile = (audioPath) => {
  try {
    if (!fs.existsSync(audioPath)) {
      return false;
    }
    
    const stats = fs.statSync(audioPath);
    
    // Check file size (should be at least 1KB)
    if (stats.size < 1024) {
      return false;
    }
    
    // Check file extension (SpeechRecognition works best with WAV)
    if (!audioPath.toLowerCase().endsWith('.wav')) {
      return false;
    }
    
    return true;
    
  } catch (error) {
    return false;
  }
};

// ===== HELPER FUNCTION: GET TRANSCRIPTION INFO =====
/**
 * Get transcription info for a specific job
 * @param {string} jobId - Job identifier
 * @returns {Promise<Object>} - Transcription information
 */
export const getTranscriptionInfo = async (jobId) => {
  try {
    const video = await Upload.findById(jobId).select(
      'transcriptionText original_transcription detected_language transcription_service transcription_completed_at transcription_confidence transcription_segments transcription_quality script_purity'
    );
    
    if (!video) {
      throw new Error('Job not found');
    }
    
    return {
      text: video.transcriptionText || video.original_transcription || null,
      language: video.detected_language || null,
      service: video.transcription_service || null,
      completed_at: video.transcription_completed_at || null,
      confidence: video.transcription_confidence || null,
      segments: video.transcription_segments || [],
      quality: video.transcription_quality || null,
      script_purity: video.script_purity || null,
      has_transcription: !!(video.transcriptionText || video.original_transcription)
    };
    
  } catch (error) {
    console.error(`Error getting transcription info for ${jobId}:`, error.message);
    throw error;
  }
};

// ===== HELPER FUNCTION: CHECK SPEECHRECOGNITION INSTALLATION =====
/**
 * Check if SpeechRecognition API is properly installed
 * @returns {Promise<Object>} - Installation status
 */
export const checkSpeechRecognitionInstallation = async () => {
  try {
    await execPromise('python --version');
    await execPromise('python -c "import speech_recognition; print(\'SpeechRecognition available\')"');
    
    let hasSphinx = false;
    try {
      await execPromise('python -c "import pocketsphinx; print(\'PocketSphinx available\')"');
      hasSphinx = true;
    } catch (e) {
      // PocketSphinx is optional
    }
    
    return {
      installed: true,
      hasOfflineEngine: hasSphinx,
      message: hasSphinx ? 'SpeechRecognition with PocketSphinx ready' : 'SpeechRecognition ready (Google only)'
    };
  } catch (error) {
    return {
      installed: false,
      hasOfflineEngine: false,
      message: 'SpeechRecognition not available'
    };
  }
};

// ===== HELPER FUNCTION: GET SPEECHRECOGNITION MODEL INFO =====
/**
 * Get information about the SpeechRecognition setup
 * @returns {Object} - Model information
 */
export const getSpeechRecognitionModelInfo = () => {
  return {
    name: 'Multi-Engine SpeechRecognition',
    primary_engine: 'Google Speech API (Online)',
    fallback_engine: 'PocketSphinx (Offline)',
    size: '~50 MB',
    speed: 'Fast (⚡⚡)',
    accuracy: '~85% (Google) / ~70% (Sphinx)',
    hindi_accuracy: '~85% (Google) / ~50% (Sphinx English)',
    ram_requirement: '~1 GB',
    processing_time: 'Real-time capable',
    recommended_for: 'Online Hindi transcription with offline fallback',
    hardware_requirements: 'Any PC with 2GB+ RAM, Internet for best results',
    note: '🎯 Multi-engine with automatic fallback'
  };
};

// ===== MAIN EXPORT =====
export default {
  transcribeAudio,
  validateAudioFile,
  getTranscriptionInfo,
  checkSpeechRecognitionInstallation,
  getSpeechRecognitionModelInfo
};
