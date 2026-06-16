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
// NOTE: posts use the VERBATIM Slack text (owner preference) — the AI summarizer
// below is kept but no longer called, so @google/genai is required lazily inside
// it to avoid loading the heavy SDK on the hot/cold path.

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
  // Channel NAME → department key. Posts from a mapped channel use that
  // department; anything else falls back to defaultDepartment. Add more here as
  // the bot is invited to more channels (no redeploy needed — Firestore config).
  channelDepartments: {
    announcements: 'operations',
    'holly-and-homies': 'systemErrorsProviderCoordination',
  },
  ackInSlack: true,
  triggers: { create: '#news', urgent: '#urgent', pin: '#pin' },
};

/** Deterministic post id from the source Slack message, so reactions can find
 *  the post directly and re-processing the same message is idempotent. */
function slackDocId(channel, ts) {
  return `slack-${channel}-${String(ts).replace(/\./g, '_')}`;
}

// In-memory channel-id → name cache (per warm instance).
const _channelNameCache = new Map();
async function resolveChannelName(botToken, channelId) {
  if (!botToken || !channelId) return '';
  if (_channelNameCache.has(channelId)) return _channelNameCache.get(channelId);
  try {
    const r = await fetch(`https://slack.com/api/conversations.info?channel=${encodeURIComponent(channelId)}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const j = await r.json();
    const name = (j.ok && j.channel && (j.channel.name_normalized || j.channel.name)) || '';
    _channelNameCache.set(channelId, name);
    return name;
  } catch (e) {
    console.warn('[slackNews] conversations.info failed:', e.message);
    return '';
  }
}

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

/** Fetch a single Slack message (e.g. the thread parent) WITH its reactions + files. */
async function fetchMessage(botToken, channel, ts) {
  if (!botToken || !channel || !ts) return null;
  try {
    const url = `https://slack.com/api/conversations.replies?channel=${encodeURIComponent(channel)}&ts=${encodeURIComponent(ts)}&limit=1&inclusive=true`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${botToken}` } });
    const j = await r.json();
    if (j.ok && Array.isArray(j.messages) && j.messages.length) return j.messages[0];
    if (!j.ok) console.warn('[slackNews] conversations.replies not ok:', j.error);
  } catch (e) {
    console.warn('[slackNews] conversations.replies failed:', e.message);
  }
  return null;
}

/** Download a Slack image file (needs `files:read`) and store it as the post cover. */
async function uploadSlackImage(botToken, file, docId) {
  if (!botToken || !file || !file.url_private || !/^image\//.test(file.mimetype || '')) return null;
  try {
    const r = await fetch(file.url_private, { headers: { Authorization: `Bearer ${botToken}` } });
    if (!r.ok) { console.warn('[slackNews] image download failed:', r.status); return null; }
    const buf = Buffer.from(await r.arrayBuffer());
    const bucket = admin.storage().bucket();
    const ext = file.filetype || (file.mimetype.split('/')[1] || 'png');
    const path = `news/slack/${docId}.${ext}`;
    const token = crypto.randomUUID();
    await bucket.file(path).save(buf, {
      contentType: file.mimetype,
      resumable: false,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  } catch (e) {
    console.warn('[slackNews] image upload failed:', e.message);
    return null;
  }
}

/** Seed the reactions map from a Slack message's current reactions (e.g. the 👀 already on it). */
function seedReactions(message) {
  const out = {};
  if (message && Array.isArray(message.reactions)) {
    for (const rx of message.reactions) {
      const name = (rx && rx.name || '').split('::')[0];
      if (name) out[name] = (out[name] || 0) + (rx.count || 0);
    }
  }
  return out;
}

// ─── Summarization (Vertex Gemini, ADC) ─────────────────────────────────────
function fallbackPost(cleanText) {
  const firstLine = (cleanText.split('\n').map((s) => s.trim()).find(Boolean)) || 'Company update';
  const title = firstLine.length > 80 ? firstLine.slice(0, 77) + '…' : firstLine;
  return { title, summary: cleanText.slice(0, 160), body: cleanText, department: null };
}

async function summarize(cleanText) {
  const { GoogleGenAI } = require('@google/genai');
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
  const triggerText = ev.text || '';
  const trig = detectTriggers(triggerText);
  if (!trig.any) return { skipped: 'no-trigger' };

  if (Array.isArray(cfg.channels) && cfg.channels.length > 0 && !cfg.channels.includes(ev.channel)) {
    return { skipped: 'channel-not-allowed' };
  }

  // If #news was typed as a THREAD REPLY, the post's CONTENT comes from the
  // PARENT message (its text, image, author, existing reactions). A top-level
  // #news uses the message itself. The #urgent/#pin flags come from wherever
  // the hashtags were typed (the trigger message).
  // Resolve the thread parent (if a reply) and the channel name in PARALLEL.
  const isReply = ev.thread_ts && ev.thread_ts !== ev.ts;
  const [parent, channelName] = await Promise.all([
    isReply ? fetchMessage(botToken, ev.channel, ev.thread_ts) : Promise.resolve(null),
    resolveChannelName(botToken, ev.channel),
  ]);
  const source = parent || ev;

  const sourceTs = source.ts || ev.ts;
  const docId = slackDocId(ev.channel, sourceTs);

  const sourceText = source.text || '';
  const cleanText = stripTriggers(sourceText) || sourceText.trim();

  // Cover image (first image file) + author resolution in PARALLEL.
  const imgFile = Array.isArray(source.files) ? source.files.find((f) => /^image\//.test(f.mimetype || '')) : null;
  const [coverImage, authorName] = await Promise.all([
    imgFile ? uploadSlackImage(botToken, imgFile, docId) : Promise.resolve(null),
    resolveAuthor(botToken, source.user || ev.user),
  ]);

  // VERBATIM message text — owner wants the exact Slack text, NOT an AI rewrite.
  // Title = first non-empty line; body = the full message text; summary = the rest.
  const lines = cleanText.split('\n').map((s) => s.trim()).filter(Boolean);
  const title = lines[0]
    ? (lines[0].length > 90 ? lines[0].slice(0, 87) + '…' : lines[0])
    : ((imgFile && (imgFile.title || imgFile.name)) || 'Company update');
  const rest = lines.slice(1).join(' ').trim();
  const post = { title, body: cleanText, summary: rest ? rest.slice(0, 200) : '' };

  // Department is decided by the SOURCE CHANNEL (per owner):
  // #announcements → operations, holly-and-homies → systemErrorsProviderCoordination, …
  const mapped = channelName && cfg.channelDepartments ? cfg.channelDepartments[channelName] : null;
  const department = (mapped && DEPARTMENT_KEYS.includes(mapped)) ? mapped : (cfg.defaultDepartment || 'operations');

  // Existing reactions (e.g. 👀 already on the message) from the SOURCE.
  const reactions = seedReactions(source);

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
    authorId: `slack:${source.user || ev.user || 'unknown'}`,
    authorName,
    coverImage,
    link: null,
    source: 'slack',
    slackChannel: ev.channel || null,
    slackChannelName: channelName || null,
    slackTs: sourceTs, // SOURCE (parent) ts → reactions on it link back here
    reactions,
    createdAt: now,
    updatedAt: now,
    publishedAt: status === 'PUBLISHED' ? now : null,
    publishAt: null,
    expiresAt: null,
  };

  const ref = adminDb.collection('news_posts').doc(docId);
  await ref.set(docData, { merge: true });

  try {
    await adminDb.collection('news_audit').add({
      postId: ref.id,
      action: status === 'PUBLISHED' ? 'PUBLISH' : 'CREATE',
      actorId: `slack:${ev.user || 'unknown'}`,
      actorName: authorName,
      timestamp: now,
      diff: `Created from Slack${isReply ? ' (thread reply → parent)' : ''}${trig.urgent ? ' (#urgent)' : ''}${trig.pin ? ' (#pin)' : ''}`,
    });
  } catch {/* audit best-effort */}

  if (cfg.ackInSlack) await ackInSlack(botToken, ev.channel, ev.thread_ts || ev.ts, docData.title, trig);

  return { posted: ref.id, fromParent: isReply, hasImage: !!coverImage, priority: docData.priority, pinned: docData.pinned, department };
}

// ─── Relay (keep the other tool working) ────────────────────────────────────
// Our function is the single Slack Request URL; we forward each event to the
// other tool VERBATIM — same raw body + signature headers — so its own Slack
// signature check still passes (same app, same signing secret). Fire-and-forget.
async function relayToTool(relayUrl, rawBody, headers) {
  if (!relayUrl) return;
  try {
    await fetch(relayUrl, {
      method: 'POST',
      // Apps Script /exec 302-redirects its RESPONSE to googleusercontent; doPost
      // has already executed by then, so don't follow it (avoids a stray GET).
      redirect: 'manual',
      headers: {
        'Content-Type': headers['content-type'] || 'application/json',
        'X-Slack-Signature': headers['x-slack-signature'] || '',
        'X-Slack-Request-Timestamp': headers['x-slack-request-timestamp'] || '',
        'X-Slack-Retry-Num': headers['x-slack-retry-num'] || '',
        'X-Slack-Retry-Reason': headers['x-slack-retry-reason'] || '',
      },
      body: rawBody, // exact bytes Slack sent → downstream signature verifies
    });
  } catch (e) {
    console.warn('[slackNews] relay to other tool failed:', e.message);
  }
}

// ─── Reactions (acknowledgements) ───────────────────────────────────────────
async function processReaction(adminDb, ev) {
  if (!ev.item || ev.item.type !== 'message' || !ev.item.channel || !ev.item.ts) return;
  const ref = adminDb.collection('news_posts').doc(slackDocId(ev.item.channel, ev.item.ts));
  const snap = await ref.get();
  if (!snap.exists) return; // reaction on a message that isn't an Amble news post
  const name = (ev.reaction || '').split('::')[0]; // strip skin-tone variants (e.g. "+1::skin-tone-2")
  if (!name) return;
  const delta = ev.type === 'reaction_added' ? 1 : -1;
  await ref.set({
    reactions: { [name]: admin.firestore.FieldValue.increment(delta) },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

// ─── HTTP entry point ───────────────────────────────────────────────────────
async function handleSlackEvent(req, res, { adminDb, signingSecret, botToken, relayUrl }) {
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

    // Dedupe on Slack's event_id (covers any duplicate delivery) — all event types.
    const eventId = body.event_id;
    if (eventId) {
      const seen = adminDb.collection('slack_events_processed').doc(eventId);
      if ((await seen.get()).exists) return;
      await seen.set({ at: admin.firestore.FieldValue.serverTimestamp(), type: ev.type || null });
    }

    // Forward EVERY event to the other tool (not just Amble-relevant ones), so its
    // integration keeps receiving exactly what Slack would have sent it.
    await relayToTool(relayUrl, rawBody, req.headers);

    // Emoji reactions = acknowledgements → update the linked post's reaction counts.
    if (ev.type === 'reaction_added' || ev.type === 'reaction_removed') {
      await processReaction(adminDb, ev);
      return;
    }

    // Messages / replies → maybe create a post.
    if (ev.type !== 'message') return;
    if (ev.bot_id) return;                              // never react to bot/our own messages (loop guard)
    if (ev.subtype && ev.subtype !== 'file_share') return; // allow plain messages, replies, and image captions

    const cfg = await loadConfig(adminDb);
    if (cfg.enabled === false) return;

    const result = await processMessageEvent(adminDb, ev, cfg, botToken);
    console.log('[slackNews]', JSON.stringify(result));
  } catch (e) {
    console.error('[slackNews] processing error:', e?.message);
  }
}

module.exports = { handleSlackEvent };
