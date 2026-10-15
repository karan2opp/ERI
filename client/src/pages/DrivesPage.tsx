import { useState } from 'react';
import type { Drive, LatLng, Role } from '../types';
import { canSeeTeamDrives } from '../lib/roles';
import { Page } from '../components/ui/top-bar';
import { DriveView } from '../components/DriveView';
import { DrivesBrowser } from '../components/DrivesBrowser';

/**
 * Plantation and clean-up drives. Signed-out visitors and normal users see the drives marked for
 * everyone; team members also see team-only drives, and admins see all of them (the server decides).
 * Opening a drive lays its page over the list, so going back keeps the search, filters and page you were on.
 */
export const DrivesPage: React.FC<{ role: Role; you: LatLng | null; onClose: () => void; onShowOnMap: (d: Drive) => void }> = ({ role, you, onClose, onShowOnMap }) => {
  const [open, setOpen] = useState<Drive | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const team = canSeeTeamDrives(role);
  return (
    <>
      <Page title="Drives" onBack={onClose} wide>
        <DrivesBrowser onOpen={setOpen} showVisibility={team} refreshKey={refreshKey} />
      </Page>
      {open && (
        <Page title="Drive" onBack={() => setOpen(null)}>
          <DriveView
            drive={open}
            you={you}
            onShowOnMap={onShowOnMap}
            showVisibility={team}
            onUpdated={role === 'ADMIN' ? (d) => { setOpen(d); setRefreshKey((k) => k + 1); } : undefined}
          />
        </Page>
      )}
    </>
  );
};
