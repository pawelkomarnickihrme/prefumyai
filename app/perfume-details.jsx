'use client';

import { t } from '../src/i18n.mjs';
import { Icon, Photo, ScentProfile } from './visuals.jsx';

export function PerfumeContent({ perfume, language }) {
  return (
    <div className="perfume-content">
      <header className="detail-intro">
        <Photo item={perfume} language={language} />
        <div><p className="perfume-brand" lang="en">{perfume.brand}</p><h3 className="perfume-name" lang="en">{perfume.name}</h3><ScentProfile perfume={perfume} language={language} /></div>
      </header>
      <section className="detail-section">
        <h4 className="section-title">{t(language, 'noteJourney')}</h4>
        <dl className="note-journey">{(perfume.notes ?? []).map((note, index) => <div key={note.key}><dt><span className="note-number" aria-hidden="true">0{index + 1}</span>{note.label}</dt><dd>{note.value}</dd></div>)}</dl>
      </section>
      <section className="detail-section">
        <h4 className="section-title">{t(language, 'wearing')}</h4><p className="meta">{t(language, 'community')}</p>
        <dl className="wear-facts">{['longevity', 'sillage'].map(key => <div key={key}><dt><Icon name={key === 'sillage' ? 'projection' : 'clock'} size={18} />{t(language, key)}</dt><dd>{perfume[key] || t(language, 'noData')}</dd></div>)}</dl>
      </section>
      {perfume.priceSegment && <p className="meta">{t(language, 'priceSegment')}: {perfume.priceSegment}</p>}
      <section className="detail-section">
        <h4 className="section-title">{t(language, 'goodToKnow')}</h4>
        {language === 'pl' && <p className="meta">{t(language, 'sourceLanguage')}</p>}
        <div className="pros-cons">{['pros', 'cons'].map(key => <div key={key}><h5>{t(language, key)}</h5>{perfume[key]?.length ? <ul lang="en">{perfume[key].slice(0, 5).map((text, index) => <li key={index}>{text}</li>)}</ul> : <p className="meta">{t(language, 'noData')}</p>}</div>)}</div>
      </section>
      <p className="sample-note"><Icon name="leaf" />{t(language, 'sampleHint')}</p>
    </div>
  );
}
