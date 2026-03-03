/**
 * Gallery Route Handler
 * 
 * Handles /api/gallery endpoint for managing generated assets.
 */

const admin = require('firebase-admin');

// ============================================================================
// Get Gallery Assets
// ============================================================================

async function handleGalleryGet(req, res, { adminDb, bucket, writeJson, getQueryParam }) {
  try {
    const userId = getQueryParam(req, 'userId');
    const limitRaw = getQueryParam(req, 'limit');
    const limit = limitRaw ? Math.max(1, Math.min(200, Number(limitRaw))) : 50;

    if (!userId) {
      return writeJson(res, 400, { error: 'User ID is required' });
    }

    const snap = await adminDb
      .collection('generated_assets')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const assets = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data?.createdAt?.toDate?.()?.toISOString?.() || null,
      };
    });

    return writeJson(res, 200, { assets });
    
  } catch (e) {
    console.error('Error in gallery GET handler:', e);
    return writeJson(res, 500, { error: e.message || 'Failed to fetch gallery' });
  }
}

// ============================================================================
// Delete Gallery Asset
// ============================================================================

async function handleGalleryDelete(req, res, { adminDb, bucket, writeJson, getQueryParam }) {
  try {
    const userId = getQueryParam(req, 'userId');
    const assetId = getQueryParam(req, 'assetId');

    if (!userId) {
      return writeJson(res, 400, { error: 'User ID is required' });
    }
    
    if (!assetId) {
      return writeJson(res, 400, { error: 'Asset ID is required' });
    }

    const ref = adminDb.collection('generated_assets').doc(assetId);
    const doc = await ref.get();
    
    if (!doc.exists) {
      return writeJson(res, 404, { error: 'Asset not found' });
    }
    
    const data = doc.data();
    if (data?.userId !== userId) {
      return writeJson(res, 403, { error: 'Unauthorized' });
    }

    // Delete from storage if exists
    if (data?.storagePath) {
      try {
        await bucket.file(data.storagePath).delete();
      } catch (e) {
        console.warn('Failed to delete storage file:', e.message);
      }
    }

    await ref.delete();
    return writeJson(res, 200, { success: true });
    
  } catch (e) {
    console.error('Error in gallery DELETE handler:', e);
    return writeJson(res, 500, { error: e.message || 'Failed to delete asset' });
  }
}

// ============================================================================
// Main Router
// ============================================================================

async function handleGallery(req, res, context) {
  const method = (req.method || 'GET').toUpperCase();
  
  if (method === 'GET') {
    return handleGalleryGet(req, res, context);
  }
  
  if (method === 'DELETE') {
    return handleGalleryDelete(req, res, context);
  }
  
  return context.writeJson(res, 405, { error: 'Method not allowed' });
}

module.exports = { handleGallery };
