import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SwitchCamera, X } from 'lucide-react';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';

// Photos are shrunk to this many pixels on the long side: sharp enough to recognise a tree and
// small enough to upload quickly on mobile data (and well under the server's 10 MB limit)
const MAX_SIDE = 1600;

type Facing = 'environment' | 'user';

/** Why the camera couldn't open, in words people can act on. */
function cameraProblem(err: unknown): { title: string; text: string } {
  const name = (err as { name?: string })?.name;
  if (!window.isSecureContext) {
    return { title: 'The camera needs a secure connection', text: 'Open the app over https (or on localhost) to use the camera.' };
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return { title: 'Camera permission is off', text: 'Allow camera access for this site in your browser settings, then try again.' };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { title: 'No camera found', text: 'Use a phone or a device with a camera to add a photo.' };
  }
  if (name === 'NotReadableError') {
    return { title: 'The camera is busy', text: 'Close other apps that are using the camera, then try again.' };
  }
  return { title: "Couldn't open the camera", text: 'Try again, or reload the page.' };
}

/**
 * A live camera inside the page. The only way to get a photo is to take one right now:
 * there is no gallery or file picker, so photos are always fresh.
 * Resolves through `onCapture` with a JPEG file; `onClose` backs out without a photo.
 */
export const CameraCapture: React.FC<{
  onCapture: (photo: File) => void;
  onClose: () => void;
  hint?: string;
  label?: string;
}> = ({ onCapture, onClose, hint = 'Get the whole tree in the picture', label = 'Take a photo' }) => {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>('environment');
  const [ready, setReady] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);
  const [problem, setProblem] = useState<{ title: string; text: string } | null>(null);
  const [taking, setTaking] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      setProblem(null);
      stop();
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no camera api'), { name: 'NotFoundError' });
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play().catch(() => undefined);
        }
        const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        if (!cancelled) {
          setCanSwitch(cameras.length > 1);
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) setProblem(cameraProblem(err));
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, attempt, stop]);

  // Close with the Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const takePhoto = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setTaking(true);
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        setTaking(false);
        if (!blob) {
          setProblem({ title: "Couldn't take the photo", text: 'Try again.' });
          return;
        }
        stop();
        onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
      },
      'image/jpeg',
      0.85
    );
  };

  // Rendered into <body> so it covers everything, whichever page opened it
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[3500] flex flex-col bg-black text-white">
      <div className="relative flex-1 overflow-hidden">
        {/* muted + playsInline: needed for iPhones to show the live preview inside the page */}
        <video ref={video} muted playsInline autoPlay className="absolute inset-0 size-full object-cover" />

        {!ready && !problem && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="flex items-center gap-3 rounded-full bg-black/60 px-5 py-3">
              <Spinner /> Opening camera…
            </span>
          </div>
        )}

        {problem && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div role="alert" className="flex max-w-sm flex-col gap-3 rounded-3xl bg-card p-6 text-foreground shadow-sheet">
              <h2 className="text-xl">{problem.title}</h2>
              <p className="text-muted-foreground">{problem.text}</p>
              <div className="mt-2 flex gap-2">
                <Button size="lg" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
                <Button size="lg" variant="secondary" onClick={onClose}>Close</Button>
              </div>
            </div>
          </div>
        )}

        <div className="pt-safe absolute inset-x-0 top-0 flex justify-between px-4">
          <Button size="icon-lg" variant="secondary" aria-label="Close camera" onClick={onClose}>
            <X className="size-6!" />
          </Button>
          {canSwitch && ready && (
            <Button size="icon-lg" variant="secondary" aria-label="Switch camera" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}>
              <SwitchCamera className="size-6!" />
            </Button>
          )}
        </div>

        {ready && <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white/90 drop-shadow">{hint}</p>}
      </div>

      <div className="pb-safe flex items-center justify-center bg-black pt-6">
        <button
          type="button"
          onClick={takePhoto}
          disabled={!ready || taking}
          aria-label="Take photo"
          className="grid size-18 cursor-pointer place-items-center rounded-full border-4 border-white outline-none focus-visible:ring-4 focus-visible:ring-white/60 disabled:opacity-40"
        >
          <span className="size-14 rounded-full bg-white transition-transform active:scale-90" />
        </button>
      </div>
    </div>,
    document.body
  );
};
