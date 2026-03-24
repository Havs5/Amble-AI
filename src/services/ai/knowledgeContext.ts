/**
 * Knowledge Context Service
 * 
 * This service retrieves relevant context from Google Drive
 * for AI chat responses. It uses the real-time folder map
 * and fetches file content on-demand when needed.
 * 
 * AMBLE HEALTH KNOWLEDGE BASE STRUCTURE:
 * ├── 1. Departments
 * │   ├── Billing & Disputes
 * │   ├── Patient Experience
 * │   ├── Pharmacy Coordination  
 * │   ├── Send Blue
 * │   └── System & Provider Coordination
 * ├── 2. Pharmacies
 * │   ├── Absolute
 * │   ├── Align
 * │   ├── Boothwyn
 * │   ├── GoGo Meds
 * │   ├── Greenwich Rx
 * │   ├── Hallandale
 * │   ├── Link
 * │   ├── Partell
 * │   ├── Perfect Rx
 * │   ├── Pharmacy Hub
 * │   └── Revive
 * ├── 3. Products
 * │   ├── Acne
 * │   ├── Glutathione
 * │   ├── Lipo-C
 * │   ├── Lipotropic(MIC)+B12
 * │   ├── NAD
 * │   ├── Ondansetron
 * │   ├── PT-141
 * │   ├── Semaglutide
 * │   ├── Sermorelin
 * │   ├── Tesamorelin
 * │   └── Tirzepatide
 * ├── 4. Resources
 * └── 5. Training
 */

// Google Drive API for content extraction
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

// ==============================================================================
// AMBLE HEALTH KNOWLEDGE BASE FOLDER MAPPING
// ==============================================================================

// Main folder structure - matches the actual Google Drive KB folders
const KB_FOLDER_STRUCTURE = {
  departments: {
    path: '1. Departments',
    subfolders: ['Billing & Disputes', 'Patient Experience', 'Pharmacy Coordination', 'Send Blue', 'System & Provider Coordination']
  },
  pharmacies: {
    path: '2. Pharmacies',
    subfolders: ['Absolute', 'Align', 'Boothwyn', 'GoGo Meds', 'Greenwich Rx', 'Hallandale', 'Link', 'Partell', 'Perfect Rx', 'Pharmacy Hub', 'Revive']
  },
  products: {
    path: '3. Products',
    subfolders: ['Acne', 'Glutathione', 'Lipo-C', 'Lipotropic(MIC)+B12', 'NAD', 'Ondansetron', 'PT-141', 'Semaglutide', 'Sermorelin', 'Tesamorelin', 'Tirzepatide']
  },
  resources: {
    path: '4. Resources',
    subfolders: []
  },
  training: {
    path: '5. Training',
    subfolders: []
  }
};

// Pharmacy name mapping with aliases
const PHARMACY_ALIASES: Record<string, string[]> = {
  'absolute': ['absolute', 'absolute pharmacy'],
  'align': ['align', 'align pharmacy', 'align rx'],
  'boothwyn': ['boothwyn', 'boothwyn pharmacy'],
  'gogo meds': ['gogo', 'gogo meds', 'go go meds', 'gogomeds'],
  'greenwich rx': ['greenwich', 'greenwich rx', 'greenwich pharmacy'],
  'hallandale': ['hallandale', 'hallandale pharmacy'],
  'link': ['link', 'link pharmacy'],
  'partell': ['partell', 'partell pharmacy'],
  'perfect rx': ['perfect', 'perfect rx', 'perfectrx'],
  'pharmacy hub': ['pharmacy hub', 'pharmacyhub', 'hub pharmacy'],
  'revive': ['revive', 'revive pharmacy', 'revive rx']
};

// Product name mapping with aliases and brand names
const PRODUCT_ALIASES: Record<string, string[]> = {
  'tirzepatide': ['tirzepatide', 'mounjaro', 'zepbound', 'tirz'],
  'semaglutide': ['semaglutide', 'ozempic', 'wegovy', 'rybelsus', 'sema'],
  'sermorelin': ['sermorelin', 'sermorelin acetate'],
  'tesamorelin': ['tesamorelin', 'egrifta'],
  'pt-141': ['pt-141', 'pt141', 'bremelanotide'],
  'ondansetron': ['ondansetron', 'zofran', 'anti-nausea'],
  'nad': ['nad', 'nad+', 'nicotinamide adenine dinucleotide'],
  'lipotropic': ['lipotropic', 'mic', 'mic b12', 'mic+b12', 'lipotropic injection'],
  'lipo-c': ['lipo-c', 'lipoc', 'lipo c'],
  'glutathione': ['glutathione', 'gsh'],
  'acne': ['acne', 'acne treatment', 'acne medication']
};

