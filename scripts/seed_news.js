/**
 * Seed Script — Company News Sample Posts
 * 
 * Usage:
 *   node scripts/seed_news.js
 * 
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS env var set to a service account key
 *     OR run: npx firebase login && npx firebase use amble-ai
 *   - firebase-admin installed (already in functions/package.json)
 * 
 * This creates 6 sample news posts in the `news_posts` collection.
 */

const admin = require('firebase-admin');

// Initialize with default credentials (uses GOOGLE_APPLICATION_CREDENTIALS or gcloud default)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'amble-ai',
  });
}

const db = admin.firestore();

const samplePosts = [
  {
    title: '🚨 Scheduled Maintenance - March 5, 2026',
    body: 'The Amble AI platform will undergo scheduled maintenance on **March 5, 2026** from 2:00 AM to 4:00 AM EST.\n\nDuring this window:\n- Chat functionality may be intermittently unavailable\n- Knowledge Base sync will be paused\n- All saved conversations will be preserved\n\nPlease save any in-progress work before the maintenance window.',
    summary: 'Platform maintenance scheduled for March 5, 2026 — 2:00-4:00 AM EST',
    departmentId: 'engineering',
    tags: ['maintenance', 'urgent', 'system'],
    priority: 'CRITICAL',
    pinned: true,
    status: 'PUBLISHED',
    visibility: 'ALL',
    allowedDepartmentIds: [],
    allowedUserIds: [],
    authorId: 'admin',
    authorName: 'System Admin',
    link: null,
    source: 'manual',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    publishedAt: admin.firestore.Timestamp.fromDate(new Date('2026-03-01T10:00:00Z')),
    publishAt: null,
    expiresAt: admin.firestore.Timestamp.fromDate(new Date('2026-03-06T00:00:00Z')),
  },
  {
    title: 'New Knowledge Base Features Released',
    body: 'We\'re excited to announce several improvements to the Knowledge Base:\n\n1. **Vector search** now supports 1536-dimension embeddings\n2. **Google Drive sync** auto-refreshes every 30 minutes\n3. **PDF parsing** accuracy improved by 35%\n4. New **citation mode** shows exact source references\n\nThese features are available immediately for all users.',
    summary: 'KB vector search, Drive sync, and PDF parsing improvements now live',
    departmentId: 'engineering',
    tags: ['update', 'announcement'],
    priority: 'NORMAL',
    pinned: true,
    status: 'PUBLISHED',
    visibility: 'ALL',
    allowedDepartmentIds: [],
    allowedUserIds: [],
    authorId: 'admin',
    authorName: 'Engineering Team',
    link: null,
    source: 'manual',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    publishedAt: admin.firestore.Timestamp.fromDate(new Date('2026-02-28T14:00:00Z')),
    publishAt: null,
    expiresAt: null,
  },
  {
    title: 'Updated Billing Response Policy - Q1 2026',
    body: 'Effective March 1, 2026, the billing CX response templates have been updated:\n\n- New templates for insurance dispute escalation\n- Revised courtesy adjustment thresholds\n- Updated compliance language for HIPAA requirements\n\nAll billing agents should review the new templates in the Billing CX module.',
    summary: 'Q1 billing response templates updated with new insurance dispute and compliance language',
    departmentId: 'billing',
    tags: ['policy', 'update'],
    priority: 'NORMAL',
    pinned: true,
    status: 'PUBLISHED',
    visibility: 'DEPARTMENTS',
    allowedDepartmentIds: ['billing', 'operations'],
    allowedUserIds: [],
    authorId: 'admin',
    authorName: 'Billing Operations',
    link: null,
    source: 'manual',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    publishedAt: admin.firestore.Timestamp.fromDate(new Date('2026-02-27T09:00:00Z')),
    publishAt: null,
    expiresAt: null,
  },
  {
    title: 'Welcome to Company News!',
    body: 'We\'re launching the Company News feature to keep everyone informed about:\n\n- Platform updates and new features\n- Policy changes and compliance updates\n- Team announcements and events\n- System maintenance schedules\n\nAdmins can create, pin, and schedule posts. Look for the Company News panel on your Dashboard!',
    summary: 'Introducing Company News — your central hub for team updates and announcements',
    departmentId: 'general',
    tags: ['announcement'],
    priority: 'NORMAL',
    pinned: false,
    status: 'PUBLISHED',
    visibility: 'ALL',
    allowedDepartmentIds: [],
    allowedUserIds: [],
    authorId: 'admin',
    authorName: 'Amble AI Team',
    link: null,
    source: 'manual',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    publishedAt: admin.firestore.Timestamp.fromDate(new Date('2026-02-25T12:00:00Z')),
    publishAt: null,
    expiresAt: null,
  },
  {
    title: 'AI Model Upgrade: GPT-5 & Gemini 3 Now Available',
    body: 'Both GPT-5 and Gemini 3 are now available across all Amble AI modules:\n\n**GPT-5:** Improved reasoning, faster response times, 200K context window\n**Gemini 3:** Enhanced multimodal capabilities, better code generation\n\nSwitch between models using the model picker in the top bar. Both models support deep reasoning, web search, and image analysis.',
    summary: 'GPT-5 and Gemini 3 models available with improved reasoning and multimodal capabilities',
    departmentId: 'engineering',
    tags: ['update', 'announcement'],
    priority: 'NORMAL',
    pinned: false,
    status: 'PUBLISHED',
    visibility: 'ALL',
    allowedDepartmentIds: [],
    allowedUserIds: [],
    authorId: 'admin',
    authorName: 'AI Platform Team',
    link: null,
    source: 'manual',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    publishedAt: admin.firestore.Timestamp.fromDate(new Date('2026-02-20T16:00:00Z')),
    publishAt: null,
    expiresAt: null,
  },
  {
    title: 'Team Wellness Day - March 14',
    body: 'Join us for our quarterly wellness day on **Friday, March 14**!\n\n- 10:00 AM — Guided meditation session (virtual)\n- 12:00 PM — Team lunch (in-office) / DoorDash credit (remote)\n- 2:00 PM — Optional team activity\n\nMark your calendars and let your manager know if you\'re participating.',
    summary: 'Quarterly wellness day scheduled for March 14 — meditation, team lunch, and activities',
    departmentId: 'hr',
    tags: ['event', 'benefit'],
    priority: 'FYI',
    pinned: false,
    status: 'PUBLISHED',
    visibility: 'ALL',
    allowedDepartmentIds: [],
    allowedUserIds: [],
    authorId: 'admin',
    authorName: 'HR Team',
    link: null,
    source: 'manual',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    publishedAt: admin.firestore.Timestamp.fromDate(new Date('2026-02-18T10:00:00Z')),
    publishAt: null,
    expiresAt: admin.firestore.Timestamp.fromDate(new Date('2026-03-15T00:00:00Z')),
  },
];

async function seed() {
  console.log('🌱 Seeding news_posts collection...\n');

  for (const post of samplePosts) {
    try {
      const ref = await db.collection('news_posts').add(post);
      console.log(`  ✓ Created: "${post.title}" → ${ref.id}`);
    } catch (err) {
      console.error(`  ✗ Failed: "${post.title}"`, err.message);
    }
  }

  console.log('\n✅ Seed complete! Created', samplePosts.length, 'posts.');
  console.log('View them at: https://console.firebase.google.com/project/amble-ai/firestore/data/news_posts');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
