import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { HandHeart, Mail, MapPin, Phone } from 'lucide-react';
import type { Role } from '../../types';
import { fetchSiteInfo, setAuthTokenGetter, syncCurrentUser, type SiteInfo } from '../../services/api';
import { asRole } from '../../lib/roles';
import { formatPhone } from '../../lib/phone';
import { cn } from '../../lib/cn';
import { Logo } from '../ui/logo';
import { ProfileDrawer } from '../ProfileDrawer';
import { NotificationBell } from '../NotificationBell';

// The public pages (home and Donate) share this header, footer and button style.

export const MAP = '/map';
export const DRIVES = '/map?open=drives';
export const DONATE = '/donate';
export const ABOUT = '/about';

/** The public pages' buttons: slightly rounded rectangles, not pills. */
export const siteButton = (kind: 'primary' | 'secondary' | 'light', size: 'sm' | 'md' | 'lg', className?: string) =>
  cn(
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors select-none [&_svg]:shrink-0',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    // light: white with a green outline, for pale-green panels where the secondary colour would disappear
    kind === 'primary'
      ? 'bg-primary text-primary-foreground hover:bg-primary/85'
      : kind === 'light'
        ? 'bg-card text-primary ring-1 ring-primary/40 hover:bg-accent'
        : 'bg-secondary text-secondary-foreground hover:bg-accent',
    size === 'sm' ? 'h-9 px-3 text-sm [&_svg]:size-4' : size === 'md' ? 'h-11 px-3 text-[15px] [&_svg]:size-[18px]' : 'h-12 px-6 text-base [&_svg]:size-5',
    className
  );

// Loaded once per page and shared by everything on it
let siteInfoRequest: Promise<SiteInfo> | null = null;

