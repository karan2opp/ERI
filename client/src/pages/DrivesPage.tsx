import { useState } from 'react';
import type { Drive, LatLng } from '../types';
import { Page } from '../components/ui/top-bar';
import { DriveView } from '../components/DriveView';
import { DrivesBrowser } from '../components/DrivesBrowser';

/**
 * All planting drives, for everyone. Opening a drive lays its page over the list, so going back
 * keeps the search, filters and page you were on.
 */
export const DrivesPage: React.FC<{ you: LatLng | null; onClose: () => void; onShowOnMap: (d: Drive) => void }> = ({ you, onClose, onShowOnMap }) => {
  const [open, setOpen] = useState<Drive | null>(null);
  return (
    <>
      <Page title="Planting drives" onBack={onClose} wide>
        <DrivesBrowser onOpen={setOpen} />
      </Page>
      {open && (
        <Page title="Planting drive" onBack={() => setOpen(null)}>
          <DriveView drive={open} you={you} onShowOnMap={onShowOnMap} />
        </Page>
      )}
    </>
  );
};
