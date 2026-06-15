/**
 * One-off migration — normalize legacy stored roles to the RBAC values.
 *
 *   'admin' → 'superadmin'      'user' → 'staff'
 *
 * Cosmetic: the app already handles legacy values at runtime via
 * `src/lib/roles.ts` normalizeRole(); this just makes the stored data canonical.
 * Idempotent — safe to re-run.
 *
 * Run:
 *   GOOGLE_APPLICATION_CREDENTIALS=./amble-kb-sync-key.json node scripts/migrate_roles.js
 *   (or: npx firebase login && a project with ADC; uses projectId amble-ai)
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'amble-ai' });
}

const db = admin.firestore();
const MAP = { admin: 'superadmin', user: 'staff' };

(async () => {
  const snap = await db.collection('users').get();
  let migrated = 0;
  for (const doc of snap.docs) {
    const role = doc.data().role;
    if (MAP[role]) {
      await doc.ref.update({ role: MAP[role] });
      console.log(`  ${doc.id}: ${role} → ${MAP[role]}`);
      migrated++;
    }
  }
  console.log(`Done. Migrated ${migrated} of ${snap.size} user(s).`);
  process.exit(0);
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
