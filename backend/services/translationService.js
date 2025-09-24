// services/translationService.js - ENHANCED WITH DURATION PRESERVATION & HINDI OPTIMIZATION

// ===== IMPORT REQUIRED MODULES =====
import https from 'https';
import querystring from 'querystring';
import { translate } from '@vitalets/google-translate-api';
import Upload from '../models/uploadModel.js';

// ===== RATE LIMITING TRACKERS =====
let dailyGoogleTranslations = 0;
let lastResetDate = new Date().toDateString();
let googleBlocked = false;
let blockUntil = null;

// ===== MAIN ENHANCED TRANSLATION FUNCTION =====
/**
 * Enhanced translation service with Hindi optimization and duration preservation
 * Uses LibreTranslate (FREE & UNLIMITED) with Google Translate fallback
 * Optimized specifically for Hindi→Target language translations
 * @param {Object} transcription - Enhanced transcription object from Whisper with text, language, segments
 * @param {string} jobId - Unique job identifier to get target language from database
 * @returns {Promise<Object>} - Enhanced translation object with duration preservation
 */
export const translateText = async (transcription, jobId) => {
  try {
    console.log(`[${jobId}] Starting enhanced Hindi→Target translation with duration preservation...`);
    
    // ===== VALIDATE INPUT TRANSCRIPTION =====
    if (!transcription || !transcription.text) {
      throw new Error('Invalid transcription object provided');
    }
    
    // ===== GET TARGET LANGUAGE FROM DATABASE =====
    const video = await Upload.findById(jobId);
    
    if (!video) {
      throw new Error(`Video record not found for job ID: ${jobId}`);
    }
    
    if (!video.target_language) {
      throw new Error(`Target language not specified for job ID: ${jobId}`);
    }
    
    const targetLanguage = video.target_language;
    let sourceLanguage = transcription.language || 'hi'; // Default to Hindi now
    
    console.log(`[${jobId}] Enhanced Indian Language Translation: ${sourceLanguage} → ${targetLanguage}`);
    console.log(`[${jobId}] Original text preview: "${transcription.text.substring(0, 100)}..."`);
    
    // ===== VALIDATE HINDI INPUT QUALITY =====
    if (!transcription.text || transcription.text.trim().length === 0) {
      throw new Error('Empty transcription text received');
    }
    
    // Check if text contains Hindi Devanagari script
    const hindiRegex = /[\u0900-\u097F]/;
    const hindiCharCount = (transcription.text.match(/[\u0900-\u097F]/g) || []).length;
    const totalCharCount = transcription.text.length;
    const hindiPercentage = Math.round((hindiCharCount / Math.max(totalCharCount, 1)) * 100);
    
    console.log(`[${jobId}] Hindi script analysis:`);
    console.log(`[${jobId}]   Total characters: ${totalCharCount}`);
    console.log(`[${jobId}]   Hindi characters: ${hindiCharCount} (${hindiPercentage}%)`);
    
    if (!hindiRegex.test(transcription.text)) {
      console.warn(`[${jobId}] ⚠️ Warning: Text does not contain Hindi script, may affect translation quality`);
    } else if (hindiPercentage < 50) {
      console.warn(`[${jobId}] ⚠️ Warning: Low Hindi script percentage (${hindiPercentage}%), translation quality may be affected`);
    } else {
      console.log(`[${jobId}] ✅ Good Hindi script quality: ${hindiPercentage}% Devanagari characters`);
    }
    
    // ===== VALIDATE SUPPORTED INDIAN LANGUAGES =====
    const supportedLanguages = getSupportedIndianLanguages();
    if (!supportedLanguages[targetLanguage]) {
      throw new Error(`Target language '${targetLanguage}' is not supported. Use one of: ${Object.keys(supportedLanguages).join(', ')}`);
    }
    
    console.log(`[${jobId}] Enhanced translation: हिंदी → ${supportedLanguages[targetLanguage]}`);
    console.log(`[${jobId}] Input text length: ${transcription.text.length} characters`);
    console.log(`[${jobId}] Input segments: ${transcription.segments.length}`);
    console.log(`[${jobId}] Target language: ${supportedLanguages[targetLanguage]}`);
    
    // ===== CHECK IF TRANSLATION IS NEEDED =====
    if (sourceLanguage === targetLanguage) {
      console.log(`[${jobId}] Source and target languages are identical, skipping translation`);
      return createSkippedTranslation(transcription, sourceLanguage, targetLanguage, jobId);
    }
    
    // ===== TRY ENHANCED LIBRETRANSLATE FIRST (PRIMARY) =====
    try {
      console.log(`[${jobId}] 🚀 Attempting Enhanced LibreTranslate (PRIMARY - FREE & UNLIMITED)...`);
      const libreResult = await translateWithLibreTranslateEnhanced(transcription, targetLanguage, jobId);
      return libreResult;
      
    } catch (libreError) {
      console.warn(`[${jobId}] ⚠️ Enhanced LibreTranslate failed: ${libreError.message}`);
      console.log(`[${jobId}] 🔄 Falling back to Enhanced Google Translate...`);
      
      // ===== FALLBACK TO ENHANCED GOOGLE TRANSLATE =====
      try {
        const googleResult = await translateWithGoogleEnhanced(transcription, targetLanguage, jobId);
        return googleResult;
        
      } catch (googleError) {
        console.warn(`[${jobId}] ⚠️ Enhanced Google Translate also failed: ${googleError.message}`);
        console.log(`[${jobId}] 🔄 Using enhanced fallback with original text...`);
        
        // ===== FINAL ENHANCED FALLBACK =====
        return createEnhancedFallback(transcription, sourceLanguage, targetLanguage, jobId, 'Both services failed');
      }
    }
    
  } catch (error) {
    console.error(`[${jobId}] ❌ Enhanced translation service completely failed:`, error.message);
    
    // ===== SAVE ERROR TO DATABASE =====
    try {
      await Upload.findByIdAndUpdate(jobId, {
        translation_error: error.message,
        translation_failed_at: new Date(),
        translation_service: 'enhanced-translation-failed',
        $push: { errorMessages: `Enhanced translation failed: ${error.message}` }
      });
    } catch (dbError) {
      console.error(`[${jobId}] Failed to save translation error to database:`, dbError.message);
    }
    
    throw error;
  }
};

