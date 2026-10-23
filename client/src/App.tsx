import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/react';
import { Calendar, CheckCircle2, LocateFixed, Plus } from 'lucide-react';
import type { Drive, LatLng, Role, Tree } from './types';
import { browseTrees, fetchGlobalDrives, fetchTreeById, fetchTreePins, setAuthTokenGetter, syncCurrentUser, type PinsResult, type TreePin } from './services/api';
import { pinFromTree, snapToTiles, type MapView } from './lib/pins';
import { reconnectSocket } from './utils/socket';
import { formatDistance, formatMinutes, getDistanceInMeters } from './utils/geo';
import { STATUS_LABEL, treeStatus } from './lib/trees';
import { useWalkingRoute } from './lib/route';
import { useHeading } from './lib/heading';
import { asRole, canSeeTeamDrives, isAdminRole } from './lib/roles';
import { formatDriveDate, isUpcoming, splitDrives } from './lib/drives';
import { cn } from './lib/cn';
import { useIsDark } from './lib/theme';
import { useTileSource } from './lib/tiles';
import { GoogleCredit } from './components/map/MapCredit';
import { TreeMap, type FlyToTarget } from './components/map/TreeMap';
import { MapSheet, type SheetState } from './components/map/MapSheet';
import { ItemPeek, NavigationPeek, SearchPeek } from './components/map/SheetPeek';
import { NearbyPanel, type DistanceFilter } from './components/map/NearbyPanel';
import { TreeDetails } from './components/map/TreeDetails';
import { DriveDetails } from './components/map/DriveDetails';
import { NavigationCard, NavigationPanel } from './components/map/NavigationPanel';
import { ProfileDrawer } from './components/ProfileDrawer';
import { LiveTracker } from './components/LiveTracker';
import { Button } from './components/ui/button';
import { Chips } from './components/ui/chips';
import { StatusDot } from './components/ui/badge';
import { Alert } from './components/ui/alert';
import { Logo } from './components/ui/logo';
import { PlantTreePage } from './pages/PlantTreePage';
import { EditTreePage } from './pages/EditTreePage';
import { MyTreesPage } from './pages/MyTreesPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { DrivesPage } from './pages/DrivesPage';
import { SharedDrivePage } from './pages/SharedDrivePage';
import { HomePage } from './pages/HomePage';
import { DonatePage } from './pages/DonatePage';
import { AboutPage } from './pages/AboutPage';
import { NotificationBell } from './components/NotificationBell';

type StatusFilter = 'ALL' | 'THIRSTY' | 'HEALTHY' | 'MINE';
type Screen = 'map' | 'plant' | 'edit' | 'myTrees' | 'account' | 'admin' | 'drives';
type Selection = { kind: 'tree' | 'drive'; id: string } | null;
type Destination = { name: string; at: LatLng };

// India, zoomed out, for a first visit before we know where you are
const INDIA: LatLng = { lat: 22.5, lng: 79 };
const LAST_LOCATION_KEY = 'plantree.lastLocation';

const readLastLocation = (): LatLng | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_LOCATION_KEY) ?? 'null');
    return saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng) ? saved : null;
  } catch {
    return null;
  }
};

export default function App() {
  const sharedDriveId = new URLSearchParams(window.location.search).get('drive');
  // The page-load intro (components/IntroAnimation.tsx) is switched off for now.
  // To bring it back, import it here and render <IntroAnimation /> after the page.
  if (sharedDriveId) return <SharedDrivePage driveId={sharedDriveId} />;
  // The home page is only the bare address, the Donate page /donate and About /about; every other path (/map, and sign-in return addresses) is the app
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '') return <HomePage />;
  if (path === '/donate') return <DonatePage />;
  if (path === '/about') return <AboutPage />;
  return <MapApp />;
}

/**
 * Full-screen pages sit in browser history, so the phone's back button (or swipe back)
 * closes them instead of leaving the app.
 */
