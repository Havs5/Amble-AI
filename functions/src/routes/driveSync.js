/**
 * Google Drive KB Sync Handler
 * 
 * Syncs documents from Google Drive to Firestore KB collections
 * using the user's OAuth access token.
 * 
 * POST /api/knowledge/drive-sync
 */

const https = require('https');

// ============================================================================
// Constants
// ============================================================================

const DRIVE_API = 'www.googleapis.com';
const ROOT_FOLDER_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_ROOT_FOLDER_ID || '1dScQA7J2EbQw90zJnItUnJT2izPzyCL7';

// Supported MIME types for content extraction
const SUPPORTED_TYPES = {
  'application/vnd.google-apps.document': 'text/plain',        // Google Docs
  'application/vnd.google-apps.spreadsheet': 'text/csv',       // Google Sheets
  'application/vnd.google-apps.presentation': 'text/plain',    // Google Slides
  'application/pdf': null,                                      // PDF (native)
  'text/plain': null,                                           // Plain text
  'text/markdown': null,                                        // Markdown
  'text/csv': null,                                             // CSV
  'text/xml': null,                                             // XML
  'application/xml': null,                                      // XML
  'application/json': null,                                     // JSON
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': null, // DOCX
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': null,       // XLSX
  // Image types - will be analyzed using vision capabilities
  'image/jpeg': 'image',                                        // JPEG
  'image/png': 'image',                                         // PNG
  'image/gif': 'image',                                         // GIF
  'image/webp': 'image',                                        // WebP
};

// Category mapping based on folder structure
const CATEGORY_MAP = {
  '1. Departments': 'departments',
  '2. Pharmacies': 'pharmacies', 
  '3. Products': 'products',
  '4. Resources': 'resources',
  '5. Training': 'training',
};

// ============================================================================
// Helpers
// ============================================================================

