import { cookies } from 'next/headers';
import { createAssistant } from '../../../src/assistant.mjs';
import { isValidSession, SESSION_COOKIE } from '../../../src/auth.mjs';
import { interpret, select } from '../../../src/model.mjs';
import { getStore } from '../../../src/store.mjs';

let assistant;

export async function POST(request) {
  const cookieStore = await cookies();
  if (!isValidSession(cookieStore.get(SESSION_COOKIE)?.value)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return Response.json({ error: 'badRequest' }, { status: 400 });
  assistant ??= createAssistant({ ...getStore(), interpret, select, showImages: process.env.SHOW_PRODUCT_IMAGES === '1' });
  try {
    return Response.json(await assistant.handle(body, request.signal));
  } catch (error) {
    console.error('Blad asystenta:', error);
    return Response.json({ error: 'assistantFailed' }, { status: 502 });
  }
}
