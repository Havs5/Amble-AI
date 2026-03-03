/**
 * Document Processor
 * 
 * Handles extraction of text content from various document types,
 * intelligent chunking for embeddings, and metadata extraction.
 */

import { 
  KBDocument, 
  KBChunk, 
  DocumentMetadata, 
  ChunkMetadata,
  DocumentCategory,
  PRODUCT_KEYWORDS,
  PHARMACY_KEYWORDS,
  DEPARTMENT_KEYWORDS,
  isSupportedMimeType
} from './types';
import { getImageProcessor, type ImageProcessingResult } from './ImageProcessor';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const CHUNK_SIZE = 1000; // Target characters per chunk
const CHUNK_OVERLAP = 200; // Characters overlap between chunks
const MAX_CHUNK_SIZE = 2000; // Maximum chunk size
const MIN_CHUNK_SIZE = 100; // Minimum chunk size (skip smaller)

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

export class DocumentProcessor {
  
  /**
   * Extract text content from a document based on its MIME type
   */
  static async extractContent(
    content: string | Buffer,
    mimeType: string,
    fileName: string
  ): Promise<{ text: string; metadata: Partial<DocumentMetadata> }> {
    console.log(`[DocProcessor] Extracting content from ${fileName} (${mimeType})`);
    
    // Handle text-based content directly
    if (typeof content === 'string') {
      return this.processTextContent(content, mimeType, fileName);
    }
    
    // Handle binary content
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    
    switch (mimeType) {
      case 'application/pdf':
        return this.extractFromPDF(buffer, fileName);
        
      case 'application/vnd.google-apps.document':
        // Google Docs are exported as plain text via API
        return this.processTextContent(buffer.toString('utf-8'), mimeType, fileName);
        
      case 'application/vnd.google-apps.spreadsheet':
        // Google Sheets exported as CSV
        return this.processSpreadsheet(buffer.toString('utf-8'), fileName);
        
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return this.extractFromDocx(buffer, fileName);
        
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        return this.extractFromXlsx(buffer, fileName);
        
      case 'text/csv':
        return this.processSpreadsheet(buffer.toString('utf-8'), fileName);
        
      case 'text/plain':
      case 'text/markdown':
      case 'application/json':
        return this.processTextContent(buffer.toString('utf-8'), mimeType, fileName);
      
      case 'text/xml':
      case 'application/xml':
        return this.processXmlContent(buffer.toString('utf-8'), fileName);
        
      case 'image/jpeg':
      case 'image/png':
      case 'image/gif':
      case 'image/webp':
        return this.extractFromImage(buffer, mimeType, fileName);
        
      default:
        // Try as text
        try {
          return this.processTextContent(buffer.toString('utf-8'), mimeType, fileName);
        } catch {
          throw new Error(`Unsupported MIME type: ${mimeType}`);
        }
    }
  }
  
