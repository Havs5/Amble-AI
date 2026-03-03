/**
 * Knowledge Base Services
 * 
 * Export all KB-related services and types
 */

// Types
export * from './types';

// Services
export { EmbeddingService } from './EmbeddingService';
export { DocumentProcessor } from './DocumentProcessor';
export { DriveSync } from './DriveSync';
export { KnowledgeBaseManager } from './KnowledgeBaseManager';
export { RAGPipeline } from './RAGPipeline';
export { ImageProcessor, getImageProcessor } from './ImageProcessor';

// Default export for quick access
import { RAGPipeline } from './RAGPipeline';
import { KnowledgeBaseManager } from './KnowledgeBaseManager';

export default {
  RAGPipeline,
  KnowledgeBaseManager,
};
