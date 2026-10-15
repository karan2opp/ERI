import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { CameraCapture } from './CameraCapture';

/**
 * Photo of the tree. It can only be taken live with the camera: tapping opens a camera screen, and
 * the picture it takes appears here with a Retake button. There is no way to pick an existing photo.
 */
export const PhotoField: React.FC<{
  file: File | null;
  onChange: (file: File | null) => void;
  existingUrl?: string;
}> = ({ file, onChange, existingUrl }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = preview ?? existingUrl ?? null;

  return (
    <>
      {shown ? (
        <div className="relative overflow-hidden rounded-2xl bg-muted">
          <img src={shown} alt="Your photo of the tree" className="aspect-[4/3] w-full object-cover" />
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="absolute right-3 bottom-3 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-card px-5 font-medium shadow-float focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Camera className="size-4" aria-hidden="true" /> Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          className="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted text-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
            <Camera className="size-6" aria-hidden="true" />
          </span>
          <span className="text-lg font-medium">Take a photo</span>
          <span className="max-w-60 text-sm text-muted-foreground">Taken live with your camera, so people can spot the tree</span>
        </button>
      )}

      {cameraOpen && (
        <CameraCapture
          onCapture={(photo) => {
            onChange(photo);
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );
};
