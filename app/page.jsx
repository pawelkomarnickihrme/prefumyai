import { cookies } from 'next/headers';
import { isValidSession, SESSION_COOKIE } from '../src/auth.mjs';
import Chat from './chat.jsx';
import Login from './login.jsx';

export default async function Page() {
  const cookieStore = await cookies();
  return isValidSession(cookieStore.get(SESSION_COOKIE)?.value) ? <Chat /> : <Login />;
}
