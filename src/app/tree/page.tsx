"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth, NotConfigured, SignInCard, TopBar } from "@/components/AuthProvider";
import { TreeCanvas } from "@/components/TreeCanvas";
import { DataPanel, FamiliesPanel, HistoryPanel, PersonDetails, PersonEditor, SettingsPanel, SharePanel, type Ctx, type Draft } from "@/components/Panels";
import { firebaseConfigured } from "@/lib/firebase";
import { applyChanges, privacyMigrationChanges, renameTree, subscribeTree } from "@/lib/data";
import { spouseOf } from "@/lib/family";
import type { Families, HistoryEntry, Member, People, Tree } from "@/lib/types";

type Mode = { kind: "view" } | { kind: "edit"; id: string | null; draft?: Draft } | { kind: "families" } | { kind: "history" } | { kind: "share" } | { kind: "data" } | { kind: "settings" };

function TreeApp() {
  const treeId = useSearchParams().get("id") || "";
  const { user, loading } = useAuth();
  const [tree, setTree] = useState<Tree | null | undefined>(undefined);
  const [people, setPeople] = useState<People>({});
  const [families, setFamilies] = useState<Families>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [status, setStatus] = useState("");
  const [denied, setDenied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [raw, setRaw] = useState<People>({});
  const migrated = useRef(false);

  useEffect(() => {
    if (!user || !treeId) return;
    return subscribeTree(treeId, {
      tree: setTree, people: (merged, r) => { setPeople(merged); setRaw(r); }, families: setFamilies, history: setHistory, members: setMembers,
      error: (e: any) => { if (e?.code === "permission-denied") setDenied(true); else setStatus("Live updates stopped. Reload the page."); },
    });
  }, [user, treeId]);

  // One-time protection for private people saved before names were stored separately.
  useEffect(() => {
    if (!user || !tree || migrated.current) return;
    const myRole = members.find((m) => m.uid === user.uid)?.role;
    if (myRole !== "owner" && myRole !== "editor") return;
    const changes = privacyMigrationChanges(raw);
    if (!changes.length) return;
    migrated.current = true;
    applyChanges(tree.id, user, changes)
      .then(() => setStatus(`Protected ${changes.length} private name${changes.length === 1 ? "" : "s"} so viewers can't see them.`))
      .catch(() => { /* rules not updated yet: try again next time the tree opens */ });
  }, [user, tree, members, raw]);

  if (!firebaseConfigured) return <NotConfigured />;
  if (!treeId) return <div className="card"><h2>No tree selected</h2><p className="muted"><a href="/">Go to your trees</a></p></div>;
  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <SignInCard message="Sign in to open this family tree." />;
  if (denied) return <div className="card"><h2>You don&apos;t have access to this tree</h2><p className="muted">Ask the tree&apos;s owner for an invite link.</p></div>;
  if (tree === undefined) return <p className="muted">Loading the tree…</p>;
  if (tree === null) return <div className="card"><h2>This tree doesn&apos;t exist</h2><p className="muted"><a href="/">Go to your trees</a></p></div>;

  const me = members.find((m) => m.uid === user.uid);
  const role = me?.role ?? "viewer";
  const canEdit = role === "owner" || role === "editor";
  const ctx: Ctx = { tree, people, families, user, role, canEdit, select: (id) => { setSel(id); setMode({ kind: "view" }); }, say: setStatus };
  const empty = Object.keys(people).length === 0;
  // On phones the panel is a bottom sheet; it opens only when there's something to show.
  const sheetOpen = mode.kind !== "view" || (!!sel && !!people[sel]);
  const closePanel = () => { setMode({ kind: "view" }); setSel(null); };

  const addRelative = (kind: "child" | "spouse" | "parent") => {
    const p = sel ? people[sel] : null;
    if (!p) return;
    const sp = spouseOf(p, people);
    if (kind === "child") {
      const father = p.sex === "F" ? sp : p;
      setMode({ kind: "edit", id: null, draft: { person: { fatherId: father?.id ?? "", motherId: p.sex === "F" ? p.id : sp?.id ?? "", family: father?.family ?? "" } } });
    }
    if (kind === "spouse") setMode({ kind: "edit", id: null, draft: { person: { spouseId: p.id, sex: p.sex === "M" ? "F" : p.sex === "F" ? "M" : "" } } });
    if (kind === "parent") setMode({ kind: "edit", id: null, draft: { person: {}, parentOf: p.id } });
  };

  const panel = () => {
    switch (mode.kind) {
      case "edit": return <PersonEditor key={mode.id ?? "new" + JSON.stringify(mode.draft ?? {})} ctx={ctx} id={mode.id} draft={mode.draft} onDone={(id) => { if (id) setSel(id); setMode({ kind: "view" }); }} />;
      case "families": return <FamiliesPanel ctx={ctx} onClose={() => setMode({ kind: "view" })} />;
      case "history": return <HistoryPanel ctx={ctx} history={history} onClose={() => setMode({ kind: "view" })} />;
      case "share": return <SharePanel ctx={ctx} members={members} onClose={() => setMode({ kind: "view" })} />;
      case "data": return <DataPanel ctx={ctx} onClose={() => setMode({ kind: "view" })} />;
      case "settings": return <SettingsPanel ctx={ctx} members={members} onClose={() => setMode({ kind: "view" })} />;
      default:
        if (sel && people[sel]) return <PersonDetails ctx={ctx} id={sel} onEdit={() => setMode({ kind: "edit", id: sel })} onAdd={addRelative} />;
        return (
          <>
            <h2>Pick someone</h2>
            <p className="muted">Tap a person in the tree to see their gothram, parents, spouse and children.</p>
            {!canEdit && <p className="notice">You can view this tree. Ask the owner for editor access to make changes.</p>}
          </>
        );
    }
  };

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Family tree</p>
          {renaming ? (
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) renameTree(tree.id, newName.trim()).then(() => setRenaming(false)).catch(() => setStatus("Couldn't rename the tree.")); }}>
              <input id="tree-name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} autoFocus style={{ width: "auto" }} />
              <button className="primary" type="submit">Save</button><button type="button" onClick={() => setRenaming(false)}>Cancel</button>
            </form>
          ) : (
            <div className="row"><h1>{tree.name}</h1>{role === "owner" && <button type="button" className="link" onClick={() => { setNewName(tree.name); setRenaming(true); }}>Rename</button>}</div>
          )}
        </div>
        <div className="actions">
          {canEdit && <button className="primary" type="button" onClick={() => setMode({ kind: "edit", id: null })}>Add person</button>}
          <button type="button" onClick={() => setMode({ kind: "families" })}>Families &amp; gothrams</button>
          <button type="button" onClick={() => setMode({ kind: "share" })}>Share</button>
          <button type="button" onClick={() => setMode({ kind: "history" })}>Edit history</button>
          <button type="button" onClick={() => setMode({ kind: "data" })}>Import / export</button>
          {role === "owner" && <button type="button" onClick={() => setMode({ kind: "settings" })}>Settings</button>}
        </div>
      </header>
      <div className="legend">
        <span><i className="sw" style={{ background: "var(--m-soft)", borderColor: "var(--m)" }} />Men</span>
        <span><i className="sw" style={{ background: "var(--f-soft)", borderColor: "var(--f)" }} />Women</span>
        <span><i className="sw" style={{ background: "var(--u-soft)", borderColor: "var(--u)" }} />Not set</span>
        <span><i className="sw" style={{ background: "var(--brass)", borderColor: "var(--brass)", borderRadius: "50%" }} />Marriage</span>
        <span><em className="goth">Brass italic</em>&nbsp;= gothram (married women show their husband&apos;s)</span>
      </div>
      <div className="main">
        {empty ? (
          <div className="canvas-wrap"><div className="empty">
            <h2>No one in this tree yet</h2>
            <p className="muted">Add the first person, or import a tree file.</p>
            {canEdit && <div className="row"><button className="primary" type="button" onClick={() => setMode({ kind: "edit", id: null })}>Add the first person</button><button type="button" onClick={() => setMode({ kind: "data" })}>Import a file</button></div>}
          </div></div>
        ) : <TreeCanvas people={people} families={families} canEdit={canEdit} selected={sel} onSelect={ctx.select} />}
        {sheetOpen && <div className="scrim" onClick={closePanel} aria-hidden="true" />}
        <aside className={`card panel ${sheetOpen ? "open" : "closed"}`} aria-live="polite">
          <button type="button" className="icon sheet-close" aria-label="Close" onClick={closePanel}>✕</button>
          {panel()}
        </aside>
      </div>
      <p className="status">{status}</p>
    </>
  );
}

export default function TreePage() {
  return (
    <>
      <TopBar />
      <main className="wrap">
      <Suspense fallback={<p className="muted">Loading…</p>}><TreeApp /></Suspense>
    </main>
    </>
  );
}
