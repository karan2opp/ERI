import { useState } from 'react';
import type { Tree, TreeCategory } from '../types';
import { updateTree } from '../services/api';
import { discardPhoto, uploadPhotos, type UploadedPhoto } from '../lib/uploadPhoto';
import { Page } from '../components/ui/top-bar';
import { Button } from '../components/ui/button';
import { Field, Input, Textarea } from '../components/ui/field';
import { CategorySelect } from '../components/CategorySelect';
import { Alert } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { PhotoField } from '../components/PhotoField';
import { PlantedAtField, fromLocalParts, toLocalParts } from '../components/PlantedAtField';
import { Chips } from '../components/ui/chips';
import { CareScheduleFields, parseDays, scheduleValid } from '../components/CareScheduleFields';

/** `isAdmin`: admins can also say whether this is a new or an old tree (it decides whether it adds to the planted count). */
export const EditTreePage: React.FC<{ tree: Tree; isAdmin: boolean; onClose: () => void; onSaved: (tree: Tree) => void }> = ({ tree, isAdmin, onClose, onSaved }) => {
  const [isOld, setIsOld] = useState(Boolean(tree.isOld));
  const [photo, setPhoto] = useState<File | null>(null);
  const [name, setName] = useState(tree.name);
  // Starts on the tree's current category (trees from before categories existed start empty and keep their kind until one is chosen)
  const [category, setCategory] = useState<TreeCategory | null>(tree.categoryId ? { id: tree.categoryId, name: tree.species } : null);
  const [address, setAddress] = useState(tree.address || '');
  const [description, setDescription] = useState(tree.description || '');
  const [health, setHealth] = useState(tree.healthScore);
  const [plantedDate, setPlantedDate] = useState(() => toLocalParts(new Date(tree.plantedAt)).date);
  const [plantedTime, setPlantedTime] = useState(() => toLocalParts(new Date(tree.plantedAt)).time);
  const plantedAt = fromLocalParts(plantedDate, plantedTime);
  const [schedule, setSchedule] = useState({
    water: String(tree.waterEveryDays),
    fertilize: String(tree.fertilizeEveryDays),
    weed: String(tree.weedEveryDays),
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocker = !name.trim()
    ? 'Give it a name to save'
    : !plantedAt
        ? 'Choose when it was planted'
        : plantedAt.getTime() > Date.now() + 5 * 60 * 1000
          ? "Planting time can't be in the future"
          : !scheduleValid(schedule)
            ? 'Care intervals must be 1 to 365 days'
            : null;

  const submit = async () => {
    if (blocker) return;
    setBusy(true);
    setError(null);
    // A new photo goes straight to Cloudinary first (never through our server); the server then checks it there
    let uploaded: UploadedPhoto | undefined;
    try {
      if (photo) {
        setUploading(true);
        [uploaded] = await uploadPhotos('TREE', [photo]);
        setUploading(false);
      }
      onSaved(
        await updateTree(tree.id, {
          name: name.trim(),
          // Only sent when there's a category, so an old tree without one keeps its kind
          categoryId: category?.id,
          address: address.trim(),
          description: description.trim(),
          healthScore: health,
          plantedAt: plantedAt?.toISOString(),
          ...(isAdmin ? { isOld } : {}),
          waterEveryDays: parseDays(schedule.water)!,
          fertilizeEveryDays: parseDays(schedule.fertilize)!,
          weedEveryDays: parseDays(schedule.weed)!,
          photo: uploaded,
        })
      );
    } catch (err) {
      // Not saved, so the new photo isn't needed (the server may already have removed it)
      if (uploaded) void discardPhoto(uploaded.publicId);
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (err instanceof Error ? err.message : undefined);
      setError(message || "Couldn't save your changes. Try again.");
    } finally {
      setUploading(false);
      setBusy(false);
    }
  };

  return (
    <Page
      title="Edit tree"
      onBack={onClose}
      footer={
        <Button size="xl" className="w-full" onClick={submit} disabled={Boolean(blocker) || busy}>
          {busy && <Spinner />}
          {blocker ?? (uploading ? 'Uploading your photo…' : 'Save changes')}
        </Button>
      }
    >
      <Field label="Photo">
        <PhotoField file={photo} onChange={setPhoto} existingUrl={tree.photoUrl} />
      </Field>
      <Field label="Name" htmlFor="edit-name">
        <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} />
      </Field>
      <Field label="Kind of tree" htmlFor="edit-category" description={category ? undefined : `Now: ${tree.species}. Choose a category to change it.`}>
        <CategorySelect id="edit-category" value={category} onChange={setCategory} placeholder={tree.species} />
      </Field>
      <Field label="Address or landmark" htmlFor="edit-address">
        <Input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
      </Field>
      {isAdmin && (
        <Field label="New tree or old tree?" description="An old tree was planted before this map existed and is already part of the planted total, so it doesn't add to the count. Changing this changes the number on the home page.">
          <Chips
            label="New tree or old tree"
            options={[
              { value: 'NEW', label: 'New tree' },
              { value: 'OLD', label: 'Old tree' },
            ]}
            value={isOld ? 'OLD' : 'NEW'}
            onChange={(v) => setIsOld(v === 'OLD')}
          />
        </Field>
      )}
      <PlantedAtField date={plantedDate} time={plantedTime} onDate={setPlantedDate} onTime={setPlantedTime} />
      <CareScheduleFields value={schedule} onChange={setSchedule} />
      <Field label={`Health: ${health}%`} htmlFor="edit-health" description="How the tree looks today: leaves, bark, new growth.">
        <input
          id="edit-health"
          type="range"
          min={0}
          max={100}
          step={5}
          value={health}
          onChange={(e) => setHealth(Number(e.target.value))}
          className="h-12 w-full cursor-pointer accent-[var(--leaf)]"
        />
      </Field>
      <Field label="About it" htmlFor="edit-about">
        <Textarea id="edit-about" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
    </Page>
  );
};
