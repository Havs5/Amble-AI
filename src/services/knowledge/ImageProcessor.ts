/**
 * Image Processor Service
 * 
 * Extracts images from documents (PDF, DOCX) and analyzes them using
 * GPT-4o vision capabilities to generate text descriptions for RAG.
 * 
 * This enables the Knowledge Base to understand and search visual content
 * within documents, including charts, diagrams, product images, and more.
 */

import OpenAI from 'openai';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExtractedImage {
  id: string;
  data: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  pageNumber?: number;
  width?: number;
  height?: number;
  caption?: string;
}

export interface ImageAnalysis {
  imageId: string;
  description: string;
  detectedText?: string;
  type: 'chart' | 'diagram' | 'photo' | 'screenshot' | 'table' | 'logo' | 'icon' | 'other';
  relevanceScore: number;
  objects?: string[];
  colors?: string[];
  context?: string;
}

export interface ImageProcessingResult {
  images: ExtractedImage[];
  analyses: ImageAnalysis[];
  textContent: string; // Combined text descriptions for RAG
  imageCount: number;
  processingTime: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION (can be overridden via environment variables)
// ═══════════════════════════════════════════════════════════════════════════════

// Vision model: 'gpt-5.2' (flagship), 'gpt-5.2-pro' (smartest), 'gpt-5-mini' (faster/cheaper)
const getVisionModel = () => process.env.KB_VISION_MODEL || 'gpt-5.2';

// Maximum images to analyze per document
const getMaxImagesPerDocument = () => parseInt(process.env.KB_MAX_IMAGES_PER_DOCUMENT || '20', 10);

// Maximum image file size in MB
const MAX_IMAGE_SIZE_MB = 10;

// Minimum image dimension to process (skip smaller icons)
const getMinImageDimension = () => parseInt(process.env.KB_MIN_IMAGE_DIMENSION || '50', 10);

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE PROCESSOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class ImageProcessor {
  private openai: OpenAI;
  private enabled: boolean;
  private model: string;
  private maxImages: number;
  private minDimension: number;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.enabled = !!apiKey && process.env.KB_ENABLE_IMAGE_ANALYSIS !== 'false';
    this.model = getVisionModel();
    this.maxImages = getMaxImagesPerDocument();
    this.minDimension = getMinImageDimension();
    
    this.openai = new OpenAI({
      apiKey: apiKey || 'dummy-key'
    });
    
    if (this.enabled) {
      console.log(`[ImageProcessor] Initialized with model: ${this.model}, max images: ${this.maxImages}`);
    }
  }

  /**
   * Check if image processing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Extract images from PDF document
   * 
   * Note: PDF image extraction is complex. This uses pdf-lib's low-level APIs
   * with type assertions since the library doesn't expose a simple extraction API.
   */
  async extractImagesFromPDF(buffer: Buffer): Promise<ExtractedImage[]> {
    const images: ExtractedImage[] = [];
    
    try {
      // Try to import pdf-lib
      let pdfLib: any;
      try {
        pdfLib = await import('pdf-lib');
      } catch {
        console.warn('[ImageProcessor] pdf-lib not installed, PDF image extraction limited');
        return images;
      }
      
      if (!pdfLib) return images;
      
      const { PDFDocument, PDFName } = pdfLib;
      const pdfDoc = await PDFDocument.load(buffer, { 
        ignoreEncryption: true,
        updateMetadata: false 
      });
      const pages = pdfDoc.getPages();
      
      console.log(`[ImageProcessor] Scanning ${pages.length} PDF pages for images...`);
      
      // Iterate through pages to find embedded images
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex] as any;
        
        try {
          // Access XObject resources which may contain images
          const resources = page.node?.get?.(PDFName.of('Resources'));
          if (!resources) continue;
          
          const xObjects = (resources as any).get?.(PDFName.of('XObject'));
          if (!xObjects) continue;
          
          // Extract image objects
          const keys: any[] = [];
          if (typeof xObjects.keys === 'function') {
            for (const k of xObjects.keys()) {
              keys.push(k);
            }
          }
          
          for (const key of keys) {
            try {
              const xObject = (xObjects as any).get?.(key);
              if (!xObject) continue;
              
              // Check if it's an image
              const subtype = (xObject as any).get?.(PDFName.of('Subtype'));
              if (!subtype || subtype.toString() !== '/Image') continue;
              
              // Get image data (raw stream contents)
              const stream = xObject as any;
              if (stream && stream.contents) {
                const imageData = Buffer.from(stream.contents);
                
                // Get dimensions
                const widthObj = (xObject as any).get?.(PDFName.of('Width'));
                const heightObj = (xObject as any).get?.(PDFName.of('Height'));
                const width = widthObj?.value || widthObj?.numberValue || 0;
                const height = heightObj?.value || heightObj?.numberValue || 0;
                
                // Skip small images (likely icons)
                if (width < this.minDimension || height < this.minDimension) {
                  continue;
                }
                
                // Determine image type
                let mimeType: ExtractedImage['mimeType'] = 'image/png';
                const filter = (xObject as any).get?.(PDFName.of('Filter'))?.toString();
                if (filter === '/DCTDecode') {
                  mimeType = 'image/jpeg';
                }
                
                images.push({
                  id: `pdf-p${pageIndex + 1}-${key.toString().replace(/\//g, '')}`,
                  data: imageData,
                  mimeType,
                  pageNumber: pageIndex + 1,
                  width,
                  height,
                });
                
                if (images.length >= this.maxImages) {
                  console.log(`[ImageProcessor] Reached max images (${this.maxImages})`);
                  break;
                }
              }
            } catch (e) {
              // Skip problematic images silently
              continue;
            }
          }
        } catch (pageError) {
          // Continue with next page
          continue;
        }
        
        if (images.length >= this.maxImages) break;
      }
      
