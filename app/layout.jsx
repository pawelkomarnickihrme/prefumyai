import { Bodoni_Moda, Source_Sans_3 } from 'next/font/google';
import './globals.css';

const display = Bodoni_Moda({ subsets: ['latin', 'latin-ext'], variable: '--font-display', display: 'swap' });
const body = Source_Sans_3({ subsets: ['latin', 'latin-ext'], variable: '--font-body', display: 'swap' });

export const metadata = {
  title: 'Doradca perfumowy',
  description: 'Zamknięty test doradcy perfumowego.',
  robots: { index: false, follow: false },
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#F7F4EE' };

export default function RootLayout({ children }) {
  return (
    <html lang="pl" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
