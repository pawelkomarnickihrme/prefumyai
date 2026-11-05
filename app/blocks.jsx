'use client';

import { t } from '../src/i18n.mjs';

export function Bottle({ language }) {
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

function CommunityRating({ item, language }) {
  return <p className="meta">{item.rating.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 5 · {item.ratingCount.toLocaleString(language)} {t(language, 'votes')} · {t(language, 'community').toLowerCase()}</p>;
}

function Recommendations({ block, language, api, compareIds }) {
  return (
    <>
      <ol className="cards">
        {block.cards.map((card, index) => {
          const selected = compareIds.includes(card.id);
          return (
            <li className="card" key={card.id}>
              <Photo item={card} language={language} />
              <div className="card-body">
                <p className="eyebrow">{t(language, 'proposal')} {index + 1} · {card.brand}</p>
                <h3 className="perfume-name" lang="en">{card.name}</h3>
                <CommunityRating item={card} language={language} />
                <h4>{t(language, 'whyFits')}</h4>
                <p>{card.why}</p>
                {card.tradeoff && (<><h4>{t(language, 'goodToKnow')}</h4><p>{card.tradeoff}</p></>)}
              </div>
              <div className="card-actions">
                <button type="button" className="button" onClick={() => api.openDetails(card.id)}>{t(language, 'details')}</button>
                <button type="button" className="button" aria-pressed={selected} onClick={() => api.toggleCompare(card.id, card.name)}>
                  {t(language, selected ? 'removeCompare' : 'addCompare')}
                </button>
                <button type="button" className="link" onClick={() => api.send({ type: 'similar', perfumeId: card.id })}>{t(language, 'similar')}</button>
                <button type="button" className="link" onClick={() => api.send({ type: 'action', action: 'known', perfumeId: card.id })}>{t(language, 'known')}</button>
              </div>
            </li>
          );
        })}
      </ol>
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
    { label: t(language, 'uniqueNotes'), value: p => listOrNoData(p.uniqueNotes, language) },
    ...block.perfumes[0].scales.map((scale, index) => ({
      label: scale.label,
      source: t(language, 'estimated'),
      value: p => (p.scales[index].value === null ? t(language, 'noData') : `${p.scales[index].value} ${t(language, 'outOf')}`),
    })),
    { label: t(language, 'longevity'), source: t(language, 'community'), value: p => orNoData(p.longevity, language) },
    { label: t(language, 'sillage'), source: t(language, 'community'), value: p => orNoData(p.sillage, language) },
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
                <dt lang="en">{perfume.name}</dt>
                <dd>{row.value(perfume)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

function SourceList({ title, items, language }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length ? (
        <>
          <ul lang="en">{items.map(item => <li key={item}>{item}</li>)}</ul>
          {language !== 'en' && <p className="meta">{t(language, 'sourceLanguage')}</p>}
        </>
      ) : <p>{t(language, 'noData')}</p>}
    </section>
  );
}

export function DetailsContent({ block, language }) {
  return (
    <div className="details">
      <Photo item={block} language={language} />
      <p className="eyebrow">{block.brand}</p>
      <h2 className="section-title" lang="en">{block.name}</h2>
      <CommunityRating item={block} language={language} />
      <section><h3>{t(language, 'profile')}</h3><p>{orNoData(block.profile, language)}</p></section>
      <section>
        <h3>{t(language, 'topNotes')}</h3><p>{listOrNoData(block.notes.top, language)}</p>
        <h3>{t(language, 'heartNotes')}</h3><p>{listOrNoData(block.notes.heart, language)}</p>
        <h3>{t(language, 'baseNotes')}</h3><p>{listOrNoData(block.notes.base, language)}</p>
      </section>
      <section>
        <h3>{t(language, 'estimated')}</h3>
        <dl className="facts">
          {block.scales.map(scale => (
            <div key={scale.label}><dt>{scale.label}</dt><dd>{scale.value === null ? t(language, 'noData') : `${scale.value} ${t(language, 'outOf')}`}</dd></div>
          ))}
          <div><dt>{t(language, 'priceSegment')}</dt><dd>{orNoData(block.priceSegment, language)}</dd></div>
        </dl>
      </section>
      <section>
        <h3>{t(language, 'community')}</h3>
        <dl className="facts">
          <div><dt>{t(language, 'longevity')}</dt><dd>{orNoData(block.community.longevity, language)}</dd></div>
          <div><dt>{t(language, 'sillage')}</dt><dd>{orNoData(block.community.sillage, language)}</dd></div>
        </dl>
      </section>
      <SourceList title={t(language, 'pros')} items={block.pros} language={language} />
      <SourceList title={t(language, 'cons')} items={block.cons} language={language} />
    </div>
  );
}

// A closed set of components: anything else from the server renders nothing.
export function Block({ block, language, api, compareIds }) {
  switch (block.type) {
    case 'recommendations': return <Recommendations block={block} language={language} api={api} compareIds={compareIds} />;
    case 'question': return <Question block={block} api={api} />;
    case 'noMatch': return <NoMatch block={block} language={language} api={api} />;
    case 'comparison': return <Comparison block={block} language={language} />;
    case 'details': return <div className="inline-details"><DetailsContent block={block} language={language} /></div>;
    default: return null;
  }
}
