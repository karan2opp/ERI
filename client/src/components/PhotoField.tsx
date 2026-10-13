import { useEffect, useState } from 'react';
import { Camera, ImageIcon } from 'lucide-react';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Photo of the tree: a big tap target that opens the camera on phones, a preview with
 * Retake once there's a photo, and "Choose from your photos" underneath.
 */
export const PhotoField: React.FC<{
  file: File | null;
  onChange: (file: File | null) => void;
  existingUrl?: string;
}> = ({ file, onChange, existingUrl }) => {
  const [preview, setPreview] = useState<string | null>(null);

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
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.files?.[0] ?? null);

  return (
    <div className="flex flex-col gap-3">
      {shown ? (
        <div className="relative overflow-hidden rounded-2xl bg-muted">
          <img src={shown} alt="Your photo of the tree" className="aspect-[4/3] w-full object-cover" />
          <label className="absolute right-3 bottom-3 inline-flex h-11 cursor-pointer items-center rounded-full bg-card px-5 font-medium shadow-float focus-within:ring-2 focus-within:ring-ring">
            Retake
            <input type="file" accept={ACCEPT} capture="environment" className="sr-only" onChange={pick} />
          </label>
        </div>
      ) : (
        <label className="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted text-center focus-within:ring-2 focus-within:ring-ring">
          <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
            <Camera className="size-6" aria-hidden="true" />
          </span>
          <span className="text-lg font-medium">Take a photo</span>
          <span className="max-w-60 text-sm text-muted-foreground">The whole tree, so people can spot it</span>
          <input type="file" accept={ACCEPT} capture="environment" className="sr-only" onChange={pick} />
        </label>
      )}
      <label className="inline-flex cursor-pointer items-center gap-2 self-start rounded-full px-3 py-2 hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
        <ImageIcon className="size-5" aria-hidden="true" />
        Choose from your photos
        <input type="file" accept={ACCEPT} className="sr-only" onChange={pick} />
      </label>
    </div>
  );
};
