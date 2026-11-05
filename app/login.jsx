'use client';

import { useState } from 'react';
import { t } from '../src/i18n.mjs';

const LANGUAGE = 'pl';

export default function Login() {
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (response?.ok) {
      window.location.reload();
      return;
    }
    setFailed(true);
    setBusy(false);
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="login-form">
        <p className="eyebrow">{t(LANGUAGE, 'testLabel')}</p>
        <h1 className="display">Doradca perfumowy</h1>
        <label htmlFor="password">{t(LANGUAGE, 'password')}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={event => setPassword(event.target.value)}
          aria-invalid={failed}
          aria-describedby={failed ? 'password-error' : undefined}
        />
        {failed && <p id="password-error" className="field-error" role="alert">{t(LANGUAGE, 'wrongPassword')}</p>}
        <button type="submit" className="button button-primary" disabled={busy}>{t(LANGUAGE, 'enter')}</button>
      </form>
    </main>
  );
}