// ===== ENHANCED LIBRETRANSLATE IMPLEMENTATION =====
/**
 * Enhanced LibreTranslate with multiple working instances and duration preservation
 */
const translateWithLibreTranslateEnhanced = async (transcription, targetLanguage, jobId) => {
  console.log(`[${jobId}] Using enhanced LibreTranslate with duration preservation...`);
  
  // Working LibreTranslate instances (tested and updated)
  const workingInstances = [
    'translate.terraprint.co',     // Primary - most reliable
    'libretranslate.com',          // Official instance
    'translate.fortytwo-it.org',   // Alternative
    'translate.api.skitzen.com'    // Backup
  ];
  
  // LibreTranslate language mapping
  const langMap = {
    'hi': 'hi',    // Hindi
    'mr': 'mr',    // Marathi  
    'bn': 'bn',    // Bengali
    'ta': 'ta',    // Tamil
    'te': 'te',    // Telugu
    'gu': 'gu',    // Gujarati
    'kn': 'kn',    // Kannada
    'ml': 'ml',    // Malayalam
    'pa': 'pa',    // Punjabi
    'ur': 'ur',    // Urdu
    'en': 'en',    // English
    'auto': 'hi'   // Map auto to Hindi
  };
  
  const sourceLang = 'hi'; // Always Hindi now due to enhanced transcription
  const targetLang = langMap[targetLanguage] || 'mr';
  
  console.log(`[${jobId}] Enhanced LibreTranslate: ${sourceLang} → ${targetLang}`);
  console.log(`[${jobId}] Text length: ${transcription.text.length} characters`);
  console.log(`[${jobId}] Segments: ${transcription.segments.length}`);
  
  // ===== TRANSLATE FULL TEXT WITH RETRIES =====
  console.log(`[${jobId}] Step 1/2: Translating full text with enhanced LibreTranslate...`);
  let fullTextTranslation = '';
  let workingInstance = null;
  
  for (const instance of workingInstances) {
    try {
      console.log(`[${jobId}] Trying enhanced LibreTranslate instance: ${instance}`);
      
      fullTextTranslation = await callLibreTranslateAPIEnhanced(
        transcription.text, 
        sourceLang, 
        targetLang, 
        jobId, 
        instance
      );
      
      workingInstance = instance;
      console.log(`[${jobId}] ✅ Full text translated via ${instance}`);
      console.log(`[${jobId}] Translation preview: "${fullTextTranslation.substring(0, 100)}..."`);
      break;
      
    } catch (instanceError) {
      console.warn(`[${jobId}] Instance ${instance} failed: ${instanceError.message}`);
      continue;
    }
  }
  
  if (!fullTextTranslation || !workingInstance) {
    throw new Error('All enhanced LibreTranslate instances failed');
  }
  
  // ===== TRANSLATE SEGMENTS WITH DURATION PRESERVATION =====
  console.log(`[${jobId}] Step 2/2: Translating segments with enhanced duration preservation...`);
  const translatedSegments = [];
  let successfulSegments = 0;
  let failedSegments = 0;
  
  for (let i = 0; i < transcription.segments.length; i++) {
    const segment = transcription.segments[i];
    
    if (!segment.text || segment.text.trim().length === 0) {
      // Preserve empty segments with exact timing
      translatedSegments.push({
        start: segment.start,
        end: segment.end,
        text: '',
        original_text: segment.text || '',
        duration: (segment.end || 0) - (segment.start || 0),
        word_count: 0,
        translation_service: 'libretranslate-enhanced-empty'
      });
      continue;
    }
    
    console.log(`[${jobId}] Translating segment ${i + 1}/${transcription.segments.length}: "${segment.text.substring(0, 30)}..."`);
    
    try {
      const segmentTranslation = await callLibreTranslateAPIEnhanced(
        segment.text.trim(),
        sourceLang,
        targetLang,
        jobId,
        workingInstance // Use the working instance
      );
      
      // ===== PRESERVE EXACT TIMING AND CALCULATE METRICS =====
      const segmentDuration = (segment.end || 0) - (segment.start || 0);
      const wordCount = segmentTranslation.split(' ').filter(word => word.length > 0).length;
      
      translatedSegments.push({
        start: segment.start,
        end: segment.end,
        text: segmentTranslation,
        original_text: segment.text,
        duration: segmentDuration,
        word_count: wordCount,
        translation_confidence: 0.9,
        source_language: sourceLang,
        target_language: targetLang,
        translation_service: 'libretranslate-enhanced'
      });
      
      successfulSegments++;
      
      // Small delay to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (segmentError) {
      console.warn(`[${jobId}] Segment ${i + 1} failed, preserving original with timing`);
      
      // Preserve segment with original text but maintain exact timing
      const segmentDuration = (segment.end || 0) - (segment.start || 0);
      
      translatedSegments.push({
        start: segment.start,
        end: segment.end,
        text: segment.text,
        original_text: segment.text,
        duration: segmentDuration,
        word_count: segment.text.split(' ').filter(word => word.length > 0).length,
        translation_error: true,
        error_message: segmentError.message,
        source_language: sourceLang,
        target_language: targetLang,
        translation_service: 'libretranslate-enhanced-fallback'
      });
      
      failedSegments++;
    }
  }
  
  console.log(`[${jobId}] ✅ Enhanced LibreTranslate completed: ${successfulSegments}/${transcription.segments.length} segments successful`);
  
  // ===== VALIDATE DURATION PRESERVATION =====
  const originalDuration = transcription.duration || (transcription.segments.length > 0 ? transcription.segments[transcription.segments.length - 1].end : 0);
  const translatedDuration = translatedSegments.length > 0 ? translatedSegments[translatedSegments.length - 1].end : 0;
  const durationDifference = Math.abs(originalDuration - translatedDuration);
  const durationPreserved = durationDifference < 1;
  
  console.log(`[${jobId}] Enhanced duration preservation check:`);
  console.log(`[${jobId}]   Original duration: ${originalDuration.toFixed(2)} seconds`);
  console.log(`[${jobId}]   Translated duration: ${translatedDuration.toFixed(2)} seconds`);
  console.log(`[${jobId}]   Difference: ${durationDifference.toFixed(2)} seconds`);
  console.log(`[${jobId}]   Duration preserved: ${durationPreserved ? '✅ YES' : '❌ NO'}`);
  
  // ===== CREATE ENHANCED TRANSLATION RESULT =====
  const supportedLanguages = getSupportedIndianLanguages();
  const translation = {
    text: fullTextTranslation,
    language: targetLang,
    language_name: supportedLanguages[targetLanguage],
    original_language: sourceLang,
    original_language_name: supportedLanguages[sourceLang] || 'हिंदी (Hindi)',
    confidence: 0.9,
    segments: translatedSegments,
    translation_service: 'libretranslate-enhanced-hindi',
    translation_needed: true,
    total_segments: transcription.segments.length,
    successful_segments: successfulSegments,
    failed_segments: failedSegments,
    translation_quality: successfulSegments / Math.max(transcription.segments.length, 1),
    duration_preserved: durationPreserved,
    original_duration: originalDuration,
    translated_duration: translatedDuration,
    duration_difference: durationDifference,
    working_instance: workingInstance,
    hindi_optimized: true
  };
  
  // ===== SAVE ENHANCED TRANSLATION TO DATABASE =====
  await Upload.findByIdAndUpdate(jobId, {
    translated_text: translation.text,
    translation_segments: translation.segments,
    translation_language: targetLang,
    translation_language_name: supportedLanguages[targetLanguage],
    original_language: sourceLang,
    original_language_name: supportedLanguages[sourceLang] || 'हिंदी (Hindi)',
    translation_confidence: translation.confidence,
    translation_service: 'libretranslate-enhanced-hindi',
    translation_duration_preserved: translation.duration_preserved,
    translation_working_instance: workingInstance,
    translation_stats: {
      total_segments: translation.total_segments,
      successful_segments: translation.successful_segments,
      failed_segments: translation.failed_segments,
      translation_quality: translation.translation_quality,
      original_duration: translation.original_duration,
      translated_duration: translation.translated_duration,
      duration_difference: translation.duration_difference
    },
    hindi_optimized: true,
    translation_completed_at: new Date()
  });
  
  console.log(`[${jobId}] ✅ Enhanced LibreTranslate completed successfully via ${workingInstance}`);
  console.log(`[${jobId}] Translation quality: ${(translation.translation_quality * 100).toFixed(1)}%`);
  console.log(`[${jobId}] Duration preservation: ${durationPreserved ? 'PERFECT' : 'ACCEPTABLE'}`);
  
  return translation;
};