// Department keywords for query analysis - MAPPED TO AMBLE HEALTH KB STRUCTURE
const DEPARTMENT_KEYWORDS: Record<string, string[]> = {
  // Maps to "1. Departments" folder
  billing: ['billing', 'disputes', 'invoice', 'payment', 'charge', 'refund', 'credit', 'fee', 'price', 'cost', 'debit', 'balance', 'account', 'chargeback'],
  patientExperience: ['patient', 'experience', 'customer', 'support', 'help', 'service', 'care', 'inquiry', 'satisfaction', 'call', 'contact'],
  pharmacyCoordination: ['pharmacy coordination', 'rx coordination', 'prescription', 'compounding'],
  sendblue: ['send blue', 'sendblue', 'sms', 'text message', 'messaging', 'text communication', 'patient outreach'],
  systemErrorsProviderCoordination: ['system error', 'system errors', 'provider', 'provider coordination', 'system coordination', 'integration', 'troubleshooting', 'bug', 'technical'],
  
  // Maps to "2. Pharmacies" folder
  pharmacy: [...Object.values(PHARMACY_ALIASES).flat()],
  
  // Maps to "3. Products" folder  
  products: [...Object.values(PRODUCT_ALIASES).flat(), 'medication', 'compound', 'vial', 'dosage', 'injection', 'glp-1', 'glp1', 'weight loss', 'peptide'],
  
  // Maps to "4. Resources" and "5. Training"
  resources: ['resources', 'reference', 'documentation', 'policy', 'policies', 'form', 'template'],
  training: ['training', 'onboarding', 'guide', 'how to', 'tutorial', 'procedure', 'sop', 'process']
};

// Folder map entry structure (matches GoogleDriveContext) - WITH PRE-CACHED CONTENT
export interface FolderMapEntry {
  id: string;
  name: string;
  path: string;
  type: 'folder' | 'file';
  mimeType?: string;
  keywords: string[];
  department?: string;
  content?: string; // Pre-extracted content from indexing
  contentExtracted?: boolean;
}

export interface KnowledgeContextResult {
  hasRelevantContent: boolean;
  context: string;
  sources: {
    fileName: string;
    fileId: string;
    path: string;
    department?: string;
    relevanceScore: number;
  }[];
  departments: string[];
  products: string[];
}

/**
 * Detect departments mentioned in a query
 */
export function detectQueryDepartments(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const departments: string[] = [];
  
  for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
    if (dept !== 'products' && dept !== 'pharmacy' && keywords.some(kw => lowerQuery.includes(kw))) {
      departments.push(dept);
    }
  }
  
  // Check for pharmacy mentions
  for (const [pharmacy, aliases] of Object.entries(PHARMACY_ALIASES)) {
    if (aliases.some(alias => lowerQuery.includes(alias))) {
      departments.push('pharmacy');
      break;
    }
  }
  
  return [...new Set(departments)]; // Remove duplicates
}

/**
 * Detect products mentioned in a query - uses product aliases for better matching
 */
export function detectQueryProducts(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const products: string[] = [];
  
  // Check product aliases
  for (const [product, aliases] of Object.entries(PRODUCT_ALIASES)) {
    if (aliases.some(alias => lowerQuery.includes(alias))) {
      products.push(product);
    }
  }
  
  return [...new Set(products)]; // Remove duplicates
}

/**
 * Detect which pharmacy is being asked about
 */
function detectPharmacy(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  for (const [pharmacy, aliases] of Object.entries(PHARMACY_ALIASES)) {
    if (aliases.some(alias => lowerQuery.includes(alias))) {
      return pharmacy;
    }
  }
  
  return null;
}

/**
 * Get the canonical product name from an alias
 */
function getCanonicalProductName(queryWord: string): string | null {
  const lowerWord = queryWord.toLowerCase();
  
  for (const [product, aliases] of Object.entries(PRODUCT_ALIASES)) {
    if (aliases.some(alias => lowerWord.includes(alias) || alias.includes(lowerWord))) {
      return product;
    }
  }
  
  return null;
}

/**
 * Calculate relevance score for a file based on query
 */
