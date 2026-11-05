import { useState } from 'react';
import { t } from '../src/i18n.mjs';

const paths = {
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  clock: 'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  projection: 'M8 8a6 6 0 0 1 0 8m4-12a11 11 0 0 1 0 16M4 12h.01',
  wood: 'm12 2-7 9h3l-4 6h6v5m2-20 7 9h-3l4 6h-8',
  smoke: 'M5 21h14M8 17c-6-6 6-6 0-12m7 12c-6-6 6-6 0-12',
  resin: 'M12 2C10 7 5 11 5 15a7 7 0 0 0 14 0c0-4-5-8-7-13ZM9 14c-1 2 0 4 2 4',
  flower: 'M12 8c-8-12-15 2-5 4-10 2-3 16 5 4 8 12 15-2 5-4 10-2 3-16-5-4ZM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  compare: 'M4 5h16M8 3v18M16 3v18M4 19h16',
  close: 'm6 6 12 12M6 18 18 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  leaf: 'M20 4C9 2 3 7 4 14c1 7 10 7 13 1 2-4 3-7 3-11ZM5 19 16 8',
  check: 'm5 12 4 4L19 6',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  bottle: 'M9 2h6v5H9zM10 7v3m4-3v3M7 10h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2ZM9 15h6',
};

export function Icon({ name, size = 20 }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.leaf} /></svg>;
}

// Original vector artwork: botanical atmosphere, never a depiction of a branded product.
export function BotanicalArt() {
  return (
    <svg className="botanical-art" viewBox="0 0 480 440" fill="none" aria-hidden="true">
      <ellipse cx="242" cy="246" rx="166" ry="166" fill="#E8EEE5" />
      <circle cx="242" cy="246" r="144" stroke="#B2BFAE" strokeWidth=".8" />
      <g stroke="#294C3B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M187 383c12-86 72-166 132-263M243 282c-55-2-100-31-110-83 56 3 90 33 110 83Z" fill="#CCD8C4" />
        <path d="M269 238c-2-57 20-98 78-127 7 55-20 102-78 127Z" fill="#B9CBB1" />
        <path d="M214 331c-48 2-84-16-104-55 47-5 81 13 104 55Z" fill="#DDE5D5" />
        <path d="M291 202c-24-33-26-70-8-110 31 31 33 66 8 110Z" fill="#DDE5D5" />
        <path d="m133 199 110 83m26-44 78-127m-237 165 104 55m69-239 8 110" />
        <path d="M235 374c53-23 99-63 126-126m-47 79c-10-39-1-69 31-91 18 36 6 67-31 91Z" fill="#E1E7D9" />
      </g>
      <g transform="rotate(-22 158 340)">
        <ellipse cx="158" cy="340" rx="65" ry="42" fill="#E2C589" stroke="#9A7839" strokeWidth="1.4" />
        <ellipse cx="158" cy="337" rx="55" ry="32" fill="#F5E8C5" stroke="#AE8D50" />
        <path d="m158 337-42-15m42 15-11-30m11 30 27-28m-27 28 51-5m-51 5 36 22m-36-22-4 31m4-31-39 22" stroke="#C7A86A" />
      </g>
      <g stroke="#9A7839" strokeWidth="1.3" fill="#FFFDFA">
        <path d="M340 305c-35-1-48-25-26-36-1-30 27-36 35-10 22-15 42 5 22 22 23 15 7 40-14 28-4 28-30 23-17-4Z" />
        <circle cx="345" cy="286" r="8" fill="#E2C589" />
      </g>
      <path d="M88 160h34m-17-17v34M363 365h22m-11-11v22" stroke="#9A7839" strokeWidth="1" />
      <circle cx="371" cy="180" r="3" fill="#9A7839" /><circle cx="126" cy="110" r="2" fill="#294C3B" />
    </svg>
  );
}

export function Photo({ item, language }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const show = item.imageUrl && item.imageUrl !== failedUrl;
  return (
    <div className={`photo${show ? ' photo-product' : ''}`}>
      {show ? <img src={item.imageUrl} alt={`${item.brand} ${item.name}`} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailedUrl(item.imageUrl)} /> : (
        <div className="placeholder"><Icon name="bottle" size={48} /><span>{t(language, 'noImage')}</span></div>
      )}
    </div>
  );
}

const facetIcon = key => {
  if (/incense|smok/.test(key)) return 'smoke';
  if (/resin|amber/.test(key)) return 'resin';
  if (/wood|oud|earth/.test(key)) return 'wood';
  if (/flor|rose|rosy/.test(key)) return 'flower';
  return 'leaf';
};
const scaleEnds = {
  pl: { freshness: ['Ciepły', 'Świeży'], sweetness: ['Wytrawny', 'Słodki'], intensity: ['Dyskretny', 'Wyrazisty'], formality: ['Swobodny', 'Elegancki'] },
  en: { freshness: ['Warm', 'Fresh'], sweetness: ['Dry', 'Sweet'], intensity: ['Discreet', 'Bold'], formality: ['Casual', 'Formal'] },
};

export function ScentProfile({ perfume, language, compact = false }) {
  const scales = (perfume.scales ?? []).filter(scale => scale.value != null && (!compact || scale.key !== 'formality'));
  const facets = perfume.facets ?? [];
  const wear = [...(perfume.wear ?? []), ...(compact && perfume.sillage ? [{ key: 'sillage', label: t(language, 'sillage'), value: perfume.sillage }] : [])];
  return <div className="scent-profile">
    {facets.length > 0 && <ul className="scent-facets" aria-label={t(language, 'character')}>{facets.map(facet => <li key={facet.key}><Icon name={facetIcon(facet.key)} size={20} /><span>{facet.label}</span></li>)}</ul>}
    {scales.length > 0 && <div className="scent-scales"><p className="meta">{t(language, 'estimated')}</p><dl>{scales.map(scale => { const ends = scaleEnds[language === 'en' ? 'en' : 'pl'][scale.key]; return <div className="scent-scale" key={scale.key ?? scale.label}><dt>{scale.label}</dt><dd><Scale value={scale.value} language={language} />{ends && <span className="scale-endpoints"><span>{ends[0]}</span><span>{ends[1]}</span></span>}</dd></div>; })}</dl></div>}
    {wear.length > 0 && <div className="scent-wear"><p className="meta">{t(language, 'community')}</p><dl>{wear.map(fact => <div key={fact.key}><dt><Icon name={fact.key === 'sillage' ? 'projection' : fact.key === 'season' ? 'leaf' : 'sun'} size={18} />{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></div>}
    {!facets.length && !scales.length && !wear.length && <p className="meta">{t(language, 'noData')}</p>}
  </div>;
}

export function Scale({ value, language }) {
  if (value == null) return <span className="meta">{t(language, 'noData')}</span>;
  return <span className="scale"><span className="scale-track" aria-hidden="true">{[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= value ? 'filled' : ''} />)}</span><span>{value} {t(language, 'outOf')}</span></span>;
}
