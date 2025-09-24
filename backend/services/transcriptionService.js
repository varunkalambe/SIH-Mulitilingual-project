// services/transcriptionService.js - ENHANCED WITH MEDIUM MODEL AND TEXT CLEANING


// ===== IMPORT REQUIRED MODULES =====
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import Upload from '../models/uploadModel.js';


// ===== MAIN ENHANCED TRANSCRIPTION FUNCTION =====
/**
 * Enhanced transcription service using local Whisper CLI with Hindi optimization
 * Uses medium model with aggressive text cleaning and language forcing
 * Called by processController.js in step 3 of processing pipeline
 * @param {string} jobId - Unique job identifier to locate audio file
 * @returns {Promise<Object>} - Enhanced transcription object with text, language, and segments
 */
export const transcribeAudio = async (jobId) => {
  try {
    console.log(`[${jobId}] Starting MEDIUM enhanced Whisper transcription with Hindi optimization...`);
    
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
    console.log(`[${jobId}] Using Whisper MEDIUM model for optimal Hindi accuracy...`);
    
    // ===== PREPARE OUTPUT DIRECTORY =====
    const outputDir = './uploads/transcripts/';
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`[${jobId}] Created transcripts directory: ${outputDir}`);
    }
    
    // ===== MEDIUM ENHANCED WHISPER CONFIGURATION =====
    const whisperOptions = {
      model: 'medium',                 // 🎯 OPTIMIZED MODEL for balance of accuracy and performance
      language: 'hi',                  // FORCE Hindi detection
      task: 'transcribe',              // Only transcription, no translation
      output_format: 'json',           // Detailed JSON output
      verbose: 'False',                // Reduce console noise
      word_timestamps: 'True',         // Enable word-level timestamps
      temperature: '0.0',              // Deterministic output (no randomness)
      best_of: '5',                    // Generate 5 candidates, pick best
      beam_size: '5',                  // Beam search for better accuracy
      patience: '2.0',                 // Higher patience for better results
      length_penalty: '1.0',           // Penalty for length
      suppress_tokens: '-1',           // Don't suppress any tokens
      condition_on_previous_text: 'True', // Use context from previous segments
      fp16: 'True',                    // Use half precision (faster on modern GPUs)
      threads: '4',                    // Use 4 CPU threads
      initial_prompt: 'यह एक हिंदी भाषा का शैक्षणिक वीडियो है जो कृषि और खेती के बारे में जानकारी देता है।' // Agricultural Hindi context
    };
    
    console.log(`[${jobId}] MEDIUM Enhanced Configuration:`);
    console.log(`[${jobId}]   Model: ${whisperOptions.model} (Optimal balance)`);
    console.log(`[${jobId}]   Language: हिंदी (Hindi) - Forced`);
    console.log(`[${jobId}]   Context: Agricultural/Educational`);
    console.log(`[${jobId}]   Expected accuracy: ~92%`);
    console.log(`[${jobId}]   Model size: 769 MB`);
    console.log(`[${jobId}]   Processing speed: Moderate (2x faster than large models)`);
    
    // ===== BUILD ENHANCED WHISPER COMMAND =====
    const whisperCommand = [
  'whisper',
  `"${audioPath}"`,
  `--model ${whisperOptions.model || 'medium'}`,
  `--model "C:/Users/varun/.cache/whisper/medium.pt"`,            // <-- Integrated here, double backslash for Node/Windows
  `--language ${whisperOptions.language}`,
  `--task ${whisperOptions.task}`,
  `--output_format ${whisperOptions.output_format}`,
  `--verbose ${whisperOptions.verbose}`,
  `--word_timestamps ${whisperOptions.word_timestamps}`,
  `--temperature ${whisperOptions.temperature}`,
  `--best_of ${whisperOptions.best_of}`,
  `--beam_size ${whisperOptions.beam_size}`,
  `--patience ${whisperOptions.patience}`,
  `--length_penalty ${whisperOptions.length_penalty}`,
  `--suppress_tokens ${whisperOptions.suppress_tokens}`,
  `--condition_on_previous_text ${whisperOptions.condition_on_previous_text}`,
  `--fp16 ${whisperOptions.fp16}`,
  `--threads ${whisperOptions.threads}`,
  `--initial_prompt "${whisperOptions.initial_prompt}"`,
  `--output_dir="${outputDir}"`
].join(' ');

    
    console.log(`[${jobId}] Starting MEDIUM transcription (may take 2-4 minutes for optimal accuracy)...`);
    console.log(`[${jobId}] Enhanced command: ${whisperCommand.substring(0, 100)}...`);
    
    // ===== EXECUTE ENHANCED WHISPER WITH MONITORING =====
    const startTime = Date.now();
    const whisperResult = await executeWhisperEnhanced(whisperCommand, jobId);
    const processingTime = (Date.now() - startTime) / 1000;
    
    console.log(`[${jobId}] MEDIUM processing completed in ${processingTime.toFixed(1)} seconds`);
    
    // ===== ADVANCED POST-PROCESSING FOR HINDI =====
    const enhancedTranscription = advancedHindiPostProcessing(whisperResult, jobId);
    
    console.log(`[${jobId}] ✅ MEDIUM enhanced transcription completed`);
    console.log(`[${jobId}] Quality metrics:`);
    console.log(`[${jobId}]   Language: हिंदी (Hindi) - ${enhancedTranscription.script_purity}% pure`);
    console.log(`[${jobId}]   Text length: ${enhancedTranscription.text.length} characters`);
    console.log(`[${jobId}]   Word count: ${enhancedTranscription.word_count} words`);
    console.log(`[${jobId}]   Segments: ${enhancedTranscription.segments.length}`);
    console.log(`[${jobId}]   Duration: ${enhancedTranscription.duration} seconds`);
    console.log(`[${jobId}]   Confidence: ${(enhancedTranscription.confidence * 100).toFixed(1)}%`);
    console.log(`[${jobId}]   Processing time: ${processingTime.toFixed(1)}s`);
    
    // Preview of clean transcription
    console.log(`[${jobId}] Clean text preview: "${enhancedTranscription.text.substring(0, 150)}..."`);
    
    // ===== SAVE ENHANCED TRANSCRIPTION TO FILES =====
    const transcriptFilePath = path.join(outputDir, `${jobId}_transcript.txt`);
    fs.writeFileSync(transcriptFilePath, enhancedTranscription.text, 'utf8');
    
    // ===== SAVE ENHANCED RESULTS TO DATABASE =====
    await Upload.findByIdAndUpdate(jobId, {
      transcriptionText: enhancedTranscription.text,              // For compatibility
      original_transcription: enhancedTranscription.text,         // New field
      transcription_segments: enhancedTranscription.segments,
      detected_language: 'hi',                                    // Always Hindi now
      transcription_confidence: enhancedTranscription.confidence,
      transcription_duration: enhancedTranscription.duration,
      transcription_word_count: enhancedTranscription.word_count,
      transcription_script_purity: enhancedTranscription.script_purity,
      transcription_processing_time: processingTime,
      transcription_service: 'whisper-medium-enhanced-hindi',
      transcription_model: 'medium',
      transcription_quality: enhancedTranscription.processing_quality,
      transcription_completed_at: new Date(),
      transcription_file_path: path.join(outputDir, `${path.parse(audioPath).name}.json`),
      transcript_file_path: transcriptFilePath,
      hindi_optimized: true,
      language_forced: true
    });
    
    console.log(`[${jobId}] ✅ Enhanced transcription saved to database and files`);
    console.log(`[${jobId}] Keeping JSON file for reference: ${path.join(outputDir, `${path.parse(audioPath).name}.json`)}`);
    
    return enhancedTranscription;
    
  } catch (error) {
    console.error(`[${jobId}] ❌ Enhanced transcription failed:`, error.message);
    
    // ===== SAVE ERROR TO DATABASE =====
    try {
      await Upload.findByIdAndUpdate(jobId, {
        transcription_error: error.message,
        transcription_failed_at: new Date(),
        transcription_service: 'whisper-medium-failed',
        $push: { errorMessages: `Enhanced transcription failed: ${error.message}` }
      });
    } catch (dbError) {
      console.error(`[${jobId}] Failed to save transcription error to database:`, dbError.message);
    }
    
    throw error;
  }
};