  /**
   * Process XML content - extract text from XML structure
   */
  private static processXmlContent(
    xmlString: string,
    fileName: string
  ): { text: string; metadata: Partial<DocumentMetadata> } {
    // Remove XML tags but keep text content
    const textContent = xmlString
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') // Extract CDATA content
      .replace(/<[^>]+>/g, ' ') // Remove tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    return {
      text: textContent,
      metadata: {
        title: fileName.replace(/\.[^.]+$/, ''),
        wordCount: textContent.split(/\s+/).length,
      },
    };
  }
  
  /**
   * Extract text from image using GPT-4o vision
   */
  private static async extractFromImage(
    buffer: Buffer,
    mimeType: string,
    fileName: string
  ): Promise<{ text: string; metadata: Partial<DocumentMetadata> }> {
    console.log(`[DocProcessor] Analyzing image: ${fileName} (${mimeType})`);
    
    try {
      const { getImageProcessor } = await import('./ImageProcessor');
      const imageProcessor = getImageProcessor();
      
      if (!imageProcessor.isEnabled()) {
        console.log('[DocProcessor] Image analysis disabled - returning filename as metadata');
        return {
          text: `[Image: ${fileName}]`,
          metadata: {
            title: fileName,
            hasVisualContent: true,
            imageCount: 1,
          },
        };
      }
      
      // Use vision to analyze the image
      const base64Image = buffer.toString('base64');
      const analysis = await imageProcessor.analyzeImageBase64(base64Image, mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', {
        context: `Knowledge Base document: ${fileName}`,
      });
      
      // Build searchable text from analysis
      let text = `[Image: ${fileName}]\n\n`;
      text += `Description: ${analysis.description}\n`;
      
      if (analysis.detectedText) {
        text += `\nText found in image:\n${analysis.detectedText}\n`;
      }
      
      if (analysis.objects?.length) {
        text += `\nObjects/Elements: ${analysis.objects.join(', ')}\n`;
      }
      
      return {
        text,
        metadata: {
          title: fileName,
          hasVisualContent: true,
          imageCount: 1,
          imageDescriptions: [analysis.description],
          imageAnalysisEnabled: true,
        },
      };
    } catch (error: any) {
      console.error(`[DocProcessor] Image analysis failed for ${fileName}:`, error.message);
      return {
        text: `[Image: ${fileName}] (Analysis not available)`,
        metadata: {
          title: fileName,
          hasVisualContent: true,
          imageCount: 1,
        },
      };
    }
  }
  
  /**
   * Extract content WITH image analysis using GPT-4o vision
   * 
   * This method extracts text AND analyzes images, combining both into
   * searchable content for the Knowledge Base. Use this for documents
   * that contain important visual information (charts, diagrams, etc.)
   */
  static async extractContentWithImages(
    content: string | Buffer,
    mimeType: string,
    fileName: string,
    options: { enableImageAnalysis?: boolean; documentContext?: string } = {}
  ): Promise<{ 
    text: string; 
    metadata: Partial<DocumentMetadata>; 
    imageResult?: ImageProcessingResult;
  }> {
    const enableImages = options.enableImageAnalysis ?? process.env.KB_ENABLE_IMAGE_ANALYSIS !== 'false';
    
    // First, extract text content normally
    const baseResult = await this.extractContent(content, mimeType, fileName);
    
    // Check if this is a document type that can contain images
    const canHaveImages = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ].includes(mimeType);
    
    if (!canHaveImages || !enableImages || typeof content === 'string') {
      return baseResult;
    }
    
    // Process images
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const imageProcessor = getImageProcessor();
    
    if (!imageProcessor.isEnabled()) {
      console.log('[DocProcessor] Image analysis disabled or OpenAI not configured');
      return baseResult;
    }
    
    console.log(`[DocProcessor] Processing images from ${fileName}...`);
    
    try {
      const imageResult = await imageProcessor.processDocumentImages(
        buffer,
        mimeType,
        options.documentContext || baseResult.metadata.title
      );
      
      if (imageResult.imageCount > 0) {
        console.log(`[DocProcessor] Analyzed ${imageResult.imageCount} images (${imageResult.processingTime}ms)`);
        
        // Combine text with image descriptions
        const combinedText = baseResult.text + '\n' + imageResult.textContent;
        
        // Update metadata with image info
        const enhancedMetadata: Partial<DocumentMetadata> = {
          ...baseResult.metadata,
          imageCount: imageResult.imageCount,
          imageAnalysisEnabled: true,
          hasVisualContent: true,
          imageDescriptions: imageResult.analyses.map(a => a.description),
        };
        
        return {
          text: combinedText,
          metadata: enhancedMetadata,
          imageResult,
        };
      }
    } catch (error: any) {
      console.error(`[DocProcessor] Image processing error: ${error.message}`);
      // Fall back to text-only result
    }
    
    return baseResult;
  }
  
  /**
   * Process plain text content
   */
  private static processTextContent(
    text: string,
    mimeType: string,
    fileName: string
  ): { text: string; metadata: Partial<DocumentMetadata> } {
    // Clean up text
    const cleanedText = this.cleanText(text);
    
    // Extract title from first line or filename
    const lines = cleanedText.split('\n');
    const title = this.extractTitle(lines, fileName);
    
    return {
      text: cleanedText,
      metadata: {
        title,
        wordCount: cleanedText.split(/\s+/).length,
        language: this.detectLanguage(cleanedText),
      },
    };
  }
  
  /**
   * Extract text from PDF using pdf-parse
   */
  private static async extractFromPDF(
    buffer: Buffer,
    fileName: string
  ): Promise<{ text: string; metadata: Partial<DocumentMetadata> }> {
    try {
      // Use named import to handle module resolution
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      
      const cleanedText = this.cleanText(data.text);
      
      return {
        text: cleanedText,
        metadata: {
          title: data.info?.Title || fileName.replace('.pdf', ''),
          author: data.info?.Author,
          pageCount: data.numpages,
          wordCount: cleanedText.split(/\s+/).length,
          language: this.detectLanguage(cleanedText),
        },
      };
    } catch (error: any) {
      console.error('[DocProcessor] PDF extraction error:', error.message);
      return {
        text: '',
        metadata: { title: fileName },
      };
    }
  }
  
  /**
   * Extract text from DOCX (simplified - extracts XML text)
   */
  private static async extractFromDocx(
    buffer: Buffer,
    fileName: string
  ): Promise<{ text: string; metadata: Partial<DocumentMetadata> }> {
    try {
      // Try to import JSZip if available
      let JSZip: any;
      try {
        const jszip = await import('jszip');
        JSZip = jszip.default || jszip;
      } catch {
        console.warn('[DocProcessor] JSZip not installed, DOCX extraction limited');
        return { text: '', metadata: { title: fileName } };
      }
      
      const zip = await JSZip.loadAsync(buffer);
      
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (!docXml) {
        return { text: '', metadata: { title: fileName } };
      }
      
      // Extract text from XML tags
      const text = docXml
        .replace(/<\/?[^>]+(>|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      const cleanedText = this.cleanText(text);
      
      return {
        text: cleanedText,
        metadata: {
          title: fileName.replace('.docx', ''),
          wordCount: cleanedText.split(/\s+/).length,
          language: this.detectLanguage(cleanedText),
        },
      };
    } catch (error: any) {
      console.error('[DocProcessor] DOCX extraction error:', error.message);
      return { text: '', metadata: { title: fileName } };
    }
  }
  
  /**
   * Extract text from XLSX (simplified)
   */
  private static async extractFromXlsx(
    buffer: Buffer,
    fileName: string
  ): Promise<{ text: string; metadata: Partial<DocumentMetadata> }> {
    try {
      // Try to import JSZip if available
      let JSZip: any;
      try {
        const jszip = await import('jszip');
        JSZip = jszip.default || jszip;
      } catch {
        console.warn('[DocProcessor] JSZip not installed, XLSX extraction limited');
        return { text: '', metadata: { title: fileName } };
      }
      
      const zip = await JSZip.loadAsync(buffer);
      
      // Get shared strings
      const sharedStrings = await zip.file('xl/sharedStrings.xml')?.async('string');
      const strings: string[] = [];
      
      if (sharedStrings) {
        const matches = sharedStrings.match(/<t[^>]*>([^<]+)<\/t>/g) || [];
        matches.forEach((match: string) => {
          const text = match.replace(/<\/?t[^>]*>/g, '');
          if (text.trim()) strings.push(text.trim());
        });
      }
      
      // Get ALL sheet data (not just sheet1)
      const sheetFiles = Object.keys(zip.files).filter(f => 
        f.match(/^xl\/worksheets\/sheet\d+\.xml$/)
      ).sort();
      
      for (const sheetFile of sheetFiles) {
        const sheetData = await zip.file(sheetFile)?.async('string');
        if (sheetData) {
          const values = sheetData.match(/<v>([^<]+)<\/v>/g) || [];
          values.forEach((match: string) => {
            const text = match.replace(/<\/?v>/g, '');
            if (text.trim() && isNaN(Number(text))) strings.push(text.trim());
          });
        }
      }
      
      const text = strings.join('\n');
      const cleanedText = this.cleanText(text);
      
      return {
        text: cleanedText,
        metadata: {
          title: fileName.replace('.xlsx', ''),
          wordCount: cleanedText.split(/\s+/).length,
          language: this.detectLanguage(cleanedText),
        },
      };
    } catch (error: any) {
      console.error('[DocProcessor] XLSX extraction error:', error.message);
      return { text: '', metadata: { title: fileName } };
    }
  }
  
  /**
   * Process spreadsheet/CSV content
   */
  private static processSpreadsheet(
    content: string,
    fileName: string
  ): { text: string; metadata: Partial<DocumentMetadata> } {
    // Convert CSV to readable text
    const lines = content.split('\n');
    const textLines: string[] = [];
    
    lines.forEach((line, idx) => {
      const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (idx === 0) {
        // Header row
        textLines.push('Headers: ' + cells.join(' | '));
      } else {
        textLines.push(cells.join(' | '));
      }
    });
    
    const text = textLines.join('\n');
    const cleanedText = this.cleanText(text);
    
    return {
      text: cleanedText,
      metadata: {
        title: fileName.replace(/\.(csv|xlsx?)$/i, ''),
        wordCount: cleanedText.split(/\s+/).length,
        language: 'en',
      },
    };
  }
  
  /**
   * Clean and normalize text content
   */
  private static cleanText(text: string): string {
    return text
      // Normalize whitespace
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      // Remove excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Remove excessive spaces
      .replace(/ {2,}/g, ' ')
      // Remove control characters but KEEP Unicode (accented chars, symbols, etc.)
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Trim
      .trim();
  }
  
  /**
   * Extract title from content or filename
   */
  private static extractTitle(lines: string[], fileName: string): string {
    // Check first few lines for a title-like text
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i].trim();
      if (line.length > 0 && line.length < 100 && !line.includes('http')) {
        // Likely a title
        return line.replace(/^[#*]+\s*/, ''); // Remove markdown headers
      }
    }
    
    // Fall back to filename
    return fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  }
  
  /**
   * Simple language detection
   */
  private static detectLanguage(text: string): string {
    // Simple heuristic based on common words
    const lowerText = text.toLowerCase();
    const englishWords = ['the', 'and', 'is', 'in', 'to', 'of', 'a', 'for'];
    const spanishWords = ['el', 'la', 'de', 'en', 'que', 'y', 'es', 'un'];
    
    const englishCount = englishWords.filter(w => lowerText.includes(` ${w} `)).length;
    const spanishCount = spanishWords.filter(w => lowerText.includes(` ${w} `)).length;
    
    if (spanishCount > englishCount) return 'es';
    return 'en';
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // CHUNKING
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Split text into chunks suitable for embedding
   */
  static createChunks(
    text: string,
    documentId: string,
    documentName: string
  ): KBChunk[] {
    const chunks: KBChunk[] = [];
    
    if (!text || text.length < MIN_CHUNK_SIZE) {
      // Single chunk for short documents
      if (text && text.length > 0) {
        chunks.push(this.createChunk(text, documentId, 0, text.length, 0));
      }
      return chunks;
    }
    
    // Split by headings first (markdown # or all-caps lines), then paragraphs
    const sections = text.split(/(?=^#{1,3}\s|^[A-Z][A-Z\s]{5,}$)/m);
    let currentChunk = '';
    let chunkStart = 0;
    let chunkIndex = 0;
    let currentPosition = 0;
    
    for (const section of sections) {
      const paragraphs = section.split(/\n\n+/);
      
      for (const paragraph of paragraphs) {
        const trimmedPara = paragraph.trim();
        if (!trimmedPara) {
          currentPosition += paragraph.length + 2;
          continue;
        }
        
        // Check if adding this paragraph would exceed max chunk size
        if (currentChunk.length + trimmedPara.length > MAX_CHUNK_SIZE && currentChunk.length >= MIN_CHUNK_SIZE) {
          // Save current chunk
          chunks.push(this.createChunk(
            currentChunk.trim(),
            documentId,
            chunkStart,
            currentPosition,
            chunkIndex
          ));
          chunkIndex++;
          
          // Start new chunk with overlap (at word boundary)
          const overlapText = this.getWordBoundaryOverlap(currentChunk, CHUNK_OVERLAP);
          currentChunk = overlapText + '\n\n' + trimmedPara;
          chunkStart = Math.max(0, currentPosition - overlapText.length);
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
        }
        
        currentPosition += paragraph.length + 2;
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.trim().length >= MIN_CHUNK_SIZE) {
      chunks.push(this.createChunk(
        currentChunk.trim(),
        documentId,
        chunkStart,
        text.length,
        chunkIndex
      ));
    }
    
    console.log(`[DocProcessor] Created ${chunks.length} chunks from ${documentName} (${text.length} chars)`);
    
    return chunks;
  }
  
  /**
   * Get overlap text at a word boundary (don't cut mid-word)
   */
  private static getWordBoundaryOverlap(text: string, targetLength: number): string {
    if (text.length <= targetLength) return text;
    const slice = text.slice(-targetLength);
    // Find first space from the start of the slice
    const firstSpace = slice.indexOf(' ');
    if (firstSpace > 0 && firstSpace < targetLength / 2) {
      return slice.slice(firstSpace + 1);
    }
    return slice;
  }
  
  /**
   * Create a single chunk object
   */
  private static createChunk(
    content: string,
    documentId: string,
    startIndex: number,
    endIndex: number,
    index: number
  ): KBChunk {
    return {
      id: `${documentId}_chunk_${index}`,
      documentId,
      content,
      tokenCount: Math.ceil(content.length / 4), // Rough estimate: 4 chars per token
      metadata: {
        startIndex,
        endIndex,
        isHeader: /^#+\s/.test(content) || content.split('\n')[0]?.length < 80,
        isTable: content.includes('|') && (content.match(/\|/g)?.length || 0) > 4,
        isCode: content.includes('```') || content.includes('function ') || content.includes('const '),
      },
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // CLASSIFICATION
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Classify document category based on path and content
   */
  static classifyDocument(
    path: string,
    content: string,
    fileName: string
  ): {
    category: DocumentCategory;
    department?: string;
    product?: string;
    pharmacy?: string;
    tags: string[];
  } {
    const lowerPath = path.toLowerCase();
    const lowerContent = content.toLowerCase();
    const lowerName = fileName.toLowerCase();
    const tags: string[] = [];
    
    let category: DocumentCategory = 'general';
    let department: string | undefined;
    let product: string | undefined;
    let pharmacy: string | undefined;
    
    // Check path for category hints
    if (lowerPath.includes('department') || lowerPath.includes('1. department')) {
      category = 'department';
    } else if (lowerPath.includes('pharmac') || lowerPath.includes('2. pharmac')) {
      category = 'pharmacy';
    } else if (lowerPath.includes('product') || lowerPath.includes('3. product')) {
      category = 'product';
    } else if (lowerPath.includes('resource') || lowerPath.includes('4. resource')) {
      category = 'resource';
    } else if (lowerPath.includes('training') || lowerPath.includes('5. training')) {
      category = 'training';
    } else if (lowerPath.includes('policy') || lowerContent.includes('policy')) {
      category = 'policy';
    } else if (lowerPath.includes('procedure') || lowerContent.includes('procedure')) {
      category = 'procedure';
    } else if (lowerPath.includes('template')) {
      category = 'template';
    }
    
    // Detect product
    for (const [prod, keywords] of Object.entries(PRODUCT_KEYWORDS)) {
      if (keywords.some(kw => lowerName.includes(kw) || lowerPath.includes(kw))) {
        product = prod;
        tags.push(`product:${prod}`);
        break;
      }
    }
    
    // Detect pharmacy
    for (const [pharm, keywords] of Object.entries(PHARMACY_KEYWORDS)) {
      if (keywords.some(kw => lowerName.includes(kw) || lowerPath.includes(kw))) {
        pharmacy = pharm;
        tags.push(`pharmacy:${pharm}`);
        break;
      }
    }
    
    // Detect department
    for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
      if (keywords.some(kw => lowerPath.includes(kw))) {
        department = dept;
        tags.push(`department:${dept}`);
        break;
      }
    }
    
    // Add category tag
    tags.push(`category:${category}`);
    
    return { category, department, product, pharmacy, tags };
  }
  
  /**
   * Calculate estimated tokens for text
   */
  static estimateTokens(text: string): number {
    // OpenAI: roughly 4 characters per token for English
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Check if a MIME type is supported
   */
  static isSupported(mimeType: string): boolean {
    return isSupportedMimeType(mimeType);
  }
}

export default DocumentProcessor;
