import { CheckCircle2, Recycle } from 'lucide-react';
import type { Drive } from '../types';
import { DrivePhotoGrid } from './DrivePhotoGrid';
import { ExpandableText } from './ui/expandable-text';

/**
 * How a completed drive went: the admin's summary and the pictures. Whoever can see the drive sees
 * this (the server decides, so a team-only drive's pictures never reach anyone else).
 */
export const DriveRecap: React.FC<{ drive: Drive }> = ({ drive }) => {
  if (drive.status !== 'COMPLETED') return null;
  const completed = drive.completedAt ? new Date(drive.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-muted p-4" aria-labelledby="drive-recap">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-5 text-leaf" aria-hidden="true" />
        <h3 id="drive-recap" className="text-lg">How it went</h3>
      </div>
      {completed && <p className="-mt-2 text-sm text-muted-foreground">Completed on {completed}</p>}
      {drive.type === 'CLEANUP' && drive.wasteKg != null && (
        <p className="flex items-center gap-2 font-medium">
          <Recycle className="size-5 text-cleanup" aria-hidden="true" /> {drive.wasteKg.toLocaleString('en-IN')} kg of waste collected
        </p>
      )}
      {drive.summary && <ExpandableText text={drive.summary} />}
      <DrivePhotoGrid driveId={drive.id} />
    </section>
  );
};