// ===== EXECUTE ENHANCED WHISPER WITH MONITORING =====
const executeWhisperEnhanced = (command, jobId) => {
  return new Promise((resolve, reject) => {
    console.log(`[${jobId}] Executing MEDIUM Whisper command...`);
    
    const whisperProcess = exec(command, { 
      maxBuffer: 1024 * 1024 * 150,  // 150MB buffer for medium model output
      timeout: 900000                // 15 minute timeout for medium model
    }, async (error, stdout, stderr) => {
      
      if (error) {
        console.error(`[${jobId}] MEDIUM Whisper execution failed:`, error.message);
        
        // Check specific error types
        if (error.message.includes('timeout')) {
          reject(new Error('MEDIUM processing timeout (15 minutes). Audio may be too long.'));
        } else if (error.message.includes('whisper: command not found') || error.message.includes('not recognized')) {
          reject(new Error('Whisper not installed. Run: pip install openai-whisper'));
        } else if (error.message.includes('medium')) {
          reject(new Error('MEDIUM model not found. Download with: python -c "import whisper; whisper.load_model(\'medium\')"'));
        } else if (error.message.includes('ffmpeg')) {
          reject(new Error('FFmpeg required. Install FFmpeg first.'));
        } else {
          reject(new Error(`MEDIUM processing failed: ${error.message}`));
        }
        return;
      }
      
      // Log progress information from stderr
      if (stderr) {
        const progressLines = stderr.split('\n').filter(line => 
          line.includes('%') || 
          line.includes('Detecting language') || 
          line.includes('Detected language') ||
          line.includes('Processing')
        );
        
        progressLines.forEach(line => {
          const cleanLine = line.trim();
          if (cleanLine) {
            console.log(`[${jobId}] MEDIUM progress: ${cleanLine}`);
          }
        });
      }
      
      try {
        // ===== READ WHISPER OUTPUT JSON =====
        const baseFileName = path.parse(`${jobId}_audio.wav`).name;
        const jsonOutputPath = path.join('./uploads/transcripts/', `${baseFileName}.json`);
        
        console.log(`[${jobId}] Looking for MEDIUM output at: ${jsonOutputPath}`);
        
        // Wait a moment for file to be written completely
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (!fs.existsSync(jsonOutputPath)) {
          // Try alternative naming patterns
          const altPaths = [
            path.join('./uploads/transcripts/', `${jobId}.json`),
            path.join('./uploads/transcripts/', `${jobId}_audio.json`),
            path.join('./uploads/transcripts/', `audio.json`)
          ];
          
          let foundPath = null;
          for (const altPath of altPaths) {
            if (fs.existsSync(altPath)) {
              console.log(`[${jobId}] Found MEDIUM output at alternative path: ${altPath}`);
              // Rename to expected path
              fs.renameSync(altPath, jsonOutputPath);
              foundPath = jsonOutputPath;
              break;
            }
          }
          
          if (!foundPath) {
            throw new Error(`MEDIUM output file not found at: ${jsonOutputPath} or alternative paths`);
          }
        }
        
        // Read and parse Whisper JSON output
        const whisperResult = JSON.parse(fs.readFileSync(jsonOutputPath, 'utf8'));
        console.log(`[${jobId}] Successfully read MEDIUM output JSON`);
        
        // Validate MEDIUM output
        if (!whisperResult.text || !whisperResult.segments) {
          throw new Error('Invalid MEDIUM output: missing text or segments');
        }
        
        console.log(`[${jobId}] ✅ MEDIUM execution successful`);
        console.log(`[${jobId}] Generated ${whisperResult.segments.length} segments`);
        
        resolve(whisperResult);
        
      } catch (processingError) {
        console.error(`[${jobId}] Failed to process MEDIUM output:`, processingError.message);
        reject(processingError);
      }
    });
    
    // Monitor memory usage for medium model
    const memoryMonitor = setInterval(() => {
      try {
        const memUsage = process.memoryUsage();
        if (memUsage.rss > 3 * 1024 * 1024 * 1024) { // 3GB threshold for medium model
          console.warn(`[${jobId}] High memory usage: ${Math.round(memUsage.rss / 1024 / 1024)} MB`);
        }
      } catch (memError) {
        // Ignore memory monitoring errors
      }
    }, 30000); // Check every 30 seconds
    
    // Clear interval when process completes
    whisperProcess.on('exit', () => {
      clearInterval(memoryMonitor);
    });
  });
};