function calculateRelevanceScore(
  entry: FolderMapEntry,
  query: string,
  queryDepts: string[],
  queryProducts: string[]
): number {
  let score = 0;
  const lowerQuery = query.toLowerCase();
  const lowerName = entry.name.toLowerCase();
  const lowerPath = entry.path.toLowerCase();
  
  // Get individual words from query (min 3 chars)
  const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
  
  // ==== PRODUCT MATCHING (HIGHEST PRIORITY) ====
  // Check if this file is in the Products folder and matches a queried product
  const isInProductsFolder = lowerPath.includes('products') || lowerPath.includes('3. products');
  
  for (const product of queryProducts) {
    // EXACT PRODUCT FOLDER/FILE MATCH (e.g., "Tirzepatide" folder for "tirzepatide" query)
    if (lowerName === product || lowerName.startsWith(product)) {
      score += 300; // Highest priority - exact product match
      console.log(`[KB Score] EXACT PRODUCT: ${entry.name} = ${product} (+300)`);
    }
    // File name contains product name
    else if (lowerName.includes(product)) {
      score += 200;
      console.log(`[KB Score] PRODUCT IN NAME: ${entry.name} contains ${product} (+200)`);
    }
    // File is in product's folder
    else if (lowerPath.includes(product)) {
      score += 150;
      console.log(`[KB Score] IN PRODUCT FOLDER: ${entry.path} contains ${product} (+150)`);
    }
  }
  
  // Check brand name matches (ozempic -> semaglutide, mounjaro -> tirzepatide)
  for (const word of queryWords) {
    const canonical = getCanonicalProductName(word);
    if (canonical && (lowerName.includes(canonical) || lowerPath.includes(canonical))) {
      score += 200;
      console.log(`[KB Score] BRAND→PRODUCT: ${word} → ${canonical} in ${entry.name} (+200)`);
    }
  }
  
  // ==== PHARMACY MATCHING ====
  const queriedPharmacy = detectPharmacy(query);
  if (queriedPharmacy) {
    // Check if file is in the pharmacy's folder
    const pharmacyLower = queriedPharmacy.toLowerCase();
    if (lowerPath.includes(pharmacyLower) || lowerName.includes(pharmacyLower)) {
      score += 250;
      console.log(`[KB Score] PHARMACY MATCH: ${entry.name} for ${queriedPharmacy} (+250)`);
    }
  }
  
  // ==== FOLDER STRUCTURE BOOST ====
  if (isInProductsFolder && queryProducts.length > 0) {
    score += 50; // General boost for products folder when asking about products
  }
  if ((lowerPath.includes('pharmacies') || lowerPath.includes('2. pharmacies')) && queryDepts.includes('pharmacy')) {
    score += 50; // General boost for pharmacies folder when asking about pharmacies
  }
  if ((lowerPath.includes('departments') || lowerPath.includes('1. departments')) && queryDepts.length > 0) {
    score += 30;
  }
  
  // ==== DIRECT FILE NAME MATCH ====
  for (const word of queryWords) {
    if (lowerName === word || lowerName === word + '.docx' || lowerName === word + '.pdf') {
      score += 150;
      console.log(`[KB Score] EXACT NAME MATCH: ${entry.name} = ${word} (+150)`);
    }
    else if (lowerName.includes(word) && word.length >= 4) {
      score += 80;
    }
  }
  
  // Exact phrase match in name
  if (lowerName.includes(lowerQuery)) {
    score += 100;
  }
  
  // Word matches in path
  for (const word of queryWords) {
    if (lowerPath.includes(word)) score += 20;
  }
  
  // Department match from entry metadata
  if (entry.department && queryDepts.includes(entry.department)) {
    score += 50;
  }
  
  // Keyword matches from file metadata
  for (const keyword of entry.keywords) {
    if (queryWords.some(qw => keyword.includes(qw) || qw.includes(keyword))) {
      score += 15;
    }
  }
  
  return score;
}

export class KnowledgeContextService {
  
