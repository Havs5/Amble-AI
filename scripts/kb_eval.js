/**
 * KB RAG eval harness (SOURCE_OF_TRUTH §8.5 layer 6).
 *
 * Black-box end-to-end check of the production KB pipeline: sends gold questions
 * to /api/chat and verifies the answer is grounded + correct (RAGAS-style
 * answer-correctness / faithfulness proxy) and that off-KB questions ABSTAIN.
 *
 * Run:
 *   node scripts/kb_eval.js
 *   AMBLE_FN_URL=https://amble-ai.web.app node scripts/kb_eval.js   # via hosting
 *
 * Default targets the Cloud Run URL (no 60s hosting cap). Chat needs no auth.
 * EXPAND the GOLD set below as the KB grows — this is the regression gate for
 * every future retrieval/embedding/rerank change.
 */

const FN_URL = process.env.AMBLE_FN_URL || 'https://ssrambleai-2flmqkt55a-uc.a.run.app';
const MODEL = process.env.AMBLE_EVAL_MODEL || 'gemini-3-flash';

// Gold set: each item is either
//   { q, expect:[...substrings all required] }     → answer must contain these
//   { q, expectAny:[...] }                          → answer must contain ≥1
//   { q, abstain:true }                             → answer must say "not in KB"
// NOTE: abstain cases must be COMPANY-SPECIFIC facts absent from the KB.
// General world-knowledge (e.g. "capital of France") is NOT an abstain case —
// Amble AI is also a general assistant; the grounding guarantee is specifically
// about not fabricating *company* information.
const GOLD = [
  { q: 'What pharmacies does Amble work with?', expectAny: ['ReviveRX', 'Perfect Rx', 'Pharmacy Hub', 'DispensePro', 'Smart Scripts'] },
  { q: 'Which pharmacy handles Semaglutide and Tirzepatide orders?', expectAny: ['ReviveRX', 'Perfect Rx', 'Pharmacy Hub', 'DispensePro', 'Smart Scripts'] },
  { q: 'Are the compounding pharmacies 503(a) or 503(b)?', expectAny: ['503(a)', '503a', '503(b)', '503b'] },
  { q: 'What is the official company policy on employee parking permits at the office?', abstain: true },
  { q: "What is Amble Health's 401(k) employer match percentage?", abstain: true },
];

const ABSTAIN_RX = /knowledge base|don'?t have|do not have|not (?:in|available|find)|couldn'?t find|no information/i;

async function ask(question) {
  const res = await fetch(`${FN_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: question }],
      model: MODEL,
      userId: 'kb-eval',
      context: { view: 'amble' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  return data.reply || data.error || '';
}

function grade(item, answer) {
  const a = (answer || '').toLowerCase();
  if (item.abstain) {
    return { pass: ABSTAIN_RX.test(answer || ''), why: 'should abstain' };
  }
  if (item.expect) {
    const missing = item.expect.filter((s) => !a.includes(s.toLowerCase()));
    return { pass: missing.length === 0, why: missing.length ? `missing: ${missing.join(', ')}` : 'all present' };
  }
  if (item.expectAny) {
    const hit = item.expectAny.some((s) => a.includes(s.toLowerCase()));
    return { pass: hit, why: hit ? 'matched' : `none of: ${item.expectAny.join(', ')}` };
  }
  return { pass: false, why: 'no assertion' };
}

(async () => {
  console.log(`KB eval → ${FN_URL} (model ${MODEL})\n`);
  let passed = 0;
  for (const item of GOLD) {
    let answer = '';
    try { answer = await ask(item.q); } catch (e) { answer = `ERROR: ${e.message}`; }
    const { pass, why } = grade(item, answer);
    if (pass) passed++;
    console.log(`${pass ? '✅' : '❌'} ${item.q}`);
    console.log(`   ${why}`);
    console.log(`   ↳ ${(answer || '').replace(/\s+/g, ' ').slice(0, 160)}\n`);
  }
  const pct = Math.round((passed / GOLD.length) * 100);
  console.log(`\nScore: ${passed}/${GOLD.length} (${pct}%)`);
  process.exit(passed === GOLD.length ? 0 : 1);
})();
