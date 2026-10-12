"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NOTE_STATUS, NOTE_TAGS, type ManifestDoc, type Note } from "@/lib/types";
import { Chip, FileIconColored, Icon, IconButton, api } from "../ui";
import { isOwnClip, logEvent, rememberCopy } from "./lockdown";

/** Team notes with optimistic edits and debounced autosave. */
export function useNotes(enabled: boolean) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Record<string, string>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!enabled) return;
    api<{ notes: Note[]; folders: Record<string, string> }>("/api/team/notes")
      .then((d) => {
        setNotes(d.notes);
        setFolders(d.folders);
      })
      .catch(() => {});
  }, [enabled]);

  const create = useCallback(async (doc_id: string, page_no: number, x: number | null, y: number | null, text = "") => {
    const { note } = await api<{ note: Note }>("/api/team/notes", { method: "POST", json: { doc_id, page_no, x, y, text } });
    setNotes((n) => [...n, note]);
    return note;
  }, []);

  const update = useCallback((id: string, patch: Partial<Note>) => {
    setNotes((n) => n.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.set(
      id,
      setTimeout(() => {
        api("/api/team/notes", { method: "PATCH", json: { id, ...patch } }).catch(() => {});
      }, "text" in patch ? 500 : 0),
    );
  }, []);

  const remove = useCallback(async (id: string) => {
    setNotes((n) => n.filter((x) => x.id !== id));
    await api(`/api/team/notes?id=${id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  return { notes, folders, create, update, remove };
}

const TAG_STYLE: Record<string, string> = {
  Error: "bg-[#FCE8E6] text-[#A50E0E]",
  Leakage: "bg-[#FEF7E0] text-[#7A4F01]",
  Misrepresentation: "bg-[#F3E8FD] text-[#681DA8]",
};

export function NoteCard({
  note,
  number,
  selected,
  canEdit,
  onUpdate,
  onRemove,
  onPromote,
  onSelect,
  docLabel,
}: {
  note: Note;
  number?: number;
  selected?: boolean;
  canEdit: boolean;
  onUpdate: (patch: Partial<Note>) => void;
  onRemove: () => void;
  onPromote: () => void;
  onSelect?: () => void;
  docLabel?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <div
      ref={ref}
      onClick={onSelect}
      className={`rounded-xl border bg-white p-3 transition ${selected ? "border-primary shadow-e2" : "border-line hover:shadow-e1"}`}
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-ink2">
        {number !== undefined && (
          <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white ${note.x !== null ? "bg-[#F9AB00]" : "bg-ink2"}`}>
            {number}
          </span>
        )}
        {docLabel}
        <span>Page {note.page_no}</span>
        <span className="ml-auto" />
        {canEdit && <IconButton icon="delete" title="Delete note" className="!h-7 !w-7 [&_.msi]:!text-[18px]" onClick={onRemove} />}
      </div>
      <textarea
        value={note.text}
        disabled={!canEdit}
        rows={Math.min(8, Math.max(2, Math.ceil(note.text.length / 34)))}
        onChange={(e) => onUpdate({ text: e.target.value })}
        onCopy={(e) => rememberCopy(window.getSelection()?.toString() ?? (e.target as HTMLTextAreaElement).value)}
        onCut={(e) => rememberCopy(window.getSelection()?.toString() ?? (e.target as HTMLTextAreaElement).value)}
        onPaste={(e) => {
          if (!isOwnClip(e.clipboardData.getData("text"))) {
            e.preventDefault();
            logEvent("paste_blocked", note.doc_id);
            window.dispatchEvent(new CustomEvent("nexo-toast", { detail: "You can only paste text copied from your own notes." }));
          }
        }}
        onDrop={(e) => e.preventDefault()}
        placeholder="Write your note…"
        className="w-full resize-none rounded-lg bg-tint p-2 text-sm leading-5 text-ink outline-none focus:bg-white focus:ring-2 focus:ring-primary"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {NOTE_TAGS.map((t) => (
          <button
            key={t}
            disabled={!canEdit}
            onClick={() => onUpdate({ tag: note.tag === t ? null : t })}
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${note.tag === t ? TAG_STYLE[t] : "bg-tint text-ink2 hover:bg-hover"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {NOTE_STATUS.map((s) => (
          <button
            key={s}
            disabled={!canEdit}
            onClick={() => onUpdate({ status: note.status === s ? null : s })}
            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
              note.status === s ? (s === "Proven" ? "bg-[#C4EED0] text-[#0D652D]" : "bg-[#FFE7C2] text-[#7A4F01]") : "bg-tint text-ink2 hover:bg-hover"
            }`}
          >
            <Icon name={s === "Proven" ? "verified" : "help"} size={14} />
            {s}
          </button>
        ))}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPromote();
          }}
          className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-primary hover:bg-[#0B57D014]"
          title="Copy this note into the report's findings table"
        >
          <Icon name="playlist_add" size={16} /> Promote
        </button>
      </div>
    </div>
  );
}

export function NotesPanel({
  doc,
  page,
  notes,
  selected,
  canEdit,
  onSelect,
  onUpdate,
  onRemove,
  onPromote,
  onAddUnpinned,
}: {
  doc: ManifestDoc;
  page: number;
  notes: Note[];
  selected: string | null;
  canEdit: boolean;
  onSelect: (n: Note) => void;
  onUpdate: (id: string, patch: Partial<Note>) => void;
  onRemove: (id: string) => void;
  onPromote: (n: Note) => void;
  onAddUnpinned: () => void;
}) {
  const sorted = useMemo(() => [...notes].sort((a, b) => a.page_no - b.page_no || a.created_at.localeCompare(b.created_at)), [notes]);
  const numberOf = new Map(notes.map((n, i) => [n.id, i + 1]));
  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-[#F8FAFD]">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="font-display text-lg text-ink">Notes</div>
        <span className="text-xs text-ink2">{doc.docId}</span>
      </div>
      <div className="scroll-thin flex-1 space-y-3 overflow-auto px-3 pb-4">
        {sorted.length === 0 && (
          <div className="rounded-xl border border-dashed border-outline p-4 text-sm text-ink2">
            Click a point on the page to pin a note there. Notes save automatically and only your team can see them.
          </div>
        )}
        {sorted.map((n) => (
          <NoteCard
            key={n.id}
            note={n}
            number={numberOf.get(n.id)}
            selected={selected === n.id}
            canEdit={canEdit}
            onSelect={() => onSelect(n)}
            onUpdate={(p) => onUpdate(n.id, p)}
            onRemove={() => onRemove(n.id)}
            onPromote={() => onPromote(n)}
          />
        ))}
      </div>
      {canEdit && (
        <div className="border-t border-line p-3">
          <button onClick={onAddUnpinned} className="flex w-full items-center justify-center gap-2 rounded-full border border-outline py-2 text-sm font-medium text-primary hover:bg-[#0B57D00F]">
            <Icon name="add_comment" size={18} /> Add note for page {page}
          </button>
        </div>
      )}
    </aside>
  );
}

export function AllNotes({
  notes,
  folders,
  docs,
  canEdit,
  onOpen,
  onUpdate,
  onRemove,
  onPromote,
}: {
  notes: Note[];
  folders: Record<string, string>;
  docs: Map<string, ManifestDoc>;
  canEdit: boolean;
  onOpen: (n: Note) => void;
  onUpdate: (id: string, patch: Partial<Note>) => void;
  onRemove: (id: string) => void;
  onPromote: (n: Note) => void;
}) {
  const [folder, setFolder] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const folderList = Array.from(new Set(notes.map((n) => folders[n.doc_id] ?? "Inbox"))).sort();
  const shown = notes
    .filter((n) => (!folder || (folders[n.doc_id] ?? "Inbox") === folder) && (!tag || n.tag === tag))
    .sort((a, b) => a.doc_id.localeCompare(b.doc_id) || a.page_no - b.page_no);

  return (
    <div className="flex h-full flex-col">
      <div className="px-7 pb-2 pt-4 font-display text-[22px] text-ink">All notes</div>
      <div className="flex flex-wrap gap-2 px-7 pb-3">
        {folderList.map((f) => (
          <Chip key={f} active={folder === f} onClick={() => setFolder(folder === f ? null : f)} icon="folder">
            {f}
          </Chip>
        ))}
        <span className="mx-1 w-px bg-line" />
        {NOTE_TAGS.map((t) => (
          <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)} icon="label">
            {t}
          </Chip>
        ))}
      </div>
      <div className="scroll-thin flex-1 overflow-auto px-7 pb-8">
        {shown.length === 0 ? (
          <div className="py-20 text-center text-ink2">
            <Icon name="sticky_note_2" size={56} className="text-outline" />
            <p className="mt-3">No notes yet. Open a file and click on a page to pin one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {shown.map((n) => {
              const d = docs.get(n.doc_id);
              return (
                <NoteCard
                  key={n.id}
                  note={n}
                  canEdit={canEdit}
                  onUpdate={(p) => onUpdate(n.id, p)}
                  onRemove={() => onRemove(n.id)}
                  onPromote={() => onPromote(n)}
                  docLabel={
                    <button onClick={() => onOpen(n)} className="flex items-center gap-1 rounded-md bg-tint px-1.5 py-0.5 font-mono text-[11px] text-primary hover:underline" title={d?.title}>
                      {d && <FileIconColored kind={d.kind} size={14} />}
                      {n.doc_id}
                    </button>
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
