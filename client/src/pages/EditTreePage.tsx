import { useState } from 'react';
import type { Tree } from '../types';
import { updateTree } from '../services/api';
import { Page } from '../components/ui/top-bar';
import { Button } from '../components/ui/button';
import { Field, Input, Textarea } from '../components/ui/field';
import { Alert } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { PhotoField } from '../components/PhotoField';
import { PlantedAtField, fromLocalParts, toLocalParts } from '../components/PlantedAtField';

export const EditTreePage: React.FC<{ tree: Tree; onClose: () => void; onSaved: () => void }> = ({ tree, onClose, onSaved }) => {
  const [photo, setPhoto] = useState<File | null>(null);
  const [name, setName] = useState(tree.name);
  const [species, setSpecies] = useState(tree.species);
  const [address, setAddress] = useState(tree.address || '');
  const [description, setDescription] = useState(tree.description || '');
  const [health, setHealth] = useState(tree.healthScore);
  const [plantedDate, setPlantedDate] = useState(() => toLocalParts(new Date(tree.plantedAt)).date);
  const [plantedTime, setPlantedTime] = useState(() => toLocalParts(new Date(tree.plantedAt)).time);
  const plantedAt = fromLocalParts(plantedDate, plantedTime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocker = !name.trim()
    ? 'Give it a name to save'
    : !species.trim()
      ? 'Say what kind of tree it is'
      : !plantedAt
        ? 'Choose when it was planted'
        : plantedAt.getTime() > Date.now() + 5 * 60 * 1000
          ? "Planting time can't be in the future"
          : null;

  const submit = async () => {
    if (blocker) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('name', name.trim());
      form.append('species', species.trim());
      form.append('address', address.trim());
      form.append('description', description.trim());
      form.append('healthScore', String(health));
      if (plantedAt) form.append('plantedAt', plantedAt.toISOString());
      if (photo) form.append('photo', photo);
      await updateTree(tree.id, form);
      onSaved();
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || "Couldn't save your changes. Try again.");
    } finally {
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
          {blocker ?? 'Save changes'}
        </Button>
      }
    >
      <Field label="Photo">
        <PhotoField file={photo} onChange={setPhoto} existingUrl={tree.photoUrl} />
      </Field>
      <Field label="Name" htmlFor="edit-name">
        <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} />
      </Field>
      <Field label="Kind of tree" htmlFor="edit-species">
        <Input id="edit-species" value={species} onChange={(e) => setSpecies(e.target.value)} maxLength={255} />
      </Field>
      <Field label="Address or landmark" htmlFor="edit-address">
        <Input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
      </Field>
      <PlantedAtField date={plantedDate} time={plantedTime} onDate={setPlantedDate} onTime={setPlantedTime} />
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