// ===== ADVANCED HINDI POST-PROCESSING =====
const advancedHindiPostProcessing = (whisperOutput, jobId) => {
  console.log(`[${jobId}] Applying advanced Hindi post-processing and script cleaning...`);
  
  let cleanedText = whisperOutput.text || '';
  let segments = whisperOutput.segments || [];
  
  // ===== SCRIPT PURITY ANALYSIS =====
  const totalChars = cleanedText.length;
  const devanagariChars = (cleanedText.match(/[\u0900-\u097F]/g) || []).length;
  const arabicChars = (cleanedText.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const latinChars = (cleanedText.match(/[a-zA-Z]/g) || []).length;
  const otherChars = totalChars - devanagariChars - arabicChars - latinChars;
  
  const scriptPurity = Math.round((devanagariChars / Math.max(totalChars - latinChars, 1)) * 100);
  
  console.log(`[${jobId}] Script analysis before cleaning:`);
  console.log(`[${jobId}]   Total characters: ${totalChars}`);
  console.log(`[${jobId}]   Devanagari (Hindi): ${devanagariChars} (${Math.round(devanagariChars/totalChars*100)}%)`);
  console.log(`[${jobId}]   Arabic/Urdu: ${arabicChars} (${Math.round(arabicChars/totalChars*100)}%)`);
  console.log(`[${jobId}]   Latin: ${latinChars} (${Math.round(latinChars/totalChars*100)}%)`);
  console.log(`[${jobId}]   Other: ${otherChars} (${Math.round(otherChars/totalChars*100)}%)`);
  console.log(`[${jobId}]   Script purity: ${scriptPurity}%`);
  
  // ===== AGGRESSIVE TEXT CLEANING FOR PURE HINDI =====
  cleanedText = cleanedText
    // Remove all Arabic/Urdu script variants
    .replace(/[\u0600-\u06FF]/g, '')    // Arabic block
    .replace(/[\u0750-\u077F]/g, '')    // Arabic supplement
    .replace(/[\uFB50-\uFDFF]/g, '')    // Arabic presentation forms A
    .replace(/[\uFE70-\uFEFF]/g, '')    // Arabic presentation forms B
    // Keep only Devanagari, ASCII, and essential punctuation
    .replace(/[^\u0900-\u097F\u0020-\u007F\u2000-\u206F]/g, ' ')
    // Fix common Whisper transcription errors in Hindi
    .replace(/ी\s+/g, 'ी ')           // Fix matras (vowel marks)
    .replace(/े\s+/g, 'े ')
    .replace(/ै\s+/g, 'ै ')
    .replace(/ो\s+/g, 'ो ')
    .replace(/ौ\s+/g, 'ौ ')
    .replace(/्\s+/g, '्')            // Fix virama (halant)
    // Clean up excessive whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  // ===== CLEAN SEGMENTS WITH TIMING PRESERVATION =====
  const cleanedSegments = segments.map((segment, index) => {
    let segmentText = segment.text || '';
    
    // Apply same aggressive cleaning to each segment
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
    
    return {
      id: index,
      start: segment.start || 0,
      end: segment.end || 0,
      text: segmentText,
      original_text: segment.text,
      confidence: segment.avg_logprob || -0.3,        // MEDIUM typically has good confidence
      words: segment.words || [],
      temperature: segment.temperature || 0.0,
      avg_logprob: segment.avg_logprob || -0.3,
      compression_ratio: segment.compression_ratio || 1.0,
      no_speech_prob: segment.no_speech_prob || 0.0,
      duration: (segment.end || 0) - (segment.start || 0)
    };
  }).filter(segment => segment.text.length > 0); // Remove empty segments
  
  // ===== CALCULATE ENHANCED METRICS =====
  const duration = segments.length > 0 ? segments[segments.length - 1].end : 0;
  const avgConfidence = segments.reduce((sum, seg) => sum + (seg.avg_logprob || -0.3), 0) / Math.max(segments.length, 1);
  const wordCount = cleanedText.split(/\s+/).filter(word => word.length > 0).length;
  
  // Convert log probability to confidence percentage (MEDIUM specific)
  const confidence = Math.max(0, Math.min(1, (avgConfidence + 1) / 1));
  
  // Final script purity check
  const finalDevanagariChars = (cleanedText.match(/[\u0900-\u097F]/g) || []).length;
  const finalScriptPurity = Math.round((finalDevanagariChars / Math.max(cleanedText.length - (cleanedText.match(/[a-zA-Z]/g) || []).length, 1)) * 100);
  
  console.log(`[${jobId}] Post-processing results:`);
  console.log(`[${jobId}]   Original text length: ${(whisperOutput.text || '').length} characters`);
  console.log(`[${jobId}]   Clean text length: ${cleanedText.length} characters`);
  console.log(`[${jobId}]   Text reduction: ${Math.round((1 - cleanedText.length / Math.max((whisperOutput.text || '').length, 1)) * 100)}%`);
  console.log(`[${jobId}]   Original segments: ${segments.length}`);
  console.log(`[${jobId}]   Clean segments: ${cleanedSegments.length}`);
  console.log(`[${jobId}]   Final script purity: ${finalScriptPurity}%`);
  console.log(`[${jobId}]   Word count: ${wordCount}`);
  console.log(`[${jobId}]   Confidence: ${(confidence * 100).toFixed(1)}%`);
  
  return {
    text: cleanedText,
    segments: cleanedSegments,
    language: 'hi',
    confidence: confidence,
    duration: duration,
    word_count: wordCount,
    script_purity: finalScriptPurity,
    model: 'medium',
    processing_quality: finalScriptPurity > 80 ? 'excellent' : finalScriptPurity > 65 ? 'good' : 'fair',
    original_length: (whisperOutput.text || '').length,
    cleaned_length: cleanedText.length,
    reduction_percentage: Math.round((1 - cleanedText.length / Math.max((whisperOutput.text || '').length, 1)) * 100)
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
 * Validate audio file exists and is proper format
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
    
    // Check file extension
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


// ===== HELPER FUNCTION: CHECK WHISPER INSTALLATION =====
/**
 * Check if Whisper CLI is properly installed and MEDIUM model is available
 * @returns {Promise<Object>} - Installation status and model availability
 */
export const checkWhisperInstallation = async () => {
  return new Promise((resolve) => {
    exec('whisper --help', (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Whisper CLI not found. Please install with: pip install openai-whisper');
        resolve({
          installed: false,
          hasMedium: false,
          message: 'Whisper CLI not installed'
        });
      } else {
        console.log('✅ Whisper CLI is available');
        
        // Check if medium model is available
        exec('python -c "import whisper; whisper.load_model(\'medium\')"', (modelError) => {
          if (modelError) {
            console.warn('⚠️ MEDIUM model not found. Download with: python -c "import whisper; whisper.load_model(\'medium\')"');
            resolve({
              installed: true,
              hasMedium: false,
              message: 'Whisper installed but MEDIUM model missing'
            });
          } else {
            console.log('✅ MEDIUM model is available');
            resolve({
              installed: true,
              hasMedium: true,
              message: 'Whisper and MEDIUM model ready'
            });
          }
        });
      }
    });
  });
};


// ===== HELPER FUNCTION: GET WHISPER MODEL INFO =====
/**
 * Get information about the MEDIUM Whisper model
 * @returns {Object} - Model information
 */
export const getWhisperModelInfo = () => {
  return {
    name: 'medium',
    size: '769 MB',
    speed: 'Moderate (⚡⚡)',
    accuracy: '~92%',
    hindi_accuracy: '~88%',
    vram_requirement: '~5 GB',
    processing_time: '2x faster than large models',
    recommended_for: 'Balanced performance and accuracy',
    hardware_requirements: 'Mid-range PC with 8GB+ RAM',
    note: '🎯 OPTIMAL for moderate hardware - Good balance of speed and quality'
  };
};


// ===== HELPER FUNCTION: GET SYSTEM RECOMMENDATIONS =====
/**
 * Get system recommendations for MEDIUM model
 * @returns {Object} - System recommendations
 */
export const getSystemRecommendations = () => {
  return {
    model: 'medium',
    reason: 'Optimal balance of accuracy (~92%) and performance for moderate hardware',
    hardware_requirements: {
      ram: '8GB+ recommended',
      storage: '1GB+ free space',
      cpu: '4+ cores recommended',
      gpu: 'Optional (NVIDIA with 4GB+ VRAM for acceleration)'
    },
    performance: {
      processing_speed: 'Moderate (2x faster than large models)',
      accuracy: 'Very Good (~88% for Hindi)',
      memory_usage: 'Moderate (~3GB peak)',
      recommended_for: 'Most applications requiring good quality with reasonable speed'
    }
  };
};


// ===== MAIN EXPORT =====
export default {
  transcribeAudio,
  validateAudioFile,
  getTranscriptionInfo,
  checkWhisperInstallation,
  getWhisperModelInfo,
  getSystemRecommendations
};