function makeRequest(path, accessToken, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: DRIVE_API,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data); // Plain text response
          }
        } else {
          reject(new Error(`Drive API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function listFiles(folderId, accessToken) {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = 'files(id,name,mimeType,webViewLink,modifiedTime)';
  const path = `/drive/v3/files?q=${query}&fields=${fields}&pageSize=100`;
  
  const result = await makeRequest(path, accessToken);
  return result.files || [];
}

async function exportFile(fileId, mimeType, exportMimeType, accessToken) {
  try {
    if (exportMimeType) {
      // Google Workspace file - export as text
      const path = `/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`;
      
      return new Promise((resolve, reject) => {
        const options = {
          hostname: DRIVE_API,
          port: 443,
          path: path,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              console.log(`[DriveSync] Export failed for ${fileId}: ${res.statusCode}`);
              resolve('');
            }
          });
        });

        req.on('error', () => resolve(''));
        req.end();
      });
    } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      // Plain text - download directly
      const path = `/drive/v3/files/${fileId}?alt=media`;
      
      return new Promise((resolve, reject) => {
        const options = {
          hostname: DRIVE_API,
          port: 443,
          path: path,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });

        req.on('error', () => resolve(''));
        req.end();
      });
    }
    
    return '';
  } catch (error) {
    console.log(`[DriveSync] Error exporting ${fileId}:`, error.message);
    return '';
  }
}

function categorizeFile(path) {
  const parts = path.split('/');
  const rootFolder = parts[0] || '';
  
  for (const [folder, category] of Object.entries(CATEGORY_MAP)) {
    if (rootFolder.includes(folder) || rootFolder === folder.split('. ')[1]) {
      return {
        category,
        department: parts[1] || '',
        subcategory: parts[2] || '',
      };
    }
  }
  
  return { category: 'general', department: '', subcategory: '' };
}

// ============================================================================
// Main Sync Handler
// ============================================================================

async function handleDriveSync(req, res, { adminDb, writeJson, readJsonBody }) {
  console.log('[DriveSync] POST /api/knowledge/drive-sync called');
  
  try {
    // Get Google access token from request
    const body = await readJsonBody(req);
    const { accessToken, folderId } = body;
    
    // Use provided folderId or fall back to default
    const targetFolderId = folderId || ROOT_FOLDER_ID;
    
    if (!accessToken) {
      return writeJson(res, 400, { error: 'Google access token is required' });
    }

    // Verify Firebase auth
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return writeJson(res, 401, { error: 'Firebase auth required' });
    }

    const firebaseToken = authHeader.substring(7);
    let userId;
    
    try {
      const admin = require('firebase-admin');
      const decoded = await admin.auth().verifyIdToken(firebaseToken);
      userId = decoded.uid;
      
      // Verify user exists (no admin check - any authenticated user can sync)
      const userDoc = await adminDb.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        console.log(`[DriveSync] User ${userId} not found, allowing sync anyway`);
      }
    } catch (authError) {
      return writeJson(res, 401, { error: 'Invalid Firebase token' });
    }

    console.log(`[DriveSync] Starting sync for user ${userId}, folder ${targetFolderId}`);

    // Recursively list and process files
    const processedDocs = [];
    const errors = [];
    
    async function processFolder(folderId, folderPath = '') {
      const files = await listFiles(folderId, accessToken);
      
      for (const file of files) {
        const filePath = folderPath ? `${folderPath}/${file.name}` : file.name;
        
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          // Recursively process subfolder
          await processFolder(file.id, filePath);
        } else if (SUPPORTED_TYPES.hasOwnProperty(file.mimeType)) {
          // Extract content from supported file types
          try {
            const exportMimeType = SUPPORTED_TYPES[file.mimeType];
            const content = await exportFile(file.id, file.mimeType, exportMimeType, accessToken);
            
            if (content && content.trim().length > 10) {
              const { category, department, subcategory } = categorizeFile(filePath);
              
              // Store document in kb_documents
              const docRef = adminDb.collection('kb_documents').doc(file.id);
              const docData = {
                id: file.id,
                title: file.name,
                content: content.substring(0, 50000), // Limit content size
                sourcePath: filePath,
                mimeType: file.mimeType,
                modifiedTime: file.modifiedTime,
                category,
                department,
                subcategory,
                webViewLink: file.webViewLink,
                syncedAt: new Date().toISOString(),
                syncedBy: userId,
              };
              
              await docRef.set(docData);
              
              // Create searchable chunks in kb_chunks
              const chunkSize = 1000;
              const cleanContent = content.replace(/\s+/g, ' ').trim();
              const chunks = [];
              
              for (let i = 0; i < cleanContent.length; i += chunkSize - 100) {
                const chunk = cleanContent.slice(i, i + chunkSize);
                if (chunk.length >= 50) {
                  chunks.push(chunk);
                }
              }
              
              // Store chunks (without embeddings for now - keyword search works)
              for (let i = 0; i < chunks.length; i++) {
                const chunkRef = adminDb.collection('kb_chunks').doc(`${file.id}_chunk_${i}`);
                await chunkRef.set({
                  documentId: file.id,
                  documentName: file.name,
                  content: chunks[i],
                  chunkIndex: i,
                  totalChunks: chunks.length,
                  sourcePath: filePath,
                  category,
                  department,
                  subcategory,
                  createdAt: new Date().toISOString(),
                });
              }
              
              processedDocs.push({
                name: file.name,
                path: filePath,
                category,
                chunks: chunks.length,
              });
              
              console.log(`[DriveSync] Processed: ${filePath} (${chunks.length} chunks)`);
            }
          } catch (fileError) {
            console.log(`[DriveSync] Error processing ${file.name}:`, fileError.message);
            errors.push({ file: file.name, error: fileError.message });
          }
        }
      }
    }

    // Start processing from root folder
    await processFolder(targetFolderId);

    // Update sync state
    await adminDb.collection('kb_sync_state').doc('latest').set({
      lastSync: new Date().toISOString(),
      syncedBy: userId,
      totalDocuments: processedDocs.length,
      errors: errors.length,
      status: 'completed',
    });

    console.log(`[DriveSync] Completed: ${processedDocs.length} documents, ${errors.length} errors`);

    return writeJson(res, 200, {
      success: true,
      syncedDocuments: processedDocs.length,
      errors: errors.length,
      documents: processedDocs,
    });

  } catch (e) {
    console.error('[DriveSync] Error:', e);
    return writeJson(res, 500, { error: e.message || 'Sync failed' });
  }
}

module.exports = { handleDriveSync };
