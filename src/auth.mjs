import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'perfumy_dostep';

const digest = value => createHash('sha256').update(String(value)).digest();
const sameValue = (a, b) => timingSafeEqual(digest(a), digest(b));

// With no password configured nobody gets in: the app is a closed test.
export function checkPassword(candidate, password = process.env.APP_PASSWORD) {
  return Boolean(password) && sameValue(candidate ?? '', password);
}

export function sessionToken(password = process.env.APP_PASSWORD) {
  return createHmac('sha256', password).update('dostep-do-testu').digest('hex');
}

export function isValidSession(token, password = process.env.APP_PASSWORD) {
  return Boolean(password) && Boolean(token) && sameValue(token, sessionToken(password));
}
