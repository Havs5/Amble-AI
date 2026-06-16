/**
 * Slack → Company News auto-publisher.
 *
 * A message in an allow-listed Slack channel (or a thread reply) that contains a
 * trigger hashtag becomes a published `news_posts` doc:
 *   #news    → create + auto-publish        (the primary create trigger)
 *   #urgent  → priority CRITICAL
 *   #pin     → pinned
 * Triggers are case-insensitive (#News / #NEWS / #nEws all match) and work in
 * thread replies too (a `#pin` comment will create + pin). Posts stay fully
 * editable inside Amble AI afterwards.
 *
 * Reuses the existing Slack app (Events API). Security: every request is
 * verified with the app's signing secret. Config lives in Firestore
 * `config/slackNews` (editable without redeploy). Secrets are injected from
 * Google Secret Manager — never stored in the repo.
 */

const crypto = require('crypto');
const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');

const VERTEX_PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'amble-ai';
const VERTEX_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'global';
const SUMMARY_MODEL = 'gemini-3-flash-preview';

// Department keys the AI may classify into (must match src/types/news.ts NEWS_DEPARTMENTS).
const DEPARTMENT_KEYS = [
  'billing', 'patientExperience', 'pharmacyCoordination', 'trainingDevelopment',
  'systemErrorsProviderCoordination', 'sendblue', 'operations',
];

const DEFAULT_CONFIG = {
  enabled: true,
  channels: [],            // empty = any channel the bot has been invited to
  autoPublish: true,
  summarize: true,
  defaultDepartment: 'operations',
  ackInSlack: true,
  triggers: { create: '#news', urgent: '#urgent', pin: '#pin' },
};

