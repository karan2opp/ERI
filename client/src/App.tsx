import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { Calendar, CheckCircle2, LocateFixed, Plus } from 'lucide-react';
import type { Drive, LatLng, Tree } from './types';
import { fetchAllTrees, fetchGlobalDrives, setAuthTokenGetter, syncCurrentUser } from './services/api';
import { reconnectSocket } from './utils/socket';
import { formatDistance, formatMinutes, getDistanceInMeters } from './utils/geo';
import { STATUS_LABEL, treeStatus, isDemoTree } from './lib/trees';
import { sampleTreesAround } from './lib/demo';
import { useWalkingRoute } from './lib/route';
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
import { PickLocation } from './components/map/PickLocation';
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

type StatusFilter = 'ALL' | 'THIRSTY' | 'HEALTHY' | 'MINE';
type Screen = 'map' | 'plant' | 'pick' | 'edit' | 'myTrees' | 'account' | 'admin' | 'drives';
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
  return sharedDriveId ? <SharedDrivePage driveId={sharedDriveId} /> : <MapApp />;
}

/**
 * Full-screen pages sit in browser history, so the phone's back button (or swipe back)
 * closes them instead of leaving the app.
 */
function useScreens() {
  const [screen, setScreen] = useState<Screen>('map');
  useEffect(() => {
    window.history.replaceState({ ptScreen: 'map' }, '');
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
  const { user: clerkUser } = useUser();
  const { screen, open, replace, back } = useScreens();

  const [role, setRole] = useState<'USER' | 'ADMIN'>('USER');
  const [serverTrees, setServerTrees] = useState<Tree[] | null>(null);
  const [you, setYou] = useState<LatLng | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [start] = useState<LatLng | null>(readLastLocation);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);

  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [distance, setDistance] = useState<DistanceFilter>('ALL');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<SheetState>('half');
  const [selection, setSelection] = useState<Selection>(null);
  // Planting drives, shown to everyone (null while loading)
  const [drives, setDrives] = useState<Drive[] | null>(null);
  const [editing, setEditing] = useState<Tree | null>(null);

  const [destination, setDestination] = useState<Destination | null>(null);
  const [walkLive, setWalkLive] = useState<{ room: string; name: string } | null>(null);

  const [plantAt, setPlantAt] = useState<LatLng | null>(null);
  const pickCenter = useRef<LatLng | null>(null);
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
      return;
    }
    let cancelled = false;
    syncCurrentUser()
      .then((u) => !cancelled && setRole(u.role === 'ADMIN' ? 'ADMIN' : 'USER'))
      .catch((err) => console.warn('User sync notice:', err));
    return () => {
      cancelled = true;
    };
    // getToken is stable per session; re-run on sign-in/out and account switches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, userId]);

  // ---- Your location: follow it; the first fix centres the map ----
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError("This browser can't share your location.");
      return;
    }
    let first = true;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setYou(at);
        setLocError(null);
        try {
          localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(at));
        } catch {
          // Storage blocked: we just won't remember it
        }
        if (first) {
          first = false;
          setFlyTo({ ...at, zoom: 16, timestamp: Date.now() });
        }
      },
      () => setLocError('Location is off. Turn it on to see the trees nearest you.'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const locate = useCallback(() => {
    if (you) {
      setFlyTo({ ...you, zoom: 16, timestamp: Date.now() });
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setYou(at);
        setLocError(null);
        setFlyTo({ ...at, zoom: 16, timestamp: Date.now() });
      },
      () => setLocError('Location is off. Turn it on to see the trees nearest you.'),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, [you]);

  // ---- Trees ----
  // The map's pins load every tree; lists page on the server and reload when listRefresh changes
  const [listRefresh, setListRefresh] = useState(0);
  const [listTotal, setListTotal] = useState<number | null>(null);
  const loadTrees = useCallback(() => {
    fetchAllTrees().then(setServerTrees, () => setServerTrees([]));
    setListRefresh((k) => k + 1);
  }, []);
  useEffect(loadTrees, [loadTrees]);

  // ---- Planting drives (reloaded whenever we come back to the map, e.g. after an admin schedules one) ----
  const loadDrives = useCallback(() => {
    // For the map pins and the drawer's count; failures just leave the last list in place
    fetchGlobalDrives().then(
      (res) => setDrives(res.success && Array.isArray(res.data) ? res.data : []),
      () => {}
    );
  }, []);
  useEffect(() => {
    if (screen === 'map') loadDrives();
  }, [screen, loadDrives]);

  // Sample trees only while the map would otherwise be empty
  const sampleCenter = you ?? start;
  const trees = useMemo<Tree[]>(() => {
    if (serverTrees === null) return [];
    if (serverTrees.length > 0) return serverTrees;
    return sampleCenter ? sampleTreesAround(sampleCenter) : [];
    // Place samples once, where you first are
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverTrees, Boolean(sampleCenter)]);

  const filtered = useMemo(() => {
    const radius = distance === 'ALL' ? null : Number(distance);
    return trees.filter((t) => {
      if (status === 'THIRSTY' && treeStatus(t) !== 'thirsty') return false;
      if (status === 'HEALTHY' && treeStatus(t) !== 'healthy') return false;
      if (status === 'MINE' && !(userId && (t.userId === userId || t.owner?.id === userId))) return false;
      if (radius && you && getDistanceInMeters(you.lat, you.lng, t.latitude, t.longitude) > radius) return false;
      return true;
    });
  }, [trees, status, distance, you, userId]);

  const selectedTree = selection?.kind === 'tree' ? trees.find((t) => t.id === selection.id) ?? null : null;
  const selectedDrive = selection?.kind === 'drive' ? drives?.find((d) => d.id === selection.id) ?? null : null;
  // Pin upcoming drives (and a past one only while it's selected)
  const drivePins = useMemo(
    () => (drives ?? []).filter((d) => isUpcoming(d) || d.id === selectedDrive?.id),
    [drives, selectedDrive?.id]
  );
  const upcomingDrives = useMemo(() => (drives ? splitDrives(drives).upcoming.length : 0), [drives]);
  const myTrees = useMemo(() => trees.filter((t) => userId && !isDemoTree(t) && (t.userId === userId || t.owner?.id === userId)), [trees, userId]);

  // ---- Selection and camera ----
  const selectTree = useCallback((tree: Tree) => {
    setSelection({ kind: 'tree', id: tree.id });
    setSheet('half');
    setFlyTo({ lat: tree.latitude, lng: tree.longitude, timestamp: Date.now() });
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

  // ---- Planting ----
  const startPlanting = () => {
    setPlantAt(you);
    open('plant');
  };

  const confirmPick = () => {
    if (pickCenter.current) setPlantAt(pickCenter.current);
    back(); // returns to the plant form
  };

  const showBanner = (text: string) => {
    setBanner(text);
    window.setTimeout(() => setBanner((b) => (b === text ? null : b)), 6000);
  };

  // ---- What the sheet shows ----
  const liveRoom = walkLive?.room ?? (selectedTree && !isDemoTree(selectedTree) ? `plant_${selectedTree.id}` : selectedDrive ? `drive_${selectedDrive.id}` : null);
  const picking = screen === 'pick';
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
    sheetLabel = 'Planting drive';
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
          <Alert tone="info" className="mb-4" action={<Button variant="secondary" onClick={locate}>Try again</Button>}>
            {locError}
          </Alert>
        )}
        <NearbyPanel
          status={status}
          samples={serverTrees !== null && serverTrees.length === 0 ? trees : null}
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
        trees={filtered}
        selectedTreeId={selectedTree?.id ?? null}
        onSelectTree={selectTree}
        drives={drivePins}
        selectedDriveId={selectedDrive?.id ?? null}
        onSelectDrive={showDrive}
        userLocation={you}
        radiusMeters={distance === 'ALL' ? null : Number(distance)}
        route={destination ? route?.line ?? null : null}
        flyTo={flyTo}
        pickMode={picking}
        onCenterChange={(c) => (pickCenter.current = c)}
        onMapClick={onMapClick}
        liveRoom={liveRoom}
        initialCenter={start ?? INDIA}
        initialZoom={start ? 15 : 5}
        tiles={tiles}
      />

      {picking ? (
        <PickLocation onConfirm={confirmPick} onCancel={back} onLocate={locate} />
      ) : (
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
                  <ProfileDrawer
                    isAdmin={role === 'ADMIN'}
                    treesPlanted={myTrees.length}
                    upcomingDrives={upcomingDrives}
                    onMyTrees={() => open('myTrees')}
                    onDrives={() => open('drives')}
                    onAccount={() => open('account')}
                    onAdmin={() => open('admin')}
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

      {(screen === 'plant' || screen === 'pick') && (
        <PlantTreePage
          hidden={picking}
          location={plantAt}
          you={you}
          onChangeLocation={() => {
            if (plantAt) setFlyTo({ ...plantAt, zoom: 18, timestamp: Date.now() });
            open('pick');
          }}
          onClose={back}
          onPlanted={(tree) => {
            back();
            loadTrees();
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
          onSaved={() => {
            back();
            loadTrees();
            showBanner('Changes saved.');
          }}
        />
      )}

      {screen === 'myTrees' && (
        <MyTreesPage
          you={you}
          onClose={back}
          onShowOnMap={(t) => {
            back();
            selectTree(t);
          }}
          onPlant={() => {
            setPlantAt(you);
            replace('plant');
          }}
          onChanged={loadTrees}
        />
      )}

      {screen === 'account' && <ProfilePage role={role} myTrees={myTrees} onClose={back} onProfileChanged={loadTrees} />}

      {screen === 'drives' && (
        <DrivesPage
          you={you}
          onClose={back}
          onShowOnMap={(d) => {
            back();
            showDrive(d);
          }}
        />
      )}

      {screen === 'admin' && (
        <AdminPage
          you={you}
          onClose={back}
          onShowDriveOnMap={(d) => {
            back();
            showDrive(d);
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