/** The admin-set links and contact details ("" for anything not set yet), or null while loading. */
export function useSiteInfo(): SiteInfo | null {
  const [info, setInfo] = useState<SiteInfo | null>(null);
  useEffect(() => {
    siteInfoRequest ??= fetchSiteInfo().catch((err) => {
      siteInfoRequest = null;
      throw err;
    });
    let cancelled = false;
    siteInfoRequest.then(
      (i) => !cancelled && setInfo(i),
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return info;
}

/** Who is signed in and what they may do (the profile menu shows Admin only to admins). */
function useSiteRole(): Role {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [role, setRole] = useState<Role>('USER');
  useEffect(() => {
    if (!isLoaded) return;
    setAuthTokenGetter(isSignedIn ? getToken : null);
    if (!isSignedIn) {
      setRole('USER');
      return;
    }
    let cancelled = false;
    syncCurrentUser().then(
      (u) => !cancelled && setRole(asRole(u.role)),
      () => {}
    );
    return () => {
      cancelled = true;
    };
    // getToken is stable for a session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);
  return role;
}

/**
 * The header of the public pages. With `overPhoto` it floats on the page's top picture with no background and
 * white text, and turns solid white once the whole picture has scrolled past it; without, it is a normal solid bar.
 */
export const SiteHeader: React.FC<{ overPhoto?: React.RefObject<HTMLElement | null> }> = ({ overPhoto }) => {
  const role = useSiteRole();
  // The profile menu's pages live in the app, so its links open them there
  const inApp = (page: string) => () => window.location.assign(`/map?open=${page}`);

  const [atTop, setAtTop] = useState(Boolean(overPhoto));
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!overPhoto) return;
    const onScroll = () => {
      const heroBottom = overPhoto.current?.getBoundingClientRect().bottom ?? 1;
      setAtTop(heroBottom > (headerRef.current?.offsetHeight ?? 72));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [overPhoto]);

  const link = 'hover:text-primary group-data-[top=true]/header:hover:text-white/75';
  return (
    <header
      ref={headerRef}
      data-top={atTop}
      className={cn(
        'group/header pt-safe top-0 z-30 border-b border-border bg-background/95 backdrop-blur transition-colors data-[top=true]:border-transparent data-[top=true]:bg-transparent data-[top=true]:backdrop-blur-none',
        overPhoto ? 'fixed inset-x-0' : 'sticky'
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pb-3">
        <a href="/" aria-label="Earth Revival Initiative home" className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <Logo hideNameOnNarrow lightOverPhoto />
        </a>
        <nav className="hidden items-center gap-6 font-medium lg:flex group-data-[top=true]/header:text-white" aria-label="Site">
          <a href={ABOUT} className={link}>About</a>
          <a href="/#how" className={link}>How it works</a>
          <a href="/#drives" className={link}>Drives</a>
          <a href="/#join" className={link}>Get involved</a>
          <a href={DONATE} className={link}>Donate</a>
        </nav>
        <div className="flex items-center gap-2">
          <a href={MAP} className={siteButton('primary', 'sm')}>
            <MapPin aria-hidden="true" /> Open the map
          </a>
          <NotificationBell compact />
          <ProfileDrawer compact role={role} onMyTrees={inApp('myTrees')} onDrives={inApp('drives')} onAccount={inApp('account')} onAdmin={inApp('admin')} />
        </div>
      </div>
    </header>
  );
};

/** Instagram's camera mark, drawn simply (the icon set we use has no brand logos). */
const InstagramIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
  </svg>
);

/** YouTube's play button, drawn simply. */
const YoutubeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="4" />
    <path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" />
  </svg>
);

/**
 * One social or contact link. Until an admin sets it in Admin > Socials it is shown greyed out as a placeholder
 * ("Coming soon"), so the footer keeps its shape and never has a link that goes nowhere.
 */
const FooterContact: React.FC<{ href: string | null; icon: React.ReactNode; label: string; text?: string; external?: boolean }> = ({ href, icon, label, text, external }) =>
  href ? (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="inline-flex items-center gap-2 rounded-lg hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-5"
    >
      {icon} {text ?? label}
      {external && <span className="sr-only">(opens in a new tab)</span>}
    </a>
  ) : (
    <span className="inline-flex items-center gap-2 text-muted-foreground/70 [&_svg]:size-5" title="Coming soon">
      {icon} {label} <span className="text-xs">(coming soon)</span>
    </span>
  );

/** The footer of the public pages: the lockup, page links, social links and how to reach us. */
export const SiteFooter: React.FC = () => {
  const info = useSiteInfo();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="text-sm text-muted-foreground">Plant today, revive tomorrow.</p>
        </div>

        <nav className="flex flex-col gap-2 font-medium" aria-label="Footer">
          <h2 className="font-sans text-sm font-semibold text-muted-foreground">Explore</h2>
          <a href={ABOUT} className="hover:text-primary">About us</a>
          <a href={MAP} className="hover:text-primary">Tree map</a>
          <a href={DRIVES} className="hover:text-primary">Drives</a>
          <a href="/#how" className="hover:text-primary">How it works</a>
          <a href={DONATE} className="inline-flex items-center gap-1.5 hover:text-primary">
            <HandHeart className="size-4" aria-hidden="true" /> Donate
          </a>
        </nav>

        <div className="flex flex-col gap-2 font-medium">
          <h2 className="font-sans text-sm font-semibold text-muted-foreground">Follow us</h2>
          <FooterContact href={info?.instagramUrl || null} icon={<InstagramIcon />} label="Instagram" external />
          <FooterContact href={info?.youtubeUrl || null} icon={<YoutubeIcon />} label="YouTube" external />
        </div>

        <div className="flex flex-col gap-2 font-medium">
          <h2 className="font-sans text-sm font-semibold text-muted-foreground">Contact</h2>
          <FooterContact href={info?.contactEmail ? `mailto:${info.contactEmail}` : null} icon={<Mail />} label="Email" text={info?.contactEmail} />
          <FooterContact href={info?.contactPhone ? `tel:${info.contactPhone}` : null} icon={<Phone />} label="Phone" text={formatPhone(info?.contactPhone)} />
        </div>
      </div>
      <p className="pb-safe mx-auto max-w-6xl px-4 text-sm text-muted-foreground">© {new Date().getFullYear()} Earth Revival Initiative</p>
    </footer>
  );
};
