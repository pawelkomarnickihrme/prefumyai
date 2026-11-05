'use client';

import { t } from '../src/i18n.mjs';

function Bottle({ language }) {
  return (
    <div className="placeholder">
      <svg viewBox="0 0 48 72" width="40" height="60" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25">
        <rect x="18" y="3" width="12" height="11" rx="1.5" />
        <path d="M20 14v6M28 14v6" />
        <rect x="7" y="20" width="34" height="49" rx="4" />
        <path d="M14 36h20" />
      </svg>
      <span>{t(language, 'noImage')}</span>
    </div>
  );
}

function Photo({ item, language }) {
  return (
    <div className="photo">
      {item.imageUrl
        ? <img src={item.imageUrl} alt={`${item.brand} ${item.name}`} referrerPolicy="no-referrer" loading="lazy" />
        : <Bottle language={language} />}
    </div>
  );
}

function Recommendations({ block, language, api, saved }) {
  return (
    <>
      <ul className="cards">
        {block.cards.map(card => {
          const favorite = saved.favorites.some(item => item.id === card.id);
          const owned = saved.owned.some(item => item.id === card.id);
          return (
            <li className="card" key={card.id}>
              <Photo item={card} language={language} />
              <div className="card-body">
                <p className="perfume-brand" lang="en">{card.brand}</p>
                {/* The button stretches over the whole card in CSS, so the card opens details by mouse and keyboard. */}
                <h3 className="perfume-name" lang="en">
                  <button type="button" className="card-open" aria-label={`${t(language, 'details')}: ${card.brand} ${card.name}`} onClick={() => api.openDetails(card)}>{card.name}</button>
                </h3>
                {card.facts?.length > 0 && (
                  <dl className="card-facts">
                    {card.facts.map(fact => (
                      <div key={fact.label}><dt>{fact.label}</dt> <dd>{fact.value}</dd></div>
                    ))}
                  </dl>
                )}
                <h4>{t(language, 'whyFits')}</h4>
                <p>{card.why}</p>
                {card.tradeoff && (<><h4>{t(language, 'goodToKnow')}</h4><p>{card.tradeoff}</p></>)}
              </div>
              <div className="card-actions">
                <button type="button" className="button" aria-pressed={favorite} onClick={() => api.toggleSaved('favorites', card)}>
                  {t(language, favorite ? 'removeFavorite' : 'addFavorite')}
                </button>
                <button type="button" className="button" aria-pressed={owned} onClick={() => api.toggleSaved('owned', card)}>
                  {t(language, owned ? 'removeOwned' : 'addOwned')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="hint">{t(language, 'sampleHint')}</p>
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
      value: p => (p.scales[index].value === null ? t(language, 'noData') : `${p.scales[index].value} ${t(language, 'outOf')}`),
    })),
    { label: t(language, 'longevity'), source: t(language, 'community'), value: p => orNoData(p.longevity, language) },
    { label: t(language, 'sillage'), source: t(language, 'community'), value: p => orNoData(p.sillage, language) },
    { label: t(language, 'wearSeason'), source: t(language, 'community'), value: p => orNoData(p.season, language) },
    { label: t(language, 'wearTime'), source: t(language, 'community'), value: p => orNoData(p.timeOfDay, language) },
  ];
  return (
    <section className="comparison" style={{ '--columns': block.perfumes.length }}>
      <h3 className="section-title">{t(language, 'compareTitle')}</h3>
      <p>{block.summary}</p>
      <p className="meta">{t(language, 'sharedNotes')}: {listOrNoData(block.sharedNotes, language)}</p>
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
export function Block({ block, language, api, saved }) {
  switch (block.type) {
    case 'recommendations': return <Recommendations block={block} language={language} api={api} saved={saved} />;
    case 'question': return <Question block={block} api={api} />;
    case 'noMatch': return <NoMatch block={block} language={language} api={api} />;
    case 'comparison': return <Comparison block={block} language={language} />;
    case 'comment': return <p className="comment">{block.text}</p>;
    default: return null;
  }
}
