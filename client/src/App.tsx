import { lazy, Suspense } from 'react';
import { Spinner } from './components/ui/spinner';
import { HomePage } from './pages/HomePage';
import { MediaPage } from './pages/MediaPage';
import { DonatePage } from './pages/DonatePage';
import { AboutPage } from './pages/AboutPage';

// The map app (Leaflet, the Admin pages, planting...) is a separate file the browser fetches only for /map, so the
// public pages that search engines and first-time visitors land on stay small and quick to show.
const MapApp = lazy(() => import('./MapApp'));
// A shared drive link (/?drive=...) shows a small map, so that page loads the map code only when it is opened
const SharedDrivePage = lazy(() => import('./pages/SharedDrivePage').then((m) => ({ default: m.SharedDrivePage })));

const Loading = (
  <main className="grid min-h-dvh place-items-center bg-background" aria-busy="true">
    <Spinner className="size-9 text-primary" label="Loading" />
  </main>
);

export default function App() {
  const sharedDriveId = new URLSearchParams(window.location.search).get('drive');
  // The page-load intro (components/IntroAnimation.tsx) is switched off for now.
  // To bring it back, import it here and render <IntroAnimation /> after the page.
  if (sharedDriveId) {
    return (
      <Suspense fallback={Loading}>
        <SharedDrivePage driveId={sharedDriveId} />
      </Suspense>
    );
  }
  // The home page is only the bare address, the Donate page /donate, About /about and Media /media; every other path (/map, and sign-in return addresses) is the app
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '') return <HomePage />;
  if (path === '/donate') return <DonatePage />;
  if (path === '/about') return <AboutPage />;
  if (path === '/media') return <MediaPage />;
  return (
    <Suspense fallback={Loading}>
      <MapApp />
    </Suspense>
  );
}
