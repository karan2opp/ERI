import { Globe, Lock, Recycle, Sprout } from 'lucide-react';
import type { Drive } from '../types';
import { DRIVE_TYPE_LABEL, DRIVE_VISIBILITY_LABEL } from '../lib/drives';
import { Badge } from './ui/badge';

/** "Plantation drive" (brown) or "Clean-up drive" (purple). */
export const DriveTypeBadge: React.FC<{ type: Drive['type']; className?: string }> = ({ type, className }) => (
  <Badge variant={type === 'CLEANUP' ? 'cleanup' : 'drive'} className={className}>
    {type === 'CLEANUP' ? <Recycle aria-hidden="true" /> : <Sprout aria-hidden="true" />}
    {DRIVE_TYPE_LABEL[type]}
  </Badge>
);

/** Who can see the drive: everyone or team only. Shown only to people who can see team-only drives. */
export const DriveVisibilityBadge: React.FC<{ visibility: Drive['visibility']; className?: string }> = ({ visibility, className }) => (
  <Badge variant="outline" className={className}>
    {visibility === 'ALL' ? <Globe aria-hidden="true" /> : <Lock aria-hidden="true" />}
    {DRIVE_VISIBILITY_LABEL[visibility]}
  </Badge>
);
