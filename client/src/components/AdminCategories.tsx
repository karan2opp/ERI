import { useEffect, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { TreeCategory } from '../types';
import { createCategory, deleteCategory, fetchCategories, updateCategory, type Paged } from '../services/api';
import { Button } from './ui/button';
import { Field, Input } from './ui/field';
import { Alert } from './ui/alert';
import { Spinner } from './ui/spinner';
import { Pager } from './ui/pager';
import { ConfirmDialog } from './ui/confirm-dialog';
import { Sapling } from './ui/logo';

const PAGE_SIZE = 10;

const messageOf = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

/**
 * Admin > Categories: the kinds of tree people choose from when planting. Add, rename and delete them;
 * the list pages 10 at a time on the server, with search.
 */
export const AdminCategories: React.FC = () => {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paged<TreeCategory> | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const [editing, setEditing] = useState<TreeCategory | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TreeCategory | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => setPage(1), [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCategories({ page, limit: PAGE_SIZE, search }).then(
      (res) => {
        if (cancelled) return;
        // The last category on a page was just deleted: step back to the page before
        if (res.data.length === 0 && page > 1) setPage(page - 1);
        setResult(res);
        setFailed(false);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [page, search, version]);

  const add = async () => {
    if (name.trim().length < 2) return;
    setAdding(true);
    setNotice(null);
    try {
      const created = await createCategory({ name: name.trim(), description: description.trim() || undefined });
      setNotice({ tone: 'success', text: `"${created.name}" added. People can choose it when planting.` });
      setName('');
      setDescription('');
      setQuery('');
      setSearch('');
      setPage(1);
      setVersion((v) => v + 1);
    } catch (err) {
      setNotice({ tone: 'error', text: messageOf(err, "Couldn't add that category. Try again.") });
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (c: TreeCategory) => {
    setEditing(c);
    setEditName(c.name);
    setEditDescription(c.description ?? '');
    setNotice(null);
  };

  const save = async () => {
    if (!editing || editName.trim().length < 2) return;
    setSaving(true);
    setNotice(null);
    try {
      await updateCategory(editing.id, { name: editName.trim(), description: editDescription.trim() });
      setEditing(null);
      setVersion((v) => v + 1);
      setNotice({ tone: 'success', text: 'Saved. Trees in this category show the new name.' });
    } catch (err) {
      setNotice({ tone: 'error', text: messageOf(err, "Couldn't save that. Try again.") });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      await deleteCategory(deleting.id);
      setNotice({ tone: 'success', text: `"${deleting.name}" deleted.` });
      setDeleting(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setNotice({ tone: 'error', text: messageOf(err, "Couldn't delete that. Try again.") });
      setDeleting(null);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl bg-muted p-4" aria-labelledby="add-category">
        <h2 id="add-category" className="text-lg">Add a category</h2>
        <Field label="Name" htmlFor="category-name" description="What people will see in the list, for example Neem (Azadirachta indica).">
          <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="e.g. Teak (Tectona grandis)" />
        </Field>
        <Field label="Short note (optional)" htmlFor="category-description">
          <Input id="category-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </Field>
        <Button size="lg" onClick={add} disabled={name.trim().length < 2 || adding}>
          {adding ? <Spinner className="size-4" /> : <Plus aria-hidden="true" />} Add category
        </Button>
      </section>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories"
          aria-label="Search categories"
          className="h-12 w-full rounded-full bg-input pr-4 pl-12 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {failed ? (
        <Alert tone="error">Couldn't load the categories. Check your connection and try again.</Alert>
      ) : !result ? (
        <Spinner label="Loading categories" />
      ) : result.total === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Sapling className="h-24" />
          <p className="text-muted-foreground">{search ? `No category matches "${search}".` : 'No categories yet. Add the first one above.'}</p>
        </div>
      ) : (
        <>
          <ul className={`flex flex-col divide-y divide-border transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {result.data.map((c) => (
              <li key={c.id} className="py-3">
                {editing?.id === c.id ? (
                  <div className="flex flex-col gap-3">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={100} aria-label="Category name" />
                    <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} maxLength={500} placeholder="Short note (optional)" aria-label="Short note" />
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={save} disabled={editName.trim().length < 2 || saving}>
                        {saving && <Spinner className="size-4" />} Save
                      </Button>
                      <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {c.treeCount ?? 0} {(c.treeCount ?? 0) === 1 ? 'tree' : 'trees'}
                        {c.description ? ` · ${c.description}` : ''}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(c)} aria-label={`Edit ${c.name}`}>
                      <Pencil className="size-5!" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}>
                      <Trash2 className="size-5! text-destructive" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Pager page={result.page} totalPages={result.totalPages} onPage={setPage} alwaysShow total={result.total} pageSize={PAGE_SIZE} noun={result.total === 1 ? 'category' : 'categories'} />
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? 'this category'}?`}
        description={
          deleting && (deleting.treeCount ?? 0) > 0
            ? `${deleting.treeCount} ${deleting.treeCount === 1 ? 'tree is' : 'trees are'} in it. They stay on the map with this name, but are no longer listed under a category.`
            : 'No trees are in it. It disappears from the list people choose from.'
        }
        confirmLabel="Delete category"
        busy={removing}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
};
