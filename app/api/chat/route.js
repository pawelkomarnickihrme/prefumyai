import { after } from 'next/server';
import { createAssistant } from '../../../src/assistant.mjs';
import { interactionRow, saveInteraction } from '../../../src/interactions.mjs';
import { interpret, select } from '../../../src/model.mjs';
import { getStore } from '../../../src/store.mjs';

let assistant;

// ponytail: no auth or rate limit while the password gate is off; every call can spend AI Gateway credits.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return Response.json({ error: 'badRequest' }, { status: 400 });

  const started = Date.now();
  let reply = null;
  let status = 500;
  // A language switch only relabels the summary, so it is not part of the conversation.
  if (body.type !== 'summary') after(() => saveInteraction(interactionRow(body, reply, status, Date.now() - started)));

  assistant ??= createAssistant({ ...getStore(), interpret, select, showImages: process.env.SHOW_PRODUCT_IMAGES === '1' });
  try {
    reply = await assistant.handle(body, request.signal);
    status = 200;
    return Response.json(reply);
  } catch (error) {
    status = 502;
    console.error('Blad asystenta:', error);
    return Response.json({ error: 'assistantFailed' }, { status: 502 });
  }
}