  /**
   * Retrieves relevant knowledge context for a user query
   * Uses the folder map passed from the client and fetches content in real-time
   */
  static async getContextForQuery(
    query: string, 
    accessToken?: string,
    folderMap?: FolderMapEntry[]
  ): Promise<KnowledgeContextResult> {
    const startTime = Date.now();
    
    // Analyze the query
    const departments = detectQueryDepartments(query);
    const products = detectQueryProducts(query);
    
    console.log('[KB Context] ====== KNOWLEDGE BASE QUERY ======');
    console.log('[KB Context] Query:', query);
    console.log('[KB Context] Detected departments:', departments);
    console.log('[KB Context] Detected products:', products);
    console.log('[KB Context] Folder map received:', folderMap ? `${folderMap.length} entries` : 'NONE');
    console.log('[KB Context] Access token:', accessToken ? 'YES' : 'NO');
    
    if (!folderMap || folderMap.length === 0) {
      console.log('[KB Context] ❌ No folder map provided - cannot search KB');
      return {
        hasRelevantContent: false,
        context: '',
        sources: [],
        departments,
        products,
      };
    }
    
    // Score and filter files
    const fileEntries = folderMap.filter(entry => entry.type === 'file');
    console.log('[KB Context] Files to search:', fileEntries.length);
    
    // Log first few file names for debugging
    console.log('[KB Context] Sample files:', fileEntries.slice(0, 5).map(f => f.name));
    
    const scoredFiles = fileEntries
      .map(entry => ({
        entry,
        score: calculateRelevanceScore(entry, query, departments, products)
      }))
      .filter(sf => sf.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    
    console.log('[KB Context] Files with score > 0:', scoredFiles.length);
    if (scoredFiles.length > 0) {
      console.log('[KB Context] Top matches:', scoredFiles.map(sf => ({ name: sf.entry.name, score: sf.score, hasContent: !!sf.entry.content })));
    }
    
    if (scoredFiles.length === 0) {
      console.log('[KB Context] ❌ No relevant files found in KB');
      return {
        hasRelevantContent: false,
        context: '',
        sources: [],
        departments,
        products,
      };
    }
    
    console.log('[KB Context] ✅ Found', scoredFiles.length, 'relevant files');
    
    // Build sources list
    const sources = scoredFiles.map(sf => ({
      fileName: sf.entry.name,
      fileId: sf.entry.id,
      path: sf.entry.path,
      department: sf.entry.department,
      relevanceScore: sf.score,
    }));
    
    // Get content from folder map entries — extract on-the-fly if needed
    const entriesWithContent: { entry: FolderMapEntry; content?: string; score: number }[] = [];
    
    console.log('[KB Context] Building content for top matches...');
    
    // Process top 5 files — use cached content or extract on-the-fly
    const top5 = scoredFiles.slice(0, 5);
    const extractionPromises = top5.map(async (sf) => {
      console.log(`[KB Context] File: ${sf.entry.name}`);
      console.log(`[KB Context]   - Has pre-cached content: ${!!sf.entry.content}`);
      
      // If we already have content, use it
      if (sf.entry.content && sf.entry.content.trim().length > 0) {
        console.log(`[KB Context]   - Using cached content (${sf.entry.content.length} chars)`);
        return { entry: sf.entry, content: sf.entry.content, score: sf.score };
      }
      
      // No cached content — try real-time extraction if we have an access token
      if (accessToken && sf.entry.mimeType && isTextExtractable(sf.entry.mimeType)) {
        console.log(`[KB Context]   - No cached content, extracting on-the-fly (${sf.entry.mimeType})...`);
        try {
          const extracted = await extractFileContent(sf.entry.id, sf.entry.mimeType, accessToken, sf.entry.name);
          if (extracted && extracted.trim().length > 0) {
            console.log(`[KB Context]   - ✅ Extracted ${extracted.length} chars from ${sf.entry.name}`);
            return { entry: sf.entry, content: extracted, score: sf.score };
          }
        } catch (err) {
          console.error(`[KB Context]   - ❌ Extraction failed for ${sf.entry.name}:`, err);
        }
      } else if (!accessToken) {
        console.log(`[KB Context]   - ⚠️ No access token, cannot extract content`);
      }
      
      return { entry: sf.entry, content: sf.entry.content, score: sf.score };
    });
    
    const resolvedEntries = await Promise.allSettled(extractionPromises);
    for (const result of resolvedEntries) {
      if (result.status === 'fulfilled') {
        entriesWithContent.push(result.value);
      }
    }
    
    // Log summary
    const filesWithContent = entriesWithContent.filter(e => e.content).length;
    console.log(`[KB Context] ✅ ${filesWithContent}/${entriesWithContent.length} files have content (cached or extracted)`);
    
    // Build context prompt
    const context = buildKnowledgeContextPrompt(entriesWithContent, departments, products);
    
    console.log('[KB Context] Context built in', Date.now() - startTime, 'ms');
    
    return {
      hasRelevantContent: entriesWithContent.length > 0,
      context,
      sources,
      departments,
      products,
    };
  }
}

/**
 * Checks if a file type can have its content extracted
 * Now supports ALL common file types including PDFs, Office docs, images
 */
function isTextExtractable(mimeType?: string): boolean {
  if (!mimeType) return false;
  
  const extractableTypes = [
    // Google Workspace
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
    
    // Microsoft Office
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/msword', // .doc
    'application/vnd.ms-excel', // .xls
    'application/vnd.ms-powerpoint', // .ppt
    
    // PDFs
    'application/pdf',
    
    // Text formats
    'text/plain',
    'text/csv',
    'text/markdown',
    'text/html',
    'application/json',
    'application/xml',
    'text/xml',
    
    // Images (for OCR via Gemini Vision)
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
  ];
  
  return extractableTypes.includes(mimeType) || 
         mimeType.startsWith('text/') ||
         mimeType.startsWith('image/');
}

/**
 * Extracts content from a Google Drive file - supports ALL file types
 * - Google Docs/Sheets/Slides: Export as text
 * - PDFs: Download and extract text via Gemini
 * - Office docs: Download and extract via Gemini
 * - Images: OCR via Gemini Vision
 * - Text files: Direct download
 */
async function extractFileContent(
  fileId: string, 
  mimeType: string, 
  accessToken: string,
  fileName?: string
): Promise<string | null> {
  try {
    console.log(`[KB Extract] Processing file: ${fileName || fileId}, type: ${mimeType}`);
    
    // ===== GOOGLE WORKSPACE FILES =====
    // These can be exported directly as text
    if (mimeType === 'application/vnd.google-apps.document') {
      return await fetchGoogleExport(fileId, 'text/plain', accessToken, 'Google Doc');
    }
    
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      return await fetchGoogleExport(fileId, 'text/csv', accessToken, 'Google Sheet');
    }
    
    if (mimeType === 'application/vnd.google-apps.presentation') {
      return await fetchGoogleExport(fileId, 'text/plain', accessToken, 'Google Slides');
    }
    
    // ===== PLAIN TEXT FILES =====
    if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml') {
      return await fetchDirectContent(fileId, accessToken, 'Text file');
    }
    
