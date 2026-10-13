import { cn } from '../../lib/cn';

/** The Google logo and data credit that Google's terms require on the map. */
export const GoogleCredit: React.FC<{ dark: boolean; className?: string }> = ({ dark, className }) => (
  <div className={cn('pointer-events-none flex items-center gap-1.5', className)}>
    <img
      src={dark ? 'https://maps.gstatic.com/mapfiles/api-3/images/google_white5_hdpi.png' : 'https://maps.gstatic.com/mapfiles/api-3/images/google4_hdpi.png'}
      alt="Google"
      className="h-[18px] w-auto"
    />
    <span className={cn('rounded px-1 text-[10px] leading-4', dark ? 'bg-black/40 text-white/80' : 'bg-white/70 text-black/70')}>
      Map data ©{new Date().getFullYear()} Google
    </span>
  </div>
);