      console.log(`[ImageProcessor] Found ${images.length} images in PDF`);
    } catch (error: any) {
      console.error('[ImageProcessor] PDF image extraction error:', error.message);
    }
    
    return images;
  }

  /**
   * Extract images from DOCX document
   */
  async extractImagesFromDocx(buffer: Buffer): Promise<ExtractedImage[]> {
    const images: ExtractedImage[] = [];
    
    try {
      let JSZip: any;
      try {
        const jszip = await import('jszip');
        JSZip = jszip.default || jszip;
      } catch {
        console.warn('[ImageProcessor] JSZip not installed, DOCX image extraction limited');
        return images;
      }
      
      const zip = await JSZip.loadAsync(buffer);
      
      // DOCX stores images in word/media/ folder
      const mediaFolder = zip.folder('word/media');
      if (!mediaFolder) return images;
      
      const imageFiles: string[] = [];
      mediaFolder.forEach((relativePath: string, file: any) => {
        if (!file.dir) {
          const ext = relativePath.toLowerCase().split('.').pop();
          if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) {
            imageFiles.push(`word/media/${relativePath}`);
          }
        }
      });
      
      // Extract each image
      for (let i = 0; i < Math.min(imageFiles.length, this.maxImages); i++) {
        const filePath = imageFiles[i];
        const file = zip.file(filePath);
        if (!file) continue;
        
        try {
          const data = await file.async('nodebuffer');
          const ext = filePath.toLowerCase().split('.').pop();
          
          // Check size
          if (data.length > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
            console.log(`[ImageProcessor] Skipping large image: ${filePath}`);
            continue;
          }
          
          let mimeType: ExtractedImage['mimeType'] = 'image/png';
          if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
          else if (ext === 'gif') mimeType = 'image/gif';
          else if (ext === 'webp') mimeType = 'image/webp';
          
          images.push({
            id: `docx-${i + 1}`,
            data,
            mimeType,
          });
        } catch (e) {
          continue;
        }
      }
    } catch (error: any) {
      console.error('[ImageProcessor] DOCX image extraction error:', error.message);
    }
    
    return images;
  }

  /**
   * Analyze a single image using GPT-4o vision
   */
  async analyzeImage(
    image: ExtractedImage,
    documentContext?: string
  ): Promise<ImageAnalysis> {
    if (!this.enabled) {
      return {
        imageId: image.id,
        description: '[Image analysis disabled]',
        type: 'other',
        relevanceScore: 0,
      };
    }

    try {
      // Convert image to base64 data URL
      const base64 = image.data.toString('base64');
      const dataUrl = `data:${image.mimeType};base64,${base64}`;
      
      const contextPrompt = documentContext 
        ? `This image is from a document about: ${documentContext}.`
        : '';
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert document analyst. Analyze images and provide detailed descriptions that can be used for text-based search and retrieval. Focus on:
1. What the image shows (objects, people, text, diagrams)
2. Any text visible in the image (OCR)
3. The type of content (chart, diagram, photo, screenshot, table, logo)
4. Key information that would be useful for understanding the document

Be concise but comprehensive. Extract ALL visible text accurately.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${contextPrompt} Analyze this image and provide:
1. A detailed description (2-4 sentences)
2. Any text visible in the image (exact transcription)
3. Image type (chart/diagram/photo/screenshot/table/logo/icon/other)
4. Key objects or elements detected
5. Relevance score (0-1) for document context

Format your response as JSON with these fields: description, detectedText, type, objects, relevanceScore`
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                  detail: 'high' // Use high detail for accurate OCR
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      });
      
      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      
      return {
        imageId: image.id,
        description: parsed.description || 'Image could not be analyzed',
        detectedText: parsed.detectedText,
        type: parsed.type || 'other',
        objects: parsed.objects,
        relevanceScore: parsed.relevanceScore ?? 0.5,
        context: documentContext,
      };
    } catch (error: any) {
      console.error('[ImageProcessor] Vision API error:', error.message);
      return {
        imageId: image.id,
        description: `[Image analysis failed: ${error.message}]`,
        type: 'other',
        relevanceScore: 0,
      };
    }
  }

  /**
   * Process all images from a document
   */
  async processDocumentImages(
    buffer: Buffer,
    mimeType: string,
    documentTitle?: string
  ): Promise<ImageProcessingResult> {
    const startTime = Date.now();
    let images: ExtractedImage[] = [];
    
    // Extract images based on document type
    if (mimeType === 'application/pdf') {
      images = await this.extractImagesFromPDF(buffer);
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      images = await this.extractImagesFromDocx(buffer);
    }
    
    console.log(`[ImageProcessor] Extracted ${images.length} images from document`);
    
    if (images.length === 0 || !this.enabled) {
      return {
        images: [],
        analyses: [],
        textContent: '',
        imageCount: 0,
        processingTime: Date.now() - startTime,
      };
    }
    
    // Analyze images in parallel (batched to avoid rate limits)
    const BATCH_SIZE = 5;
    const analyses: ImageAnalysis[] = [];
    
    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(img => this.analyzeImage(img, documentTitle))
      );
      analyses.push(...batchResults);
      
      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < images.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Generate text content from analyses for RAG
    const textContent = this.generateTextContent(analyses);
    
    return {
      images,
      analyses,
      textContent,
      imageCount: images.length,
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Generate searchable text content from image analyses
   */
  private generateTextContent(analyses: ImageAnalysis[]): string {
    if (analyses.length === 0) return '';
    
    const sections: string[] = [
      '\n\n--- VISUAL CONTENT ---\n',
      `This document contains ${analyses.length} image(s):\n`
    ];
    
    analyses.forEach((analysis, index) => {
      const parts: string[] = [
        `\n[Image ${index + 1}] (${analysis.type}): ${analysis.description}`
      ];
      
      if (analysis.detectedText) {
        parts.push(`Text in image: "${analysis.detectedText}"`);
      }
      
      if (analysis.objects && analysis.objects.length > 0) {
        parts.push(`Elements: ${analysis.objects.join(', ')}`);
      }
      
      sections.push(parts.join('\n'));
    });
    
    sections.push('\n--- END VISUAL CONTENT ---\n');
    
    return sections.join('\n');
  }

  /**
   * Estimate token cost for image analysis
   */
  estimateCost(imageCount: number): { tokens: number; estimatedCost: string } {
    // GPT-4o vision pricing: ~$0.01 per 1K input tokens for images
    // High detail images use ~765 tokens for 512x512, scaling up
    const avgTokensPerImage = 1000;
    const inputTokens = imageCount * avgTokensPerImage;
    const outputTokens = imageCount * 200; // ~200 tokens per analysis
    
    // GPT-4o pricing (approximate)
    const inputCost = (inputTokens / 1000) * 0.0025;
    const outputCost = (outputTokens / 1000) * 0.01;
    const totalCost = inputCost + outputCost;
    
    return {
      tokens: inputTokens + outputTokens,
      estimatedCost: `$${totalCost.toFixed(4)}`,
    };
  }

  /**
   * Analyze a standalone image from base64 data
   * Used for processing image files directly (jpg, png, etc.)
   */
  async analyzeImageBase64(
    base64Data: string,
    mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
    options?: { context?: string }
  ): Promise<ImageAnalysis> {
    if (!this.enabled) {
      return {
        imageId: 'standalone',
        description: '[Image analysis disabled - enable by setting OPENAI_API_KEY]',
        type: 'other',
        relevanceScore: 0,
      };
    }

    const documentContext = options?.context || '';

    try {
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      
      const contextPrompt = documentContext 
        ? `This image is from a document about: ${documentContext}.`
        : '';
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert document analyst. Analyze images and provide detailed descriptions that can be used for text-based search and retrieval. Focus on:
1. What the image shows (objects, people, text, diagrams)
2. Any text visible in the image (OCR)
3. The type of content (chart, diagram, photo, screenshot, table, logo)
4. Key information that would be useful for understanding the document

Be concise but comprehensive. Extract ALL visible text accurately.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${contextPrompt} Analyze this image and provide:
1. A detailed description (2-4 sentences)
2. Any text visible in the image (exact transcription)
3. Image type (chart/diagram/photo/screenshot/table/logo/icon/other)
4. Key objects or elements detected
5. Relevance score (0-1) for document context

Format your response as JSON with these fields: description, detectedText, type, objects, relevanceScore`
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      });
      
      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      
      return {
        imageId: 'standalone',
        description: parsed.description || 'Image could not be analyzed',
        detectedText: parsed.detectedText,
        type: parsed.type || 'other',
        objects: parsed.objects,
        relevanceScore: parsed.relevanceScore ?? 0.5,
        context: documentContext,
      };
    } catch (error: any) {
      console.error('[ImageProcessor] Vision API error:', error.message);
      return {
        imageId: 'standalone',
        description: `[Image analysis failed: ${error.message}]`,
        type: 'other',
        relevanceScore: 0,
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

let imageProcessorInstance: ImageProcessor | null = null;

export function getImageProcessor(): ImageProcessor {
  if (!imageProcessorInstance) {
    imageProcessorInstance = new ImageProcessor();
  }
  return imageProcessorInstance;
}