    // ===== BINARY FILES THAT NEED AI EXTRACTION =====
    // PDFs, Office docs, and images need to be processed via Gemini
    const binaryTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
    ];
    
    if (binaryTypes.includes(mimeType) || mimeType.startsWith('image/')) {
      return await extractWithGemini(fileId, mimeType, accessToken, fileName);
    }
    
    console.log(`[KB Extract] Unsupported mimeType: ${mimeType}`);
    return null;
    
  } catch (error) {
    console.error('[KB Extract] Content extraction error:', error);
    return null;
  }
}

/**
 * Fetch Google Workspace file export
 */
async function fetchGoogleExport(
  fileId: string, 
  exportMime: string, 
  accessToken: string, 
  fileType: string
): Promise<string | null> {
  const url = `${DRIVE_API_BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
  console.log(`[KB Extract] Exporting ${fileType}...`);
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  
  if (response.ok) {
    const text = await response.text();
    console.log(`[KB Extract] ✅ ${fileType}: Got ${text.length} chars`);
    return text;
  } else {
    await logFetchError(response, fileType);
    return null;
  }
}

/**
 * Fetch direct file content (for text files)
 */
async function fetchDirectContent(
  fileId: string, 
  accessToken: string, 
  fileType: string
): Promise<string | null> {
  const url = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;
  console.log(`[KB Extract] Downloading ${fileType}...`);
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  
  if (response.ok) {
    const text = await response.text();
    console.log(`[KB Extract] ✅ ${fileType}: Got ${text.length} chars`);
    return text;
  } else {
    await logFetchError(response, fileType);
    return null;
  }
}

/**
 * Extract content from binary files (PDFs, Office docs, images) using Gemini
 * Downloads the file and sends to Gemini for text extraction
 */
async function extractWithGemini(
  fileId: string, 
  mimeType: string, 
  accessToken: string,
  fileName?: string
): Promise<string | null> {
  try {
    // Download the file as binary
    const url = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;
    console.log(`[KB Extract] Downloading binary file for Gemini extraction...`);
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      await logFetchError(response, 'Binary file');
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const fileSizeKB = Math.round(arrayBuffer.byteLength / 1024);
    
    console.log(`[KB Extract] Downloaded ${fileSizeKB}KB, sending to Gemini...`);
    
    // Use Gemini to extract text from the file
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error('[KB Extract] No Gemini API key available for extraction');
      return null;
    }
    
    // Determine the extraction prompt based on file type
    let extractionPrompt: string;
    if (mimeType.startsWith('image/')) {
      extractionPrompt = `Extract ALL text visible in this image. If it's a document, extract all the content. If it's a chart or diagram, describe what it shows including any numbers, labels, and data. Be thorough and accurate. Output only the extracted content, no commentary.`;
    } else if (mimeType === 'application/pdf') {
      extractionPrompt = `Extract ALL text content from this PDF document. Include all headings, paragraphs, lists, tables, and any other text. Preserve the structure as much as possible. Output only the extracted content.`;
    } else {
      extractionPrompt = `Extract ALL text content from this document. Include all headings, paragraphs, lists, tables, and any other text. Preserve the structure. Output only the extracted content.`;
    }
    
    // Call Gemini API with the file
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: extractionPrompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192
        }
      })
    });
    
    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error(`[KB Extract] Gemini extraction failed: ${geminiResponse.status}`, errText.substring(0, 300));
      return null;
    }
    
    const geminiResult = await geminiResponse.json();
    const extractedText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (extractedText) {
      console.log(`[KB Extract] ✅ Gemini extracted ${extractedText.length} chars from ${fileName || mimeType}`);
      return extractedText;
    }
    
    console.log('[KB Extract] ⚠️ Gemini returned no text');
    return null;
    
  } catch (error) {
    console.error('[KB Extract] Gemini extraction error:', error);
    return null;
  }
}

/**
 * Log fetch error details
 */
async function logFetchError(response: Response, fileType: string) {
  const errorText = await response.text();
  console.error(`[KB Extract] ❌ ${fileType} HTTP ${response.status}: ${errorText.substring(0, 200)}`);
  
  if (response.status === 401 || response.status === 403) {
    console.error('[KB Extract] ❌ ACCESS TOKEN EXPIRED OR INVALID');
  }
}

/**
 * Builds the knowledge context prompt for the AI
 */
function buildKnowledgeContextPrompt(
  entriesWithContent: { entry: FolderMapEntry; content?: string; score: number }[], 
  departments: string[], 
  products: string[]
): string {
  let prompt = `
═══════════════════════════════════════════════════════════════
📚 AMBLE HEALTH KNOWLEDGE BASE
═══════════════════════════════════════════════════════════════

You have access to Amble Health's internal Knowledge Base organized as follows:

📁 **1. Departments** - Internal team procedures and guidelines
   └── Billing & Disputes, Patient Experience, Pharmacy Coordination, Send Blue, System & Provider Coordination

📁 **2. Pharmacies** - Partner pharmacy information and protocols
   └── Absolute, Align, Boothwyn, GoGo Meds, Greenwich Rx, Hallandale, Link, Partell, Perfect Rx, Pharmacy Hub, Revive

📁 **3. Products** - Medication and compound information
   └── Acne, Glutathione, Lipo-C, Lipotropic(MIC)+B12, NAD, Ondansetron, PT-141, Semaglutide, Sermorelin, Tesamorelin, Tirzepatide

📁 **4. Resources** - Reference materials and documentation

📁 **5. Training** - Onboarding and training guides

--- RELEVANT DOCUMENTS FOUND ---
`;

  if (departments.length > 0) {
    prompt += `\n🏢 Query relates to: ${departments.join(', ')}\n`;
  }
  
  if (products.length > 0) {
    prompt += `💊 Products mentioned: ${products.join(', ')}\n`;
  }
  
  for (const { entry, content, score } of entriesWithContent) {
    prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    prompt += `📄 **${entry.name}** (Relevance: ${score})\n`;
    prompt += `📁 Path: ${entry.path}\n`;
    
    if (content) {
      // Truncate long content
      const truncatedContent = content.length > 5000 
        ? content.substring(0, 5000) + '\n...[content truncated]'
        : content;
      prompt += `\n📝 **Document Content:**\n\`\`\`\n${truncatedContent}\n\`\`\`\n`;
    } else {
      prompt += `\n⚠️ File content not available for this file type (may be PDF, image, or binary file)\n`;
    }
  }
  
  prompt += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF KNOWLEDGE BASE DOCUMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ CRITICAL INSTRUCTIONS:
1. USE THE DOCUMENT CONTENT ABOVE as your PRIMARY source of truth
2. If specific prices, procedures, or policies are in the document, quote them EXACTLY
3. ALWAYS cite the document name: "According to [Document Name]..."
4. If the KB doesn't have the info needed, say "This isn't covered in the current Knowledge Base documentation" then provide general guidance
5. For medication questions, always recommend consulting the specific product document and healthcare providers
`;

  return prompt;
}
