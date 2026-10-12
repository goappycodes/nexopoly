"use client";

import { useMemo, useState } from "react";
import type { DocKind, ManifestDoc } from "@/lib/types";
import { Chip, FileIconColored, Icon, IconButton, KIND_ICON } from "../ui";
import type { InboxDoc } from "./types";

const fmtDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};

export function Drive({
  files,
  inbox,
  folder,
  search,
  access,
  notesByDoc,
  onOpenFolder,
  onOpenDoc,
}: {
  files: ManifestDoc[];
  inbox: InboxDoc[];
  folder: string | null;
  search: string;
  access: "readme" | "all" | "locked";
  notesByDoc: Map<string, number>;
  onOpenFolder: (f: string | null) => void;
  onOpenDoc: (d: ManifestDoc) => void;
}) {
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [kind, setKind] = useState<DocKind | null>(null);
  const folders = useMemo(() => Array.from(new Set(files.map((f) => f.folder))).sort(), [files]);
  const isInbox = folder === "Inbox";

  const shown = useMemo(() => {
    let list: ManifestDoc[] = isInbox ? inbox : files;
    const q = search.trim().toLowerCase();
    if (q) list = [...files, ...inbox].filter((f) => f.title.toLowerCase().includes(q) || f.docId.toLowerCase().includes(q));
    else if (!isInbox) list = folder ? files.filter((f) => f.folder === folder) : [];
    if (kind) list = list.filter((f) => f.kind === kind);
    return list;
  }, [files, inbox, folder, search, kind, isInbox]);

  const showFolders = !search.trim() && !folder;
  const title = search.trim() ? `Search results for “${search.trim()}”` : folder ?? "Case files";
  const kinds = Array.from(new Set([...files, ...inbox].map((f) => f.kind)));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-1 font-display text-[22px] text-ink">
          {folder && !search.trim() ? (
            <>
              <button className="rounded-full px-3 py-1 text-ink2 hover:bg-hover" onClick={() => onOpenFolder(null)}>
                Case files
              </button>
              <Icon name="chevron_right" className="text-ink2" />
              <span className="truncate rounded-full px-3 py-1">{title}</span>
            </>
          ) : (
            <span className="truncate px-3 py-1">{title}</span>
          )}
        </div>
        <div className="flex items-center rounded-full border border-outline">
          <button
            onClick={() => setLayout("list")}
            className={`flex h-8 items-center gap-1 rounded-l-full px-3 ${layout === "list" ? "bg-selected" : "hover:bg-hover"}`}
            title="List layout"
          >
            {layout === "list" && <Icon name="check" size={18} />}
            <Icon name="view_list" size={20} />
          </button>
          <button
            onClick={() => setLayout("grid")}
            className={`flex h-8 items-center gap-1 rounded-r-full px-3 ${layout === "grid" ? "bg-selected" : "hover:bg-hover"}`}
            title="Grid layout"
          >
            {layout === "grid" && <Icon name="check" size={18} />}
            <Icon name="grid_view" size={20} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-7 pb-3">
        {kinds.map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(kind === k ? null : k)}>
            {KIND_ICON[k].label}s
          </Chip>
        ))}
      </div>

      {access === "readme" && (
        <div className="mx-7 mb-3 flex items-center gap-3 rounded-xl bg-[#FEF7E0] px-4 py-3 text-sm text-[#5C3B00]">
          <Icon name="lock_clock" />
          Only the Read Me folder is open during the briefing. Every other folder unlocks when the audit starts.
        </div>
      )}

      <div className="scroll-thin flex-1 overflow-auto px-4 pb-6">
        {layout === "list" ? (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="h-12 border-b border-line text-left text-ink2">
                <th className="pl-3 font-medium">Name</th>
                <th className="hidden w-44 font-medium lg:table-cell">Owner</th>
                <th className="hidden w-36 font-medium md:table-cell">Last modified</th>
                <th className="w-24 font-medium">Pages</th>
              </tr>
            </thead>
            <tbody>
              {showFolders &&
                folders.map((f) => (
                  <tr key={f} onClick={() => onOpenFolder(f)} className="ripple h-12 cursor-pointer border-b border-line hover:bg-hover">
                    <td className="pl-3">
                      <div className="flex items-center gap-4">
                        <Icon name="folder" fill className="text-ink2" />
                        <span className="truncate font-medium text-ink">{f}</span>
                      </div>
                    </td>
                    <td className="hidden text-ink2 lg:table-cell">Himalayan Leaf</td>
                    <td className="hidden text-ink2 md:table-cell">—</td>
                    <td className="text-ink2">{files.filter((x) => x.folder === f).length} files</td>
                  </tr>
                ))}
              {showFolders && inbox.length > 0 && (
                <tr onClick={() => onOpenFolder("Inbox")} className="ripple h-12 cursor-pointer border-b border-line hover:bg-hover">
                  <td className="pl-3">
                    <div className="flex items-center gap-4">
                      <Icon name="folder_special" fill className="text-primary" />
                      <span className="font-medium text-ink">Inbox</span>
                    </div>
                  </td>
                  <td className="hidden text-ink2 lg:table-cell">Teesta Ventures</td>
                  <td className="hidden text-ink2 md:table-cell">—</td>
                  <td className="text-ink2">{inbox.length} files</td>
                </tr>
              )}
              {shown.map((d) => {
                const unread = (d as InboxDoc).read === false;
                const n = notesByDoc.get(d.docId) ?? 0;
                return (
                  <tr key={d.docId} onClick={() => onOpenDoc(d)} className="ripple h-12 cursor-pointer border-b border-line hover:bg-hover">
                    <td className="pl-3">
                      <div className="flex min-w-0 items-center gap-4">
                        <FileIconColored kind={d.kind} />
                        <span className={`truncate ${unread ? "font-bold text-ink" : "text-ink"}`}>{d.title}</span>
                        <span className="shrink-0 rounded-md bg-tint px-1.5 py-0.5 font-mono text-[11px] text-ink2">{d.docId}</span>
                        {n > 0 && (
                          <span className="flex shrink-0 items-center gap-0.5 text-xs text-primary" title={`${n} notes`}>
                            <Icon name="sticky_note_2" size={16} />
                            {n}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden truncate text-ink2 lg:table-cell">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E8DEF8] text-[11px] font-medium text-[#4A4458]">{d.owner?.[0] ?? "?"}</span>
                        {d.owner}
                      </span>
                    </td>
                    <td className="hidden text-ink2 md:table-cell">{fmtDate(d.modified)}</td>
                    <td className="text-ink2">{d.pages}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="space-y-6 px-3">
            {showFolders && (
              <div>
                <div className="mb-3 text-sm font-medium text-ink">Folders</div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  {[...folders, ...(inbox.length ? ["Inbox"] : [])].map((f) => (
                    <button key={f} onClick={() => onOpenFolder(f)} className="ripple flex h-12 items-center gap-3 rounded-xl bg-tint px-4 text-left text-sm font-medium text-ink hover:bg-hover">
                      <Icon name={f === "Inbox" ? "folder_special" : "folder"} fill className={f === "Inbox" ? "text-primary" : "text-ink2"} />
                      <span className="truncate">{f}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {shown.length > 0 && (
              <div>
                {showFolders && <div className="mb-3 text-sm font-medium text-ink">Files</div>}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  {shown.map((d) => (
                    <button key={d.docId} onClick={() => onOpenDoc(d)} className="ripple flex flex-col rounded-xl bg-tint p-2 text-left hover:bg-hover">
                      <div className="flex items-center gap-3 px-2 py-2">
                        <FileIconColored kind={d.kind} size={20} />
                        <span className="truncate text-sm font-medium text-ink">{d.title}</span>
                      </div>
                      <div className="flex h-36 items-center justify-center rounded-lg bg-white">
                        <span style={{ color: KIND_ICON[d.kind].color }} className="opacity-80">
                          <Icon name={KIND_ICON[d.kind].icon} fill size={64} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-2 pt-2 text-xs text-ink2">
                        <span className="font-mono">{d.docId}</span>
                        <span>{d.pages} pg</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {!showFolders && shown.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center text-ink2">
            <Icon name={search ? "search_off" : "folder_open"} size={64} className="text-outline" />
            <p className="mt-4 text-base">{search ? "No files match your search" : "This folder is empty"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export { IconButton };
