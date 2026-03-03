/**
 * Application-wide constants
 * Centralizes magic strings and config values that were previously hardcoded.
 */

// Google Drive folder ID for Knowledge Base sync
// Can be overridden via environment variable NEXT_PUBLIC_KB_DRIVE_FOLDER_ID
export const KB_DRIVE_FOLDER_ID =
  process.env.NEXT_PUBLIC_KB_DRIVE_FOLDER_ID || '1dScQA7J2EbQw90zJnItUnJT2izPzyCL7';