// ─── Signature verification (replay-safe HMAC) ──────────────────────────────
function verifySlackSignature(rawBody, timestamp, signature, signingSecret) {
  if (!timestamp || !signature || !signingSecret) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false; // reject >5 min skew (replay)
  const base = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', signingSecret).update(base).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ─── Trigger detection ──────────────────────────────────────────────────────
// `\b` after the word avoids false positives like #newsletter / #pinned.
function detectTriggers(text) {
  const t = text || '';
  const create = /#news\b/i.test(t);
  const urgent = /#urgent\b/i.test(t);
  const pin = /#pin\b/i.test(t);
  return { create, urgent, pin, any: create || urgent || pin };
}

function stripTriggers(text) {
  return (text || '')
    .replace(/#(news|urgent|pin)\b/ig, '')
    .replace(/<@[A-Z0-9]+>/g, '')        // strip Slack user mentions
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// ─── Config ─────────────────────────────────────────────────────────────────
async function loadConfig(adminDb) {
  try {
    const ref = adminDb.collection('config').doc('slackNews');
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set(DEFAULT_CONFIG, { merge: true }); // seed so the owner can tweak it later
      return { ...DEFAULT_CONFIG };
    }
    const data = snap.data() || {};
    return { ...DEFAULT_CONFIG, ...data, triggers: { ...DEFAULT_CONFIG.triggers, ...(data.triggers || {}) } };
  } catch (e) {
    console.warn('[slackNews] config load failed, using defaults:', e.message);
    return { ...DEFAULT_CONFIG };
  }
}

// ─── Slack helpers ──────────────────────────────────────────────────────────
async function resolveAuthor(botToken, userId) {
  if (!botToken || !userId) return 'Slack';
  try {
    const r = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const j = await r.json();
    if (j.ok && j.user) {
      const p = j.user.profile || {};
      return p.real_name_normalized || j.user.real_name || p.display_name_normalized || p.display_name || j.user.name || 'Slack';
    }
  } catch (e) {
    console.warn('[slackNews] users.info failed:', e.message);
  }
  return 'Slack';
}

async function ackInSlack(botToken, channel, threadTs, title, trig) {
  if (!botToken || !channel) return;
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${botToken}` },
      body: JSON.stringify({
        channel,
        thread_ts: threadTs,
        text: `📰 Posted to Amble News${trig.urgent ? ' · 🔴 Critical' : ''}${trig.pin ? ' · 📌 Pinned' : ''}: *${title}*`,
      }),
    });
  } catch (e) {
    console.warn('[slackNews] ack postMessage failed:', e.message);
  }
}

// ─── Summarization (Vertex Gemini, ADC) ─────────────────────────────────────
function fallbackPost(cleanText) {
  const firstLine = (cleanText.split('\n').map((s) => s.trim()).find(Boolean)) || 'Company update';
  const title = firstLine.length > 80 ? firstLine.slice(0, 77) + '…' : firstLine;
  return { title, summary: cleanText.slice(0, 160), body: cleanText, department: null };
}

async function summarize(cleanText) {
  const ai = new GoogleGenAI({ vertexai: true, project: VERTEX_PROJECT, location: VERTEX_LOCATION });
  const prompt = `Convert this raw Slack message into a concise internal company-news post.
Return STRICT JSON only (no markdown), with keys:
- "title": <= 80 chars, plain, no hashtags
- "summary": <= 160 chars, one-line preview
- "body": clean readable text, keep the key facts, drop Slack noise
- "department": the single best fit from [${DEPARTMENT_KEYS.join(', ')}]; if unclear use "operations"

Slack message:
"""${cleanText}"""`;
  const resp = await ai.models.generateContent({
    model: SUMMARY_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.3, maxOutputTokens: 1024, responseMimeType: 'application/json' },
  });
  const raw = (typeof resp.text === 'string' && resp.text)
    || resp?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('')
    || '';
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const obj = JSON.parse(cleaned);
  if (!obj || !obj.title) throw new Error('summarizer returned no title');
  return obj;
}

// ─── Core: build + publish a post from one message event ────────────────────
async function processMessageEvent(adminDb, ev, cfg, botToken) {
  const text = ev.text || '';
  const trig = detectTriggers(text);
  if (!trig.any) return { skipped: 'no-trigger' };

  if (Array.isArray(cfg.channels) && cfg.channels.length > 0 && !cfg.channels.includes(ev.channel)) {
    return { skipped: 'channel-not-allowed' };
  }

  const cleanText = stripTriggers(text) || text.trim();

  let post;
  if (cfg.summarize) {
    try { post = await summarize(cleanText); }
    catch (e) { console.warn('[slackNews] summarize failed, using raw:', e.message); post = fallbackPost(cleanText); }
  } else {
    post = fallbackPost(cleanText);
  }

  const department = post.department && DEPARTMENT_KEYS.includes(post.department)
    ? post.department
    : (cfg.defaultDepartment || 'operations');
  const authorName = await resolveAuthor(botToken, ev.user);

  const now = admin.firestore.FieldValue.serverTimestamp();
  const status = cfg.autoPublish ? 'PUBLISHED' : 'DRAFT';

  const docData = {
    title: post.title || 'Company update',
    body: post.body || cleanText,
    summary: post.summary || cleanText.slice(0, 160),
    departmentId: department,
    tags: [],
    priority: trig.urgent ? 'CRITICAL' : 'NORMAL',
    pinned: !!trig.pin,
    status,
    visibility: 'ALL',
    allowedDepartmentIds: [],
    allowedUserIds: [],
    authorId: `slack:${ev.user || 'unknown'}`,
    authorName,
    coverImage: null,
    link: null,
    source: 'slack',
    createdAt: now,
    updatedAt: now,
    publishedAt: status === 'PUBLISHED' ? now : null,
    publishAt: null,
    expiresAt: null,
  };

  const ref = await adminDb.collection('news_posts').add(docData);

  try {
    await adminDb.collection('news_audit').add({
      postId: ref.id,
      action: status === 'PUBLISHED' ? 'PUBLISH' : 'CREATE',
      actorId: `slack:${ev.user || 'unknown'}`,
      actorName: authorName,
      timestamp: now,
      diff: `Created from Slack${trig.urgent ? ' (#urgent)' : ''}${trig.pin ? ' (#pin)' : ''}`,
    });
  } catch {/* audit best-effort */}

  if (cfg.ackInSlack) await ackInSlack(botToken, ev.channel, ev.thread_ts || ev.ts, docData.title, trig);

  return { posted: ref.id, priority: docData.priority, pinned: docData.pinned, department };
}

// ─── HTTP entry point ───────────────────────────────────────────────────────
async function handleSlackEvent(req, res, { adminDb, signingSecret, botToken }) {
  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
  const ts = req.get('x-slack-request-timestamp');
  const sig = req.get('x-slack-signature');

  if (!verifySlackSignature(rawBody, ts, sig, signingSecret)) {
    console.warn('[slackNews] signature verification failed');
    return res.status(401).send('invalid signature');
  }

  const body = req.body || {};

  // 1) URL verification handshake (Event Subscriptions setup).
  if (body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  // 2) Ack immediately — Slack requires a 200 within 3s. Process afterwards.
  res.status(200).send('');

  try {
    if (body.type !== 'event_callback' || !body.event) return;
    const ev = body.event;
    if (ev.type !== 'message') return;
    if (ev.bot_id) return;                              // never react to bot/our own messages (loop guard)
    if (ev.subtype && ev.subtype !== 'file_share') return; // allow plain messages, replies, and image captions

    // Dedupe on Slack's event_id (covers any duplicate delivery).
    const eventId = body.event_id;
    if (eventId) {
      const seen = adminDb.collection('slack_events_processed').doc(eventId);
      if ((await seen.get()).exists) return;
      await seen.set({ at: admin.firestore.FieldValue.serverTimestamp(), channel: ev.channel || null });
    }

    const cfg = await loadConfig(adminDb);
    if (cfg.enabled === false) return;

    const result = await processMessageEvent(adminDb, ev, cfg, botToken);
    console.log('[slackNews]', JSON.stringify(result));
  } catch (e) {
    console.error('[slackNews] processing error:', e?.message);
  }
}

module.exports = { handleSlackEvent };
