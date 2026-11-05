import { neon } from '@neondatabase/serverless';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 1000;
const MAX_REQUEST = 20_000;

// The body comes from the browser: keep only what explains the turn, within fixed limits.
export function interactionRow(body, reply, status, durationMs) {
  const { type, text, sessionId, action, perfumeId, perfumeIds, operations } = body;
  const request = JSON.stringify({ action, perfumeId, perfumeIds, operations });
  return {
    sessionId: typeof sessionId === 'string' && UUID.test(sessionId) ? sessionId : null,
    type: typeof type === 'string' ? type.slice(0, 40) : null,
    userText: typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) || null : null,
    request: request.length <= MAX_REQUEST ? request : null,
    status,
    durationMs,
    language: reply?.language ?? null,
    reply: reply ? JSON.stringify({
      message: reply.message, blocks: reply.blocks, warnings: reply.warnings,
      actions: reply.actions, shownIds: reply.shownIds, preferences: reply.preferences,
    }) : null,
  };
}

// A failed write only costs a log line: the tester already has the answer.
// ponytail: one insert per request, batch them if test traffic ever makes this slow.
export async function saveInteraction(row, url = process.env.DATABASE_URL) {
  if (!url) return;
  try {
    const sql = neon(url);
    await sql`INSERT INTO interactions (session_id, type, user_text, request, status, duration_ms, language, reply)
      VALUES (${row.sessionId}, ${row.type}, ${row.userText}, ${row.request}, ${row.status}, ${row.durationMs}, ${row.language}, ${row.reply})`;
  } catch (error) {
    console.error('Nie zapisano rozmowy:', error.message);
  }
}