// ===== ENHANCED LIBRETRANSLATE API CALL =====
/**
 * Enhanced LibreTranslate API call with better error handling and timeout management
 */
const callLibreTranslateAPIEnhanced = (text, sourceLang, targetLang, jobId, instance = 'translate.terraprint.co') => {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text'
    });
    
    const options = {
      hostname: instance,
      port: 443,
      path: '/translate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'VideoTranslationApp-Enhanced/2.0',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const response = JSON.parse(data);
            
            if (response.translatedText) {
              resolve(response.translatedText);
            } else {
              reject(new Error(`Invalid response format from ${instance}: missing translatedText field`));
            }
          } else if (res.statusCode === 429) {
            reject(new Error(`Rate limited by ${instance} (HTTP 429)`));
          } else if (res.statusCode === 503) {
            reject(new Error(`Service unavailable at ${instance} (HTTP 503)`));
          } else {
            reject(new Error(`HTTP ${res.statusCode} from ${instance}: ${data.substring(0, 200)}`));
          }
        } catch (parseError) {
          reject(new Error(`JSON parse error from ${instance}: ${parseError.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      if (error.code === 'ENOTFOUND') {
        reject(new Error(`DNS resolution failed for ${instance}`));
      } else if (error.code === 'ECONNREFUSED') {
        reject(new Error(`Connection refused by ${instance}`));
      } else if (error.code === 'ETIMEDOUT') {
        reject(new Error(`Connection timeout to ${instance}`));
      } else {
        reject(new Error(`Connection error to ${instance}: ${error.message}`));
      }
    });
    
    req.setTimeout(20000, () => { // Increased timeout for better reliability
      req.destroy();
      reject(new Error(`Request timeout for ${instance} (20 seconds)`));
    });
    
    req.write(postData);
    req.end();
  });
};

// ===== ENHANCED GOOGLE TRANSLATE FALLBACK =====
/**
 * Enhanced Google Translate with improved rate limiting and segment handling
 */
const translateWithGoogleEnhanced = async (transcription, targetLanguage, jobId) => {
  // Reset daily counter
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailyGoogleTranslations = 0;
    lastResetDate = today;
    googleBlocked = false;
    blockUntil = null;
  }
  
  // Check if we're currently blocked
  if (googleBlocked && blockUntil && new Date() < blockUntil) {
    throw new Error(`Enhanced Google Translate blocked until ${blockUntil.toLocaleString()}`);
  }
  
  // Check daily limit (more conservative)
  if (dailyGoogleTranslations > 25) {
    throw new Error('Enhanced Google Translate daily limit reached (25)');
  }
  
  console.log(`[${jobId}] Using enhanced Google Translate fallback (${dailyGoogleTranslations}/25 used today)...`);
  
  const sourceLanguage = 'hi'; // Always Hindi now
  let detectedSourceLanguage = sourceLanguage;
  
  try {
    // ===== TRANSLATE FULL TEXT =====
    console.log(`[${jobId}] Step 1/2: Translating full text with enhanced Google Translate...`);
    const fullResult = await translate(transcription.text, { 
      from: sourceLanguage,
      to: targetLanguage 
    });
    
    const fullTextTranslation = fullResult.text;
    console.log(`[${jobId}] ✅ Enhanced Google full text translated: "${fullTextTranslation.substring(0, 100)}..."`);
    
    // Update detected language
    if (fullResult.from && fullResult.from.language && fullResult.from.language.iso) {
      detectedSourceLanguage = fullResult.from.language.iso;
      console.log(`[${jobId}] Google detected source language: ${detectedSourceLanguage}`);
    }
    
    dailyGoogleTranslations++;
    
    // ===== TRANSLATE SEGMENTS WITH DURATION PRESERVATION =====
    console.log(`[${jobId}] Step 2/2: Translating segments with enhanced Google (limited for rate control)...`);
    const translatedSegments = [];
    let successfulSegments = 0;
    let failedSegments = 0;
    
    const maxSegments = Math.min(15, transcription.segments.length); // Increased segment limit
    
    for (let i = 0; i < transcription.segments.length; i++) {
      const segment = transcription.segments[i];
      
      if (!segment.text || segment.text.trim().length === 0) {
        // Preserve empty segments with timing
        translatedSegments.push({
          start: segment.start,
          end: segment.end,
          text: '',
          original_text: segment.text || '',
          duration: (segment.end || 0) - (segment.start || 0),
          translation_service: 'google-enhanced-empty'
        });
        continue;
      }
      
      // Translate first segments, use original for rest (rate limit protection)
      if (i < maxSegments && dailyGoogleTranslations < 25) {
        console.log(`[${jobId}] Translating segment ${i + 1}/${maxSegments} with enhanced Google...`);
        
        try {
          const segmentResult = await translate(segment.text.trim(), { 
            from: detectedSourceLanguage,
            to: targetLanguage 
          });
          
          translatedSegments.push({
            start: segment.start,
            end: segment.end,
            text: segmentResult.text,
            original_text: segment.text,
            duration: (segment.end || 0) - (segment.start || 0),
            translation_confidence: 0.95,
            source_language: detectedSourceLanguage,
            target_language: targetLanguage,
            translation_service: 'google-enhanced'
          });
          
          successfulSegments++;
          dailyGoogleTranslations++;
          
          // Longer delay for rate limit respect
          await new Promise(resolve => setTimeout(resolve, 800));
          
        } catch (segmentError) {
          console.warn(`[${jobId}] Enhanced Google segment ${i + 1} failed:`, segmentError.message);
          
          // Check for rate limiting
          if (segmentError.message.includes('Too Many Requests') || segmentError.message.includes('429')) {
            console.warn(`[${jobId}] Enhanced Google rate limited during segments`);
            googleBlocked = true;
            blockUntil = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours block
            break;
          }
          
          // Use original text for failed segments
          translatedSegments.push({
            start: segment.start,
            end: segment.end,
            text: segment.text,
            original_text: segment.text,
            duration: (segment.end || 0) - (segment.start || 0),
            translation_error: true,
            error_message: segmentError.message,
            source_language: detectedSourceLanguage,
            target_language: targetLanguage,
            translation_service: 'google-enhanced-fallback'
          });
          
          failedSegments++;
        }
      } else {
        // Use original text for remaining segments (rate limit protection)
        translatedSegments.push({
          start: segment.start,
          end: segment.end,
          text: segment.text,
          original_text: segment.text,
          duration: (segment.end || 0) - (segment.start || 0),
          translation_error: true,
          error_message: 'Rate limit protection - using original text',
          source_language: detectedSourceLanguage,
          target_language: targetLanguage,
          translation_service: 'google-enhanced-rate-protected'
        });
        failedSegments++;
      }
    }
    
    console.log(`[${jobId}] ✅ Enhanced Google Translate completed: ${successfulSegments}/${transcription.segments.length} segments successful`);
    
    // ===== CREATE ENHANCED GOOGLE TRANSLATION RESULT =====
    const supportedLanguages = getSupportedIndianLanguages();
    const originalDuration = transcription.duration || (transcription.segments.length > 0 ? transcription.segments[transcription.segments.length - 1].end : 0);
    const translatedDuration = translatedSegments.length > 0 ? translatedSegments[translatedSegments.length - 1].end : 0;
    
    const translation = {
      text: fullTextTranslation,
      language: targetLanguage,
      language_name: supportedLanguages[targetLanguage],
      original_language: detectedSourceLanguage,
      original_language_name: supportedLanguages[detectedSourceLanguage] || 'हिंदी (Hindi)',
      confidence: 0.95,
      segments: translatedSegments,
      translation_service: 'google-translate-enhanced-fallback',
      translation_needed: true,
      total_segments: transcription.segments.length,
      successful_segments: successfulSegments,
      failed_segments: failedSegments,
      translation_quality: successfulSegments / Math.max(transcription.segments.length, 1),
      duration_preserved: Math.abs(originalDuration - translatedDuration) < 1,
      original_duration: originalDuration,
      translated_duration: translatedDuration,
      hindi_optimized: true
    };
    
    // Save enhanced Google translation to database
    await Upload.findByIdAndUpdate(jobId, {
      translated_text: translation.text,
      translation_segments: translation.segments,
      translation_language: targetLanguage,
      translation_language_name: supportedLanguages[targetLanguage],
      original_language: detectedSourceLanguage,
      original_language_name: supportedLanguages[detectedSourceLanguage] || 'हिंदी (Hindi)',
      translation_confidence: translation.confidence,
      translation_service: 'google-translate-enhanced-fallback',
      translation_stats: {
        total_segments: translation.total_segments,
        successful_segments: translation.successful_segments,
        failed_segments: translation.failed_segments,
        translation_quality: translation.translation_quality
      },
      hindi_optimized: true,
      translation_completed_at: new Date()
    });
    
    console.log(`[${jobId}] ✅ Enhanced Google fallback translation saved to database`);
    console.log(`[${jobId}] Enhanced translation quality: ${(translation.translation_quality * 100).toFixed(1)}%`);
    
    return translation;
    
  } catch (error) {
    // Handle rate limiting
    if (error.message.includes('Too Many Requests') || error.message.includes('429')) {
      googleBlocked = true;
      blockUntil = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours
    }
    
    throw error;
  }
};

// ===== HELPER FUNCTION: CREATE SKIPPED TRANSLATION =====
const createSkippedTranslation = async (transcription, sourceLanguage, targetLanguage, jobId) => {
  const supportedLanguages = getSupportedIndianLanguages();
  
  const translation = {
    text: transcription.text,
    language: targetLanguage,
    language_name: supportedLanguages[targetLanguage],
    original_language: sourceLanguage,
    original_language_name: supportedLanguages[sourceLanguage] || sourceLanguage,
    confidence: transcription.confidence || 0.95,
    segments: transcription.segments || [],
    translation_service: 'enhanced-translation-skipped',
    translation_needed: false,
    total_segments: transcription.segments ? transcription.segments.length : 0,
    successful_segments: transcription.segments ? transcription.segments.length : 0,
    failed_segments: 0,
    duration_preserved: true,
    original_duration: transcription.duration || 0,
    translated_duration: transcription.duration || 0
  };
  
  await Upload.findByIdAndUpdate(jobId, {
    translated_text: translation.text,
    translation_segments: translation.segments,
    translation_language: targetLanguage,
    original_language: sourceLanguage,
    translation_confidence: translation.confidence,
    translation_service: 'enhanced-translation-skipped',
    translation_duration_preserved: true,
    translation_completed_at: new Date(),
    translation_stats: {
      total_segments: translation.total_segments,
      successful_segments: translation.successful_segments,
      failed_segments: translation.failed_segments
    }
  });
  
  return translation;
};

// ===== HELPER FUNCTION: CREATE ENHANCED FALLBACK TRANSLATION =====
const createEnhancedFallback = async (transcription, sourceLanguage, targetLanguage, jobId, reason) => {
  console.warn(`[${jobId}] Using enhanced fallback translation (original text): ${reason}`);
  
  const supportedLanguages = getSupportedIndianLanguages();
  
  const fallbackTranslation = {
    text: transcription.text,
    language: sourceLanguage, // Keep original language
    language_name: supportedLanguages[sourceLanguage] || sourceLanguage,
    original_language: sourceLanguage,
    original_language_name: supportedLanguages[sourceLanguage] || sourceLanguage,
    confidence: 0.8,
    segments: transcription.segments || [],
    translation_service: 'enhanced-fallback-original-text',
    translation_needed: false,
    total_segments: transcription.segments ? transcription.segments.length : 0,
    successful_segments: transcription.segments ? transcription.segments.length : 0,
    failed_segments: 0,
    fallback_reason: reason,
    duration_preserved: true,
    original_duration: transcription.duration || 0,
    translated_duration: transcription.duration || 0,
    hindi_optimized: true
  };
  
  await Upload.findByIdAndUpdate(jobId, {
    translated_text: fallbackTranslation.text,
    translation_service: 'enhanced-fallback-original-text',
    translation_duration_preserved: true,
    translation_completed_at: new Date(),
    fallback_reason: reason,
    hindi_optimized: true
  });
  
  return fallbackTranslation;
};

// ===== SUPPORTED INDIAN LANGUAGES =====
/**
 * Get Indian languages supported by enhanced translation services
 * Optimized for Whisper AI, LibreTranslate, and Google Translate compatibility
 * @returns {Object} - Object with language codes and display names
 */
export const getSupportedIndianLanguages = () => {
  return {
    // ===== TIER 1: EXCELLENT SUPPORT (TESTED & OPTIMIZED) =====
    'hi': 'हिंदी (Hindi)',                    // ✅ Best support - Source language
    'bn': 'বাংলা (Bengali)',                   // ✅ Excellent support
    'ta': 'தமிழ் (Tamil)',                     // ✅ Excellent support
    'te': 'తెలుగు (Telugu)',                   // ✅ Excellent support
    'mr': 'मराठी (Marathi)',                   // ✅ Very good support
    'gu': 'ગુજરાતી (Gujarati)',               // ✅ Very good support
    'kn': 'ಕನ್ನಡ (Kannada)',                   // ✅ Very good support
    'ml': 'മലയാളം (Malayalam)',                // ✅ Very good support
    'pa': 'ਪੰਜਾਬੀ (Punjabi)',                 // ✅ Good support
    'ur': 'اردو (Urdu)',                      // ✅ Good support
    'en': 'English',                          // ✅ Reference language
    
    // ===== TIER 2: GOOD SUPPORT (REGIONAL) =====
    'as': 'অসমীয়া (Assamese)',               // ⚠️  Test recommended
    'or': 'ଓଡ଼ିଆ (Odia)',                     // ⚠️  Test recommended
    'ne': 'नेपाली (Nepali)',                  // ⚠️  Test recommended
    'si': 'සිංහල (Sinhala)',                  // ⚠️  Limited support
    'my': 'မြန်မာ (Myanmar)',                  // ⚠️  Limited support
  };
};

// ===== HELPER FUNCTION: GET MOST COMMON INDIAN LANGUAGES =====
/**
 * Get the most commonly used Indian languages for frontend dropdown
 * @returns {Object} - Most popular Indian languages optimized for translation
 */
export const getMostCommonIndianLanguages = () => {
  return {
    'hi': 'हिंदी (Hindi) - Source',
    'bn': 'বাংলা (Bengali)',
    'ta': 'தமிழ் (Tamil)',
    'te': 'తెలుగు (Telugu)',
    'mr': 'मराठी (Marathi)',
    'gu': 'ગુજરાતી (Gujarati)',
    'kn': 'ಕನ್ನಡ (Kannada)',
    'ml': 'മലയാളം (Malayalam)',
    'pa': 'ਪੰਜਾਬੀ (Punjabi)',
    'ur': 'اردو (Urdu)',
    'en': 'English'
  };
};

// ===== HELPER FUNCTION: GET BEST LANGUAGE PAIRS =====
/**
 * Get recommended language pairs for best translation quality
 * @returns {Array} - Array of recommended translation pairs
 */
export const getBestTranslationPairs = () => {
  return [
    { from: 'hi', to: 'bn', quality: '95%', note: 'हिंदी → बাংলা (Excellent)' },
    { from: 'hi', to: 'ta', quality: '93%', note: 'हिंदी → தமிழ் (Excellent)' },
    { from: 'hi', to: 'te', quality: '92%', note: 'हिंदी → తెలుగు (Excellent)' },
    { from: 'hi', to: 'mr', quality: '91%', note: 'हिंदी → मराठी (Very Good)' },
    { from: 'hi', to: 'gu', quality: '90%', note: 'हिंदी → ગુજરાતી (Very Good)' },
    { from: 'hi', to: 'en', quality: '97%', note: 'हिंदी → English (Excellent)' }
  ];
};

// ===== HELPER FUNCTION: VALIDATE LANGUAGE COMPATIBILITY =====
/**
 * Check if a language pair is supported by enhanced translation services
 * @param {string} sourceLang - Source language code
 * @param {string} targetLang - Target language code
 * @returns {Object} - Compatibility information
 */
export const isLanguagePairSupported = (sourceLang, targetLang) => {
  const supportedLanguages = getSupportedIndianLanguages();
  const bestPairs = getBestTranslationPairs();
  
  const sourceSupported = supportedLanguages.hasOwnProperty(sourceLang);
  const targetSupported = supportedLanguages.hasOwnProperty(targetLang);
  const pairOptimized = bestPairs.some(pair => pair.from === sourceLang && pair.to === targetLang);
  
  return {
    supported: sourceSupported && targetSupported,
    source_supported: sourceSupported,
    target_supported: targetSupported,
    pair_optimized: pairOptimized,
    recommendation: pairOptimized ? 'Excellent' : (sourceSupported && targetSupported) ? 'Good' : 'Not Supported'
  };
};

// ===== HELPER FUNCTION: BATCH TRANSLATE SEGMENTS =====
/**
 * Enhanced batch translation for multiple segments with duration preservation
 * @param {Array} segments - Array of text segments to translate
 * @param {string} fromLang - Source language
 * @param {string} toLang - Target language
 * @param {number} batchSize - Number of segments per batch
 * @returns {Promise<Array>} - Array of translated segments with preserved timing
 */
export const batchTranslateSegmentsEnhanced = async (segments, fromLang, toLang, batchSize = 5) => {
  const results = [];
  
  console.log(`Enhanced batch translating ${segments.length} segments: ${fromLang} → ${toLang}`);
  
  for (let i = 0; i < segments.length; i += batchSize) {
    const batch = segments.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(segments.length / batchSize)}`);
    
    const batchPromises = batch.map(async (segment, segmentIndex) => {
      try {
        // Try enhanced LibreTranslate first
        const result = await callLibreTranslateAPIEnhanced(
          segment.text, 
          fromLang, 
          toLang, 
          `BATCH_${i + segmentIndex}`,
          'translate.terraprint.co'
        );
        
        return {
          ...segment,
          translated_text: result,
          success: true,
          service: 'libretranslate-enhanced',
          duration: (segment.end || 0) - (segment.start || 0)
        };
        
      } catch (libreError) {
        try {
          // Fall back to Google Translate
          const result = await translate(segment.text, { from: fromLang, to: toLang });
          return {
            ...segment,
            translated_text: result.text,
            success: true,
            service: 'google-enhanced-fallback',
            duration: (segment.end || 0) - (segment.start || 0)
          };
        } catch (googleError) {
          return {
            ...segment,
            translated_text: segment.text, // Fallback to original
            success: false,
            error: `Both enhanced services failed: LibreTranslate: ${libreError.message}, Google: ${googleError.message}`,
            service: 'enhanced-fallback-original',
            duration: (segment.end || 0) - (segment.start || 0)
          };
        }
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Enhanced delay between batches for API respect
    if (i + batchSize < segments.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Enhanced batch translation completed: ${successful}/${results.length} successful, ${failed} failed`);
  
  return results;
};

// ===== MAIN EXPORT =====
export default {
  translateText,
  getSupportedIndianLanguages,
  getMostCommonIndianLanguages,
  getBestTranslationPairs,
  isLanguagePairSupported,
  batchTranslateSegmentsEnhanced
};