function useScreens() {
  // /map?open=drives (and myTrees, account, admin: the home page's links) opens on that page, with the map behind it for the back button
  const [first] = useState<Screen>(() => {
    const asked = new URLSearchParams(window.location.search).get('open');
    return asked === 'drives' || asked === 'myTrees' || asked === 'account' || asked === 'admin' ? asked : 'map';
  });
  const [screen, setScreen] = useState<Screen>(first);
  useEffect(() => {
    window.history.replaceState({ ptScreen: 'map' }, '');
    if (first !== 'map') window.history.pushState({ ptScreen: first }, '');
    const onPop = (e: PopStateEvent) => setScreen((e.state?.ptScreen as Screen) ?? 'map');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const open = useCallback((s: Screen) => {
    window.history.pushState({ ptScreen: s }, '');
    setScreen(s);
  }, []);
  const replace = useCallback((s: Screen) => {
    window.history.replaceState({ ptScreen: s }, '');
    setScreen(s);
  }, []);
  const back = useCallback(() => window.history.back(), []);
  return { screen, open, replace, back };
}

function MapApp() {
  const { getToken, isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const { user: clerkUser } = useUser();
  const { screen, open, replace, back } = useScreens();

  const [role, setRole] = useState<Role>('USER');
  // Your own phone number (optional, not verified)
  const [phone, setPhone] = useState<string | null>(null);
  // Team members and admins also see team-only drives; the server sends each person only what they may see
  const seesTeamDrives = canSeeTeamDrives(role);
  const [you, setYou] = useState<LatLng | null>(null);
  // How sure the phone is of where you are (metres), and the direction you're moving (GPS only reports it while moving)
  const [youAccuracy, setYouAccuracy] = useState<number | null>(null);
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const youHeading = useHeading(gpsHeading);
  const [locError, setLocError] = useState<string | null>(null);
  const [start] = useState<LatLng | null>(readLastLocation);
  // The first location fix, a location error, or giving up waiting, whichever comes first. Until then the
  // map shows a loading card, so the map and your marker appear together.
  const [located, setLocated] = useState(false);
  // Load tiles straight away if we remember where you were (most likely the same tiles), otherwise only
  // once we know where to show, so a first visit doesn't load all of India and then your street
  const mapReady = start !== null || located;
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);

  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [distance, setDistance] = useState<DistanceFilter>('ALL');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<SheetState>('half');
  const [selection, setSelection] = useState<Selection>(null);
  // Drives this person may see (null while loading)
  const [drives, setDrives] = useState<Drive[] | null>(null);
  const [editing, setEditing] = useState<Tree | null>(null);

  const [destination, setDestination] = useState<Destination | null>(null);
  const [walkLive, setWalkLive] = useState<{ room: string; name: string } | null>(null);

  const [banner, setBanner] = useState<string | null>(null);

  const userId = clerkUser?.id ?? null;
  const dark = useIsDark();
  const tiles = useTileSource(dark);

  // ---- Auth: send the Clerk token with API calls and ask the server who we are (role) ----
  useEffect(() => {
    setAuthTokenGetter(isSignedIn ? getToken : null);
    reconnectSocket();
    if (!isSignedIn) {
      setRole('USER');
      setPhone(null);
      return;
    }
    let cancelled = false;
    syncCurrentUser()
      .then((u) => {
        if (cancelled) return;
        setRole(asRole(u.role));
        setPhone(u.phone ?? null);
      })
      .catch((err) => console.warn('User sync notice:', err));
    return () => {
      cancelled = true;
    };
    // getToken is stable per session; re-run on sign-in/out and account switches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, userId]);

  // ---- Your location: follow it; the first fix centres the map ----
  // Bumping this restarts the search for your location (the "Try again" button, or location being allowed later)
  const [locationAttempt, setLocationAttempt] = useState(0);
  // Whether we've had any position yet this visit: the first one moves the map to you
  const hadFix = useRef(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError("This browser can't share your location.");
      setLocated(true);
      return;
    }
    let cancelled = false;
    // A precise GPS fix replaces the quick rough one, never the other way round
    let gotPrecise = false;
    const giveUp = window.setTimeout(() => setLocated(true), 2500);

    const apply = (pos: GeolocationPosition) => {
      if (cancelled) return;
      const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setYou(at);
      setYouAccuracy(pos.coords.accuracy);
      // Standing still, GPS reports no direction: keep the last one instead of dropping the cone
      if (pos.coords.heading !== null && Number.isFinite(pos.coords.heading)) setGpsHeading(pos.coords.heading);
      setLocError(null);
      try {
        localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(at));
      } catch {
        // Storage blocked: we just won't remember it
      }
      if (!hadFix.current) {
        hadFix.current = true;
        // Jump, don't fly: flying from a zoomed-out view loads tiles at every zoom level on the way.
        // If you're where we remembered (the map already opened there), don't move it at all.
        const moved = !start || getDistanceInMeters(start.lat, start.lng, at.lat, at.lng) > 30;
        if (moved) setFlyTo({ ...at, zoom: 16, instant: true, timestamp: Date.now() });
        setLocated(true);
      }
    };

    // Each kind of failure gets its own message. Only "blocked" is final: for the others the watch
    // below keeps trying by itself, so the message says so.
    const fail = (err: GeolocationPositionError) => {
      if (cancelled) return;
      setLocated(true);
      if (err.code === err.PERMISSION_DENIED) {
        setLocError('Location access is blocked. Allow it for this site in your browser settings to see the trees nearest you.');
      } else if (err.code === err.TIMEOUT) {
        setLocError('Your location is taking a while, which is common indoors. Still trying…');
      } else {
        setLocError("We can't find your location right now. Check that location is on. Still trying…");
      }
    };

    // 1. A quick rough position from Wi-Fi or the mobile network, so the map can show you in a moment
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!gotPrecise) apply(pos);
      },
      () => {
        // Ignore: the precise watch below reports its own errors
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );

    // 2. Precise GPS, followed as you move. After a timeout or a lost signal the browser keeps trying.
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        gotPrecise = true;
        apply(pos);
      },
      (err) => {
        fail(err);
        // Blocked: the browser won't try again, so stop watching (allowing it later restarts this)
        if (err.code === err.PERMISSION_DENIED) navigator.geolocation.clearWatch(id);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 }
    );

    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      navigator.geolocation.clearWatch(id);
    };
    // `start` is read once on load and never changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationAttempt]);

  // Start looking again by itself if location is allowed later (e.g. in the browser's site settings)
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (status?.state === 'granted') setLocationAttempt((n) => n + 1);
    };
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((s) => {
        status = s;
        s.addEventListener('change', onChange);
      })
      .catch(() => {
        // This browser can't tell us; the Try again button still works
      });
    return () => status?.removeEventListener('change', onChange);
  }, []);

  const retryLocation = useCallback(() => {
    setLocError(null);
    setLocationAttempt((n) => n + 1);
  }, []);

  // The locate button: go to you, or start looking again if we don't know where you are
  const locate = useCallback(() => {
    if (you) setFlyTo({ ...you, zoom: 16, timestamp: Date.now() });
    else retryLocation();
  }, [you, retryLocation]);

  // ---- Trees ----
  // The map draws only what's in view (GET /trees/pins); lists page on the server. Both reload when
  // loadTrees() is called (after planting, watering, editing or deleting a tree).
  const [listRefresh, setListRefresh] = useState(0);
  const [listTotal, setListTotal] = useState<number | null>(null);
  const [mapView, setMapView] = useState<MapView | null>(null);
  const [pins, setPins] = useState<PinsResult | null>(null);
  // Bumped after a change, so the map skips its 30-second cached answer and shows the change at once
  const [pinsVersion, setPinsVersion] = useState(0);
  // Your tree counts (profile drawer and Account), from the server
  const [myTreeSummary, setMyTreeSummary] = useState<{ total: number; thirsty: number } | null>(null);
  // Pins only carry what the map draws; the selected tree's full details are fetched when it's tapped
  const [selectedTreeData, setSelectedTreeData] = useState<Tree | null>(null);
  const selectionRef = useRef<Selection>(null);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const loadTrees = useCallback(() => {
    setPinsVersion((v) => v + 1);
    setListRefresh((k) => k + 1);
    // Refresh the open tree too (e.g. after watering it)
    const sel = selectionRef.current;
    if (sel?.kind === 'tree') fetchTreeById(sel.id).then(setSelectedTreeData, () => {});
  }, []);

  // Pins for what's on screen, or for the distance filter around you. Waits until the map has stopped
  // moving for a moment, and drops an answer that a newer request has replaced.
  const youKey = you ? `${you.lat.toFixed(4)},${you.lng.toFixed(4)}` : '';
  useEffect(() => {
    if (!mapView) return;
    const radius = distance === 'ALL' ? null : Number(distance);
    const statusParam = status === 'THIRSTY' ? 'thirsty' : status === 'HEALTHY' ? 'healthy' : 'all';
    const zoom = Math.floor(mapView.zoom);
    const common = { zoom, status: statusParam as 'all' | 'thirsty' | 'healthy', mine: status === 'MINE', v: pinsVersion };
    // Rounded to about 10 m, so GPS jitter doesn't refetch
    const params = radius && you ? { ...common, lat: Number(you.lat.toFixed(4)), lng: Number(you.lng.toFixed(4)), radius } : { ...common, bbox: snapToTiles(mapView) };
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      fetchTreePins(params, controller.signal).then(
        (res) => {
          setPins(res);
        },
        () => {
          // Keep the pins already on screen
        }
      );
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
    // `you` is represented by youKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapView, status, distance, youKey, pinsVersion, userId]);

  // Your own counts, refreshed with the lists
  useEffect(() => {
    if (!isSignedIn) {
      setMyTreeSummary(null);
      return;
    }
    browseTrees({ page: 1, limit: 1, mine: true }).then((res) => setMyTreeSummary(res.summary ?? null), () => {});
  }, [isSignedIn, userId, listRefresh]);

  // ---- Drives (reloaded whenever we come back to the map, e.g. after an admin schedules one) ----
  const loadDrives = useCallback(() => {
    // For the map pins and the drawer's count; failures just leave the last list in place
    fetchGlobalDrives().then(
      (res) => setDrives(res.success && Array.isArray(res.data) ? res.data : []),
      () => {}
    );
  }, []);
  // Reload when the role changes too: signing in as a team member or admin reveals more drives
  useEffect(() => {
    if (screen === 'map') loadDrives();
  }, [screen, loadDrives, role]);

  const mapPins: PinsResult | null = pins;

  const selectedTree =
    selection?.kind === 'tree'
      ? selectedTreeData?.id === selection.id ? selectedTreeData : null
      : null;
  const selectedDrive = selection?.kind === 'drive' ? drives?.find((d) => d.id === selection.id) ?? null : null;
  // Pin upcoming drives (and a past one only while it's selected)
  const drivePins = useMemo(
    () => (drives ?? []).filter((d) => isUpcoming(d) || d.id === selectedDrive?.id),
    [drives, selectedDrive?.id]
  );
  const upcomingDrives = useMemo(() => (drives ? splitDrives(drives).upcoming.length : 0), [drives]);

  // ---- Selection and camera ----
  // A tree we already have in full (from a list, or just planted)
  const selectTree = useCallback((tree: Tree) => {
    setSelectedTreeData(tree);
    setSelection({ kind: 'tree', id: tree.id });
    setSheet('half');
    setFlyTo({ lat: tree.latitude, lng: tree.longitude, timestamp: Date.now() });
  }, []);

  // /map?tree=<id> (a "new tree planted" notification): open that tree on the map
  useEffect(() => {
    const treeId = new URLSearchParams(window.location.search).get('tree');
    if (!treeId || !/^[0-9a-f-]{36}$/i.test(treeId)) return;
    fetchTreeById(treeId).then(selectTree, () => {});
  }, [selectTree]);

  // /map?open=admin&user=<id> or &tab=review (admin notifications): which part of Admin to open first.
  // Used once, so opening Admin again later starts as usual.
  const [adminStart, setAdminStart] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return { userId: q.get('user') ?? undefined, tab: q.get('tab') === 'review' ? ('review' as const) : undefined };
  });

  // A pin tapped on the map: open it now, and load its full details
  const selectPin = useCallback((pin: TreePin) => {
    setSelection({ kind: 'tree', id: pin.id });
    setSheet('half');
    setFlyTo({ lat: pin.lat, lng: pin.lng, timestamp: Date.now() });
    fetchTreeById(pin.id).then(
      (tree) => {
        if (selectionRef.current?.kind === 'tree' && selectionRef.current.id === tree.id) setSelectedTreeData(tree);
      },
      () => {}
    );
  }, []);

  const showDrive = useCallback((d: Drive) => {
    // Make sure it's in the list even if the drives haven't reloaded yet (e.g. just opened from Admin)
    setDrives((list) => (list?.some((x) => x.id === d.id) ? list : [...(list ?? []), d]));
    setSelection({ kind: 'drive', id: d.id });
    setSheet('half');
    if (d.latitude != null && d.longitude != null) setFlyTo({ lat: d.latitude, lng: d.longitude, zoom: 16, timestamp: Date.now() });
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setSheet('half');
  }, []);

  const onMapClick = useCallback(() => {
    setSheet((s) => (s === 'full' ? 'half' : s));
  }, []);

  // ---- Navigation ----
  const { route, loading: routeLoading } = useWalkingRoute(destination ? you : null, destination?.at ?? null);
  const remaining = destination && you ? getDistanceInMeters(you.lat, you.lng, destination.at.lat, destination.at.lng) : null;

  const startDirections = (name: string, at: LatLng) => {
    if (!you) locate();
    setDestination({ name, at });
    setSheet('half');
  };

  // From a drive's page: show the drive on the map and start the walk there
  const directionsToDrive = (d: Drive) => {
    showDrive(d);
    if (d.latitude != null && d.longitude != null) startDirections(d.title, { lat: d.latitude, lng: d.longitude });
  };

  // ---- Planting ----
  // Planting needs an account. Signed out, the sign-in pop-up opens (it has a sign-up link too), and
  // once they are signed in they land on the plant screen. Only if that happens soon after asking, so
  // signing in later for another reason doesn't jump into planting.
  const plantAfterSignIn = useRef<number | null>(null);
  const startPlanting = () => {
    if (!isSignedIn) {
      plantAfterSignIn.current = Date.now();
      openSignIn({});
      return;
    }
    open('plant');
  };
  useEffect(() => {
    if (!isSignedIn || plantAfterSignIn.current === null) return;
    const askedAt = plantAfterSignIn.current;
    plantAfterSignIn.current = null;
    if (Date.now() - askedAt < 10 * 60 * 1000) startPlanting();
    // Only when sign-in changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const showBanner = (text: string) => {
    setBanner(text);
    window.setTimeout(() => setBanner((b) => (b === text ? null : b)), 6000);
  };

  // ---- What the sheet shows ----
  const liveRoom = walkLive?.room ?? (selectedTree ? `plant_${selectedTree.id}` : selectedDrive ? `drive_${selectedDrive.id}` : null);
  const navigating = Boolean(destination);

  let sheetLabel = 'Trees near you';
  let sheetHeader: React.ReactNode = null;
  let sheetBody: React.ReactNode;
  // What the sheet shows when swiped down on a phone: a compact bar for each situation
  let sheetPeek: React.ReactNode = null;
  const openSheet = () => setSheet('half');

  if (destination) {
    sheetLabel = 'Directions';
    const left = remaining ?? route?.meters ?? null;
    sheetPeek = (
      <NavigationPeek
        summary={left !== null ? `${formatMinutes(Math.max(1, Math.round(left / 80)))} · ${formatDistance(left)}` : `Walking to ${destination.name}`}
        onOpen={openSheet}
        onEnd={() => setDestination(null)}
      />
    );
    sheetBody = (
      <NavigationPanel
        name={destination.name}
        destination={destination.at}
        route={route}
        loading={routeLoading}
        remaining={remaining}
        onEnd={() => setDestination(null)}
      />
    );
  } else if (selectedTree) {
    sheetLabel = 'Tree details';
    sheetPeek = (
      <ItemPeek
        image={selectedTree.photoUrl}
        title={selectedTree.name}
        subtitle={`${selectedTree.species.split(' (')[0]} · ${STATUS_LABEL[treeStatus(selectedTree)]}`}
        onOpen={openSheet}
        onClose={clearSelection}
        closeLabel="Close tree details"
      />
    );
    sheetBody = (
      <TreeDetails
        role={role}
        tree={selectedTree}
        you={you}
        onClose={clearSelection}
        onDirections={() => startDirections(selectedTree.name, { lat: selectedTree.latitude, lng: selectedTree.longitude })}
        onWalkLive={() => setWalkLive({ room: `plant_${selectedTree.id}`, name: selectedTree.name })}
        onEdit={() => {
          setEditing(selectedTree);
          open('edit');
        }}
        onChanged={loadTrees}
        onDeleted={() => {
          clearSelection();
          loadTrees();
          showBanner('Tree removed from the map.');
        }}
      />
    );
  } else if (selectedDrive) {
    const d = selectedDrive;
    sheetLabel = d.type === 'CLEANUP' ? 'Clean-up drive' : 'Plantation drive';
    sheetPeek = (
      <ItemPeek
        icon={<Calendar aria-hidden="true" />}
        title={d.title}
        subtitle={formatDriveDate(d)}
        onOpen={openSheet}
        onClose={clearSelection}
        closeLabel="Close drive details"
      />
    );
    sheetBody = (
      <DriveDetails
        drive={d}
        you={you}
        onClose={clearSelection}
        onDirections={() => d.latitude != null && d.longitude != null && startDirections(d.title, { lat: d.latitude, lng: d.longitude })}
        onWalkLive={() => setWalkLive({ room: `drive_${d.id}`, name: d.title })}
        showVisibility={seesTeamDrives}
      />
    );
  } else {
    sheetPeek = (
      <SearchPeek
        count={listTotal}
        onOpen={() => {
          setSheet('full');
          // Focus the real search box once it's on screen
          window.requestAnimationFrame(() => document.getElementById('tree-search')?.focus());
        }}
      />
    );
    sheetHeader = (
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl">{you ? 'Trees near you' : 'Trees on the map'}</h2>
        {listTotal !== null && <span className="text-muted-foreground tabular-nums">{listTotal}</span>}
      </div>
    );
    sheetBody = (
      <>
        {locError && !you && (
          <Alert tone="info" className="mb-4" action={<Button variant="secondary" onClick={retryLocation}>Try again</Button>}>
            {locError}
          </Alert>
        )}
        <NearbyPanel
          status={status}
          refreshKey={listRefresh}
          onTotal={setListTotal}
          you={you}
          query={query}
          onQueryChange={setQuery}
          onSearchFocus={() => setSheet('full')}
          distance={distance}
          onDistanceChange={setDistance}
          onSelectTree={(t) => {
            setQuery('');
            selectTree(t);
          }}
          onSelectPlace={(p) => {
            setQuery('');
            setSheet('half');
            setFlyTo({ ...p, zoom: 16, timestamp: Date.now() });
          }}
          onPlant={startPlanting}
        />
      </>
    );
  }

  const statusOptions = [
    { value: 'ALL' as const, label: 'All' },
    { value: 'THIRSTY' as const, label: 'Needs water', icon: <StatusDot status="thirsty" /> },
    { value: 'HEALTHY' as const, label: 'Healthy', icon: <StatusDot status="healthy" /> },
    ...(isSignedIn ? [{ value: 'MINE' as const, label: 'Mine' }] : []),
  ];

  return (
    <>
      <TreeMap
        pins={mapPins}
        selectedTreeId={selection?.kind === 'tree' ? selection.id : null}
        selectedPin={selectedTree ? pinFromTree(selectedTree) : null}
        onSelectTree={selectPin}
        onViewChange={setMapView}
        drives={drivePins}
        selectedDriveId={selectedDrive?.id ?? null}
        onSelectDrive={showDrive}
        userLocation={you}
        userAccuracy={youAccuracy}
        userHeading={youHeading}
        radiusMeters={distance === 'ALL' ? null : Number(distance)}
        route={destination ? route?.line ?? null : null}
        flyTo={flyTo}
        onMapClick={onMapClick}
        liveRoom={liveRoom}
        initialCenter={start ?? INDIA}
        initialZoom={start ? 16 : 5}
        tiles={tiles}
        loadTiles={mapReady}
        located={located}
      />

      {(
        <>
          {navigating && destination ? (
            <NavigationCard name={destination.name} remaining={remaining} locating={!you} />
          ) : (
            // Floating controls: logo, Plant, account; then filters and locate-me
            <div className="top-safe pointer-events-none fixed inset-x-0 z-[1000] px-4 md:left-[27rem]">
              <div className="flex items-center gap-2">
                <div className="pointer-events-auto flex h-12 min-w-0 items-center rounded-full bg-card pr-3.5 pl-1.5 shadow-float md:hidden">
                  <Logo hideNameOnNarrow className="gap-1.5 [&>img]:size-8" />
                </div>
                <div className="flex-1" />
                <Button size="xl" onClick={startPlanting} className="pointer-events-auto h-12 px-4 shadow-float md:h-14 md:px-5">
                  <Plus className="size-5!" aria-hidden="true" />
                  <span className="max-[399px]:hidden">Plant a tree</span>
                  <span className="min-[400px]:hidden">Plant</span>
                </Button>
                <div className="pointer-events-auto">
                  <NotificationBell />
                </div>
                <div className="pointer-events-auto">
                  <ProfileDrawer
                    role={role}
                    treesPlanted={myTreeSummary?.total ?? 0}
                    upcomingDrives={upcomingDrives}
                    onMyTrees={() => open('myTrees')}
                    onDrives={() => open('drives')}
                    onAccount={() => open('account')}
                    onAdmin={() => open('admin')}
                    onHome={() => window.location.assign('/')}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-col items-start gap-3 md:flex-row md:items-start">
                {/* Scrolls sideways only if the chips can't fit (narrow phones, signed in) */}
                <div className="no-scrollbar pointer-events-auto max-w-full overflow-x-auto rounded-full bg-card p-1 shadow-float">
                  <Chips label="Show trees" options={statusOptions} value={status} onChange={setStatus} size="sm" className="gap-1" />
                </div>
                <Button variant="floating" size="icon-lg" onClick={locate} aria-label="Show my location" className="pointer-events-auto size-12 self-end md:ml-auto md:size-14 md:self-start">
                  <LocateFixed className="size-6!" />
                </Button>
              </div>
            </div>
          )}

          {walkLive && (
            <div className={cn('fixed inset-x-4 z-[1050] md:right-4 md:left-auto md:w-96', navigating ? 'top-[calc(max(env(safe-area-inset-top),1rem)+6.5rem)]' : 'top-[calc(max(env(safe-area-inset-top),1rem)+8.5rem)]')}>
              <LiveTracker key={walkLive.room} room={walkLive.room} targetName={walkLive.name} autoStart onStop={() => setWalkLive(null)} />
            </div>
          )}

          {banner && (
            <div role="status" className="top-safe fixed inset-x-4 z-[1250] flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground shadow-sheet animate-rise md:right-auto md:left-[27rem] md:w-96">
              <CheckCircle2 className="size-6 shrink-0" aria-hidden="true" />
              <p className="flex-1 font-medium">{banner}</p>
            </div>
          )}

          <MapSheet
            state={sheet}
            onStateChange={setSheet}
            label={sheetLabel}
            above={tiles?.google ? <GoogleCredit dark={dark} /> : undefined}
            peek={sheetPeek}
            header={
              <>
                <div className="mb-4 hidden md:block">
                  <Logo />
                </div>
                {sheetHeader}
              </>
            }
          >
            {sheetBody}
          </MapSheet>
        </>
      )}

      {screen === 'plant' && isSignedIn && (
        <PlantTreePage
          you={you}
          onClose={back}
          onPlanted={(tree) => {
            back();
            loadTrees();
            // The photo check wasn't sure: an admin looks at it before the tree goes on the map
            if (tree.verificationStatus === 'PENDING') {
              showBanner(`${tree.name} was submitted. An admin will check the photo before it appears on the map.`);
              return;
            }
            setStatus('ALL');
            setDistance('ALL');
            setSelection({ kind: 'tree', id: tree.id });
            setFlyTo({ lat: tree.latitude, lng: tree.longitude, zoom: 17, timestamp: Date.now() });
            showBanner(`${tree.name} is planted. It's on the map for everyone.`);
          }}
        />
      )}

      {screen === 'edit' && editing && (
        <EditTreePage
          tree={editing}
          onClose={back}
          onSaved={(tree) => {
            back();
            loadTrees();
            showBanner(tree.verificationStatus === 'PENDING' ? 'Saved. An admin will check the new photo before this tree shows on the map again.' : 'Changes saved.');
          }}
        />
      )}

      {screen === 'myTrees' && (
        <MyTreesPage
          role={role}
          you={you}
          onClose={back}
          onShowOnMap={(t) => {
            back();
            selectTree(t);
          }}
          onPlant={() => replace('plant')}
          onChanged={loadTrees}
          onEdit={(t) => {
            setEditing(t);
            open('edit');
          }}
          refreshKey={listRefresh}
        />
      )}

      {screen === 'account' && <ProfilePage role={role} phone={phone} onPhoneChanged={setPhone} myTreeSummary={myTreeSummary} onClose={back} onProfileChanged={loadTrees} />}

      {screen === 'drives' && (
        <DrivesPage
          role={role}
          you={you}
          onClose={back}
          onShowOnMap={(d) => {
            back();
            showDrive(d);
          }}
          onDirections={(d) => {
            back();
            directionsToDrive(d);
          }}
        />
      )}

      {screen === 'admin' && isAdminRole(role) && (
        <AdminPage
          role={role}
          you={you}
          initialTab={adminStart.userId ? 'users' : adminStart.tab}
          initialUserId={adminStart.userId}
          onStarted={() => setAdminStart({ userId: undefined, tab: undefined })}
          onClose={back}
          onShowDriveOnMap={(d) => {
            back();
            showDrive(d);
          }}
          onDirectionsToDrive={(d) => {
            back();
            directionsToDrive(d);
          }}
          onShowTreeOnMap={(t) => {
            back();
            selectTree(t);
          }}
        />
      )}
    </>
  );
}
