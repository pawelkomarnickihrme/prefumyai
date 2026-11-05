'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../src/i18n.mjs';
import { Block, DetailsContent } from './blocks.jsx';

const STORAGE_KEY = 'doradca-rozmowa';
const NEAR_BOTTOM = 160;
const MAX_COMPARE = 3;
const emptyPreferences = {};

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeSession(value) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch { /* A private window can refuse storage; the conversation still works. */ }
}

export default function Chat() {
  const [language, setLanguage] = useState('pl');
  const [turns, setTurns] = useState([]);
  const [preferences, setPreferences] = useState(emptyPreferences);
  const [summary, setSummary] = useState([]);
  const [shownIds, setShownIds] = useState([]);
  const [compare, setCompare] = useState([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('idle');
  const [failed, setFailed] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [hasNewReply, setHasNewReply] = useState(false);
  const [restored, setRestored] = useState(false);

  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const drawerRef = useRef(null);
  const confirmRef = useRef(null);
  const followRef = useRef(true);
  const busy = status === 'busy';

  useEffect(() => {
    const saved = readSession();
    if (saved) {
      setLanguage(saved.language ?? 'pl');
      setTurns(saved.turns ?? []);
      setPreferences(saved.preferences ?? emptyPreferences);
      setSummary(saved.summary ?? []);
      setShownIds(saved.shownIds ?? []);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) writeSession({ language, turns, preferences, summary, shownIds });
  }, [restored, language, turns, preferences, summary, shownIds]);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  // Follow new replies only for someone already at the end of the conversation.
  useEffect(() => {
    const onScroll = () => {
      followRef.current = document.documentElement.scrollHeight - window.scrollY - window.innerHeight < NEAR_BOTTOM;
      if (followRef.current) setHasNewReply(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!turns.length) return;
    if (followRef.current) scrollToLatest();
    else setHasNewReply(true);
  }, [turns]);

  useEffect(() => {
    if (drawer && !drawerRef.current?.open) drawerRef.current?.showModal();
  }, [drawer]);

  // A long reply must be read from its start, or the first proposals go unseen.
  function scrollToLatest() {
    const turns = document.querySelectorAll('.turn');
    turns[turns.length - 1]?.scrollIntoView({ block: 'start' });
  }

  const request = useCallback(async (payload, signal) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    if (response.status === 401) {
      window.location.reload();
      throw new Error('unauthorized');
    }
    if (!response.ok) throw new Error('failed');
    return response.json();
  }, []);

  const send = useCallback(async (payload, userText) => {
    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setFailed(null);
    setStatus('busy');
    const visibleText = userText ?? null;
    const history = turns.flatMap(turn => [
      ...(turn.user ? [{ role: 'user', text: turn.user }] : []),
      ...(turn.reply?.message ? [{ role: 'assistant', text: turn.reply.message }] : []),
    ]);
    const body = { ...payload, preferences, language, shownIds, history };
    try {
      const reply = await request(body, controller.signal);
      setTurns(current => [...current, { id: crypto.randomUUID(), user: visibleText, reply }]);
      setPreferences(reply.preferences);
      setSummary(reply.summary);
      setLanguage(reply.language);
      if (reply.shownIds.length) setShownIds(reply.shownIds);
      if (payload.type === 'message') setDraft('');
      if (payload.type === 'compare') setCompare([]);
      setStatus('idle');
    } catch (error) {
      if (error.message === 'unauthorized') return;
      const aborted = controller.signal.aborted;
      setFailed({ payload, userText, aborted });
      setStatus('idle');
    } finally {
      abortRef.current = null;
    }
  }, [language, preferences, request, shownIds, turns]);

  function submit(event) {
    event?.preventDefault();
    const text = draft.trim();
    if (text && !busy) send({ type: 'message', text }, text);
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
  }

  async function changeLanguage(next) {
    if (next === language) return;
    setLanguage(next);
    try {
      const reply = await request({ type: 'summary', preferences, language: next });
      setSummary(reply.summary);
    } catch { /* The labels stay as they are until the next reply. */ }
  }

  const api = {
    send,
    async openDetails(perfumeId) {
      const reply = await request({ type: 'details', perfumeId, preferences, language }).catch(() => null);
      const block = reply?.blocks[0];
      if (block) setDrawer(block);
      else setFailed({ payload: { type: 'details', perfumeId }, aborted: false });
    },
    toggleCompare(id, name) {
      setCompare(current => {
        if (current.some(item => item.id === id)) return current.filter(item => item.id !== id);
        return current.length >= MAX_COMPARE ? current : [...current, { id, name }];
      });
    },
  };

  function startOver() {
    setTurns([]);
    setPreferences(emptyPreferences);
    setSummary([]);
    setShownIds([]);
    setCompare([]);
    setDraft('');
    setFailed(null);
    confirmRef.current?.close();
    inputRef.current?.focus();
  }

  const started = turns.length > 0 || busy || failed;
  const compareIds = compare.map(item => item.id);

  const direction = summary.length ? (
    <ul className="chips">
      {summary.map(item => (
        <li className="chip" key={item.key}>
          <span>{item.label}</span>
          <button
            type="button"
            className="chip-remove"
            aria-label={`${t(language, 'removeCondition')}: ${item.label}`}
            disabled={busy}
            onClick={() => send({ type: 'operations', operations: [item.operation] })}
          >×</button>
        </li>
      ))}
    </ul>
  ) : <p className="meta">{t(language, 'directionEmpty')}</p>;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="wordmark">Doradca perfumowy</span>
        <div className="language" role="group" aria-label={t(language, 'language')}>
          {['pl', 'en'].map(option => (
            <button key={option} type="button" aria-pressed={language === option} onClick={() => changeLanguage(option)}>{option.toUpperCase()}</button>
          ))}
        </div>
      </header>

      <div className={`layout${started ? '' : ' layout-empty'}`}>
        {started && (
          <details className="direction-mobile">
            <summary>{t(language, 'direction')} ({summary.length})</summary>
            {direction}
          </details>
        )}

        <main className="conversation">
          {!started && (
            <section className="hero">
              <h1 className="display">{t(language, 'heroTitle')}</h1>
              <p className="lead">{t(language, 'heroLead')}</p>
            </section>
          )}

          {turns.map(turn => (
            <article className="turn" key={turn.id}>
              {turn.user && <p className="user-message"><span className="visually-hidden">{t(language, 'you')}: </span>{turn.user}</p>}
              <div className="reply" lang={turn.reply.language}>
                {turn.reply.message && <p className="reply-text">{turn.reply.message}</p>}
                {turn.reply.warnings.map(warning => <p className="warning" key={warning}>{warning}</p>)}
                {turn.reply.blocks.map((block, index) => (
                  <Block key={index} block={block} language={turn.reply.language} api={api} compareIds={compareIds} />
                ))}
                {turn.reply.actions.length > 0 && (
                  <div className="option-row">
                    {turn.reply.actions.map(item => (
                      <button type="button" className="button" key={item.action} disabled={busy} onClick={() => send({ type: 'action', action: item.action, shownIds: turn.reply.shownIds }, item.label)}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}

          <div aria-live="polite" className="status-line">
            {busy && <p className="status">{t(language, 'busy')}</p>}
          </div>

          {failed && (
            <div className="error-box" role="alert">
              {failed.userText && <p className="user-message">{failed.userText}</p>}
              <p>{t(language, failed.aborted ? 'stopped' : 'error')}</p>
              <button type="button" className="button" onClick={() => send(failed.payload, failed.userText)}>{t(language, 'retry')}</button>
            </div>
          )}
        </main>

        {started && (
          <aside className="direction" aria-label={t(language, 'direction')}>
            <h2 className="eyebrow">{t(language, 'direction')}</h2>
            {direction}
            <button type="button" className="link" onClick={() => (turns.length ? confirmRef.current?.showModal() : startOver())}>{t(language, 'newChat')}</button>
          </aside>
        )}
      </div>

      <div className="dock">
        {hasNewReply && (
          <button type="button" className="new-reply" onClick={() => { scrollToLatest(); setHasNewReply(false); }}>{t(language, 'newReply')}</button>
        )}
        {compare.length > 0 && (
          <div className="compare-tray">
            <ul>
              {compare.map(item => (
                <li className="chip" key={item.id}>
                  <span lang="en">{item.name}</span>
                  <button type="button" className="chip-remove" aria-label={`${t(language, 'removeCompare')}: ${item.name}`} onClick={() => api.toggleCompare(item.id)}>×</button>
                </li>
              ))}
            </ul>
            {compare.length < 2
              ? <p className="meta">{t(language, 'pickOneMore')}</p>
              : <button type="button" className="button button-primary" disabled={busy} onClick={() => send({ type: 'compare', perfumeIds: compareIds }, `${t(language, 'compare')}: ${compare.map(i => i.name).join(', ')}`)}>{t(language, 'compare')}</button>}
            {compare.length >= MAX_COMPARE && <p className="meta">{t(language, 'compareLimit')}</p>}
          </div>
        )}
        {!started && (
          <div className="examples" role="group" aria-label={t(language, 'examplesLabel')}>
            {t(language, 'examples').map(example => (
              <button type="button" key={example} className="example" onClick={() => { setDraft(example); inputRef.current?.focus(); }}>{example}</button>
            ))}
          </div>
        )}
        <form className="composer" onSubmit={submit}>
          <label htmlFor="message" className="composer-label">{t(language, 'messageLabel')}</label>
          <div className="composer-row">
            <textarea
              id="message"
              ref={inputRef}
              rows={2}
              maxLength={1000}
              value={draft}
              placeholder={t(language, started ? 'messagePlaceholderActive' : 'messagePlaceholder')}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
            />
            {busy
              ? <button type="button" className="button" onClick={() => abortRef.current?.abort()}>{t(language, 'stop')}</button>
              : <button type="submit" className="button button-primary" disabled={!draft.trim()}>{t(language, 'send')}</button>}
          </div>
        </form>
      </div>

      <dialog className="drawer" ref={drawerRef} onClose={() => setDrawer(null)} aria-label={drawer ? `${drawer.brand} ${drawer.name}` : undefined}>
        {drawer && (
          <>
            <button type="button" className="button drawer-close" onClick={() => drawerRef.current?.close()}>{t(language, 'close')}</button>
            <DetailsContent block={drawer} language={language} />
          </>
        )}
      </dialog>

      <dialog className="confirm" ref={confirmRef}>
        <p>{t(language, 'newChatConfirm')}</p>
        <div className="option-row">
          <button type="button" className="button" onClick={() => confirmRef.current?.close()}>{t(language, 'cancel')}</button>
          <button type="button" className="button button-primary" onClick={startOver}>{t(language, 'confirm')}</button>
        </div>
      </dialog>
    </div>
  );
}
