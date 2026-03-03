/**
 * Shared Utilities for Cloud Functions
 * 
 * Common helper functions used across all route handlers.
 */

// ============================================================================
// JSON Helpers
// ============================================================================

/**
 * Write JSON response with COOP headers
 */
function writeJson(res, status, obj) {
  res.status(status);
  res.set('Content-Type', 'application/json');
  res.set('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.send(JSON.stringify(obj));
}

/**
 * Write JSON error response
 */
function jsonError(res, status, message, details) {
  const payload = { error: message };
  if (details) payload.details = details;
  return writeJson(res, status, payload);
}

/**
 * Read JSON body from request
 */
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (Buffer.isBuffer(req.rawBody)) {
    return JSON.parse(req.rawBody.toString('utf8'));
  }
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return {};
}

/**
 * Get query parameter from URL
 */
function getQueryParam(req, name) {
  try {
    const url = new URL(req.originalUrl || req.url || '', 'https://localhost');
    return url.searchParams.get(name);
  } catch {
    return null;
  }
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Extract HTTP status from error
 */
function getHttpStatusFromError(error) {
  const candidate =
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    error?.cause?.status ||
    error?.cause?.statusCode;

  const status = Number(candidate);
  if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  return null;
}

/**
 * Extract error message
 */
function getErrorMessage(error, fallback = 'Internal Server Error') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error?.message || error?.error?.message || fallback;
}

// ============================================================================
// Storage Helpers
// ============================================================================

/**
 * Generate Firebase Storage download URL
 */
function createFirebaseDownloadUrl(bucketName) {
  return (fileName, token) => {
    const encoded = encodeURIComponent(fileName);
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
  };
}

/**
 * Get storage bucket name from environment
 */
function getStorageBucketName() {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    (process.env.GCLOUD_PROJECT ? `${process.env.GCLOUD_PROJECT}.appspot.com` : null)
  );
}

// ============================================================================
// Model Helpers
// ============================================================================

/**
 * Check if model is a Gemini model
 */
function isProbablyGeminiModel(model) {
  if (!model) return false;
  return String(model).startsWith('gemini') || 
         String(model).startsWith('imagen') || 
         String(model).startsWith('veo');
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  writeJson,
  jsonError,
  readJsonBody,
  getQueryParam,
  getHttpStatusFromError,
  getErrorMessage,
  createFirebaseDownloadUrl,
  getStorageBucketName,
  isProbablyGeminiModel,
};
