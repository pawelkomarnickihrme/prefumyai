'use client';

import { t } from '../src/i18n.mjs';
import { Icon, Photo as PerfumePhoto, Scale, ScentProfile } from './visuals.jsx';
import { PerfumeContent } from './perfume-details.jsx';

function Recommendations({ block, language, api, saved, busy }) {
  return (
    <>
      <ul className="cards">
        {block.cards.map((card, index) => {
          const favorite = saved.favorites.some(item => item.id === card.id);
          const owned = saved.owned.some(item => item.id === card.id);
          return (
            <li className="card" key={card.id}>
              <div className="card-visual"><span className="card-index" aria-hidden="true">0{index + 1}</span><PerfumePhoto item={card} language={language} /></div>
              <div className="card-body">
                <div className="card-heading"><div><p className="perfume-brand" lang="en">{card.brand}</p><h3 className="perfume-name" lang="en"><a className="card-open" href="#conversation" aria-label={`${t(language, 'details')}: ${card.brand} ${card.name}`} aria-disabled={busy} onClick={event => { event.preventDefault(); if (!busy) api.openDetails(card); }}>{card.name}</a></h3></div><Icon name="arrow" size={20} /></div>
                <ScentProfile perfume={card} language={language} compact />
                <div className="card-reason"><h4><Icon name="leaf" size={16} />{t(language, 'whyFits')}</h4><p>{card.why}</p></div>
                {card.tradeoff && <div className="card-tradeoff"><h4>{t(language, 'goodToKnow')}</h4><p>{card.tradeoff}</p></div>}
                <div className="card-actions">
                  <button type="button" className="card-action" aria-label={`${t(language, favorite ? 'removeFavorite' : 'addFavorite')}: ${card.brand} ${card.name}`} aria-pressed={favorite} onClick={() => api.toggleSaved('favorites', card)}><Icon name={favorite ? 'check' : 'bookmark'} size={18} />{t(language, favorite ? 'saved' : 'save')}</button>
                  <button type="button" className="card-action" aria-label={`${t(language, owned ? 'removeOwned' : 'addOwned')}: ${card.brand} ${card.name}`} aria-pressed={owned} disabled={busy} onClick={() => api.toggleSaved('owned', card)}><Icon name={owned ? 'check' : 'bottle'} size={18} />{t(language, owned ? 'alreadyOwned' : 'iOwn')}</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="sample-note"><Icon name="leaf" size={18} />{t(language, 'sampleHint')}</p>
    </>
  );
}

function Question({ block, api }) {
  return (
    <div className="question">
      <p className="question-text">{block.text}</p>
      <div className="option-row">
        {block.options.map(option => (
          <button type="button" className="button" key={option.label} onClick={() => api.send({ type: 'operations', operations: option.operations }, option.label)}>{option.label}</button>
        ))}
      </div>
    </div>
  );
}

function NoMatch({ block, language, api }) {
  return (
    <div className="question">
      <p className="question-text">{t(language, 'noMatch')}</p>
      <p>{t(language, block.options.length ? 'relaxPrompt' : 'noRelax')}</p>
      <div className="option-row">
        {block.options.map(option => (
          <button type="button" className="button" key={option.label} onClick={() => api.send({ type: 'operations', operations: [option.operation] }, option.label)}>{option.label}</button>
        ))}
      </div>
    </div>
  );
}

const orNoData = (value, language) => value ?? t(language, 'noData');
const listOrNoData = (list, language) => (list.length ? list.join(', ') : t(language, 'noData'));

function Comparison({ block, language }) {
  const rows = [
    { label: t(language, 'character'), value: p => orNoData(p.profile, language) },
    ...['topNotes', 'heartNotes', 'baseNotes'].map(key => ({ label: t(language, key), value: p => orNoData(p[key], language) })),
    { label: t(language, 'uniqueNotes'), value: p => listOrNoData(p.uniqueNotes, language) },
    ...block.perfumes[0].scales.map((scale, index) => ({
      label: scale.label,
      source: t(language, 'estimated'),
      value: p => <Scale value={p.scales[index]?.value} language={language} />,
    })),
    { label: t(language, 'longevity'), source: t(language, 'community'), value: p => orNoData(p.longevity, language) },
    { label: t(language, 'sillage'), source: t(language, 'community'), value: p => orNoData(p.sillage, language) },
    { label: t(language, 'wearSeason'), source: t(language, 'community'), value: p => orNoData(p.season, language) },
    { label: t(language, 'wearTime'), source: t(language, 'community'), value: p => orNoData(p.timeOfDay, language) },
  ];
  return (
    <section className="comparison" style={{ '--columns': block.perfumes.length }}>
      <div className="comparison-intro"><p className="eyebrow"><Icon name="compare" size={16} />{t(language, 'sideBySide')}</p><h3 className="section-title">{t(language, 'compareTitle')}</h3><p>{block.summary}</p></div>
      <div className="comparison-products">{block.perfumes.map((perfume, index) => <div className="comparison-product" key={perfume.id}><span className="eyebrow">0{index + 1}</span><PerfumePhoto item={perfume} language={language} /><p className="perfume-brand" lang="en">{perfume.brand}</p><h4 className="perfume-name" lang="en">{perfume.name}</h4></div>)}</div>
      <p className="shared-notes"><Icon name="leaf" size={18} /><span><strong>{t(language, 'sharedNotes')}</strong><br />{listOrNoData(block.sharedNotes, language)}</span></p>
      {rows.map(row => (
        <div className="criterion" key={row.label}>
          <h4>{row.label}{row.source && <span className="meta"> · {row.source}</span>}</h4>
          <dl className="criterion-values">
            {block.perfumes.map(perfume => (
              <div key={perfume.id}>
                <dt lang="en"><strong>{perfume.brand}</strong> {perfume.name}</dt>
                <dd>{row.value(perfume)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

// A closed set of components: anything else from the server renders nothing.
export function Block({ block, language, api, saved, busy = false }) {
  switch (block.type) {
    case 'recommendations': return <Recommendations block={block} language={language} api={api} saved={saved} busy={busy} />;
    case 'details': return <section className="inline-details"><PerfumeContent perfume={block.perfume} language={language} /></section>;
    case 'question': return <Question block={block} api={api} />;
    case 'noMatch': return <NoMatch block={block} language={language} api={api} />;
    case 'comparison': return <Comparison block={block} language={language} />;
    case 'comment': return <p className="comment">{block.text}</p>;
    default: return null;
  }
}
