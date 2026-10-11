"use client";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  applyChanges, createInvite, deleteTree, familyDoc, importChanges, listInvites, personDeleteChanges, personSaveChanges,
  removeMember, revokeInvite, setMemberRole, transferOwnership, undoChange, personDoc, type Change,
} from "@/lib/data";
import {
  birthGothramOf, childrenOf, displayName, gothramOf, gothramText, maidenLabel, makeId, spouseOf, validatePerson,
} from "@/lib/family";
import { exportTree, parseTreeFile } from "@/lib/portable";
import { computeGenerations } from "@/lib/layout";
import { INVITE_DAYS, inviteStatus } from "@/lib/privacy";
import type { Families, HistoryEntry, Invite, Member, People, Person, Role, Tree } from "@/lib/types";

export interface Ctx {
  tree: Tree; people: People; families: Families; user: User; role: Role; canEdit: boolean;
  select: (id: string | null) => void; say: (msg: string) => void;
}

const errMsg = (e: any) =>
  e?.code === "permission-denied" ? "You don't have permission to make this change." :
  "Couldn't save. Check your connection and try again.";

/* ---------------- person details ---------------- */

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export function PersonDetails({ ctx, id, onEdit, onAdd }: { ctx: Ctx; id: string; onEdit: () => void; onAdd: (kind: "child" | "spouse" | "parent") => void }) {
  const { people, families, canEdit, select } = ctx;
  const p = people[id];
  if (!p) return <p className="muted">This person was removed.</p>;
  const link = (pid: string | undefined) => {
    const r = pid ? people[pid] : undefined;
    return r ? <button type="button" className="link" onClick={() => select(r.id)}>{displayName(r, canEdit)}</button> : <span className="muted">Not added</span>;
  };
  const kids = childrenOf(id, people);
  const g = gothramOf(p, people, families);
  const bg = birthGothramOf(p, people, families);
  const nee = maidenLabel(p, people, families);
  const hidden = p.private && !canEdit;
  return (
    <>
      <div className="person-head">
        <span className={`avatar ${p.sex || "U"}`} aria-hidden="true">{initials(displayName(p, canEdit))}</span>
        <div><h2>{displayName(p, canEdit)}</h2>{!hidden && nee && <p className="muted">{nee}</p>}</div>
      </div>
      <dl>
        <dt>Generation</dt><dd>Generation {computeGenerations(people)[id]}</dd>
        <dt>Gothram</dt><dd className={g ? "goth" : "muted"}>{gothramText(g)}</dd>
        {bg !== null && <><dt>Birth gothram</dt><dd className={bg ? "goth" : "muted"}>{gothramText(bg)}</dd></>}
        <dt>Birth family</dt><dd>{families[p.family]?.surname ?? <span className="muted">Not set</span>}</dd>
        <dt>Father</dt><dd>{link(p.fatherId)}</dd>
        <dt>Mother</dt><dd>{link(p.motherId)}</dd>
        <dt>Spouse</dt><dd>{link(spouseOf(p, people)?.id)}</dd>
        <dt>Children</dt><dd>{kids.length ? kids.map((k, i) => <span key={k.id}>{i > 0 && ", "}{link(k.id)}</span>) : <span className="muted">None added</span>}</dd>
        {p.private && <><dt>Privacy</dt><dd>Name hidden from viewers</dd></>}
      </dl>
      {canEdit && (
        <div className="row">
          <button className="primary" type="button" onClick={onEdit}>Edit</button>
          <button type="button" onClick={() => onAdd("child")}>Add child</button>
          <button type="button" onClick={() => onAdd("spouse")}>Add spouse</button>
          <button type="button" onClick={() => onAdd("parent")}>Add parent</button>
        </div>
      )}
    </>
  );
}

/* ---------------- person editor ---------------- */

export interface Draft { person: Partial<Person>; parentOf?: string }

export function PersonEditor({ ctx, id, draft, onDone }: { ctx: Ctx; id: string | null; draft?: Draft; onDone: (savedId?: string) => void }) {
  const { people, families, user, tree, say } = ctx;
  const base: Person = id ? people[id] : {
    id: "", name: "", sex: "", family: "", fatherId: "", motherId: "", spouseId: "", private: false, ...(draft?.person ?? {}),
  };
  const [p, setP] = useState<Person>(base);
  const [newFam, setNewFam] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const others = Object.values(people).filter((x) => x.id !== id).sort((a, b) => a.name.localeCompare(b.name));
  const fams = Object.values(families).sort((a, b) => a.surname.localeCompare(b.surname));
  const set = <K extends keyof Person>(k: K, v: Person[K]) => setP((o) => ({ ...o, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Person = { ...p, name: p.name.trim(), id: id ?? makeId(p.name.trim(), people) };
    const extra: Change[] = [];
    if (p.family === "__new") {
      const s = newFam.trim();
      if (!s) { setErrors(["Type the new family's surname."]); return; }
      const fid = makeId(s, families);
      next.family = fid;
      extra.push({ coll: "families", id: fid, before: null, after: { surname: s, gothram: "" }, label: `Added family ${s}` });
    }
    if (!id && draft?.parentOf && people[draft.parentOf]) {
      const c = people[draft.parentOf];
      const key = next.sex === "F" ? "motherId" : "fatherId";
      const updated = { ...c, [key]: next.id };
      const errs = validatePerson(updated, { ...people, [next.id]: next });
      if (errs.length) { setErrors(errs); return; }
      extra.push({ coll: "people", id: c.id, before: personDoc(c), after: personDoc(updated), label: `Linked ${next.name} as parent of ${c.name}` });
    }
    const errs = validatePerson(next, people);
    if (errs.length) { setErrors(errs); return; }
    setBusy(true);
    try {
      await applyChanges(tree.id, user, personSaveChanges(next, people, !id, extra));
      say("Saved.");
      onDone(next.id);
    } catch (err) { setErrors([errMsg(err)]); setBusy(false); }
  };

  const del = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await applyChanges(tree.id, user, personDeleteChanges(id, people));
      say("Deleted. Use Edit history to undo.");
      onDone();
    } catch (err) { setErrors([errMsg(err)]); setBusy(false); }
  };

  return (
    <>
      <div><h3>{id ? "Edit person" : "Add person"}</h3><h2>{id ? base.name : "New family member"}</h2></div>
      <form onSubmit={save}>
        <label>Full name<span className="hint">As the family writes it, for example surname first</span>
          <input id="person-name" value={p.name} onChange={(e) => set("name", e.target.value)} maxLength={200} required autoFocus />
        </label>
        <label>Sex<span className="hint">Used for the gothram rule</span>
          <select id="person-sex" value={p.sex} onChange={(e) => set("sex", e.target.value as Person["sex"])}>
            <option value="">Not set</option><option value="M">Male</option><option value="F">Female</option>
          </select>
        </label>
        <label>Birth family (surname)
          <select id="person-family" value={p.family} onChange={(e) => set("family", e.target.value)}>
            <option value="">Unknown</option>
            {fams.map((f) => <option key={f.id} value={f.id}>{f.surname}</option>)}
            <option value="__new">+ New family…</option>
          </select>
        </label>
        {p.family === "__new" && <label>New family surname<input id="person-newfam" value={newFam} onChange={(e) => setNewFam(e.target.value)} maxLength={120} /></label>}
        {(["fatherId", "motherId", "spouseId"] as const).map((k) => (
          <label key={k}>{k === "fatherId" ? "Father" : k === "motherId" ? "Mother" : "Spouse"}
            <select id={`person-${k}`} value={p[k]} onChange={(e) => set(k, e.target.value)}>
              <option value="">{k === "spouseId" ? "None" : "Not added"}</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        ))}
        <label className="check"><input id="person-private" type="checkbox" checked={p.private} onChange={(e) => set("private", e.target.checked)} /> Hide name from viewers</label>
        <label className="check"><input id="person-placeholder" type="checkbox" checked={!!p.placeholder} onChange={(e) => set("placeholder", e.target.checked)} /> Details still missing (dashed outline)</label>
        {errors.length > 0 && <ul className="error">{errors.map((x) => <li key={x}>{x}</li>)}</ul>}
        <div className="row">
          <button className="primary" type="submit" disabled={busy}>Save</button>
          <button type="button" onClick={() => onDone(id ?? undefined)}>Cancel</button>
          {id && <button type="button" className="danger" onClick={() => setConfirmDel(true)}>Delete</button>}
        </div>
        {confirmDel && (
          <div className="notice">Delete {base.name}? Links from relatives will be cleared. You can undo this from Edit history.
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="danger" onClick={del} disabled={busy}>Yes, delete</button>
              <button type="button" onClick={() => setConfirmDel(false)}>Keep</button>
            </div>
          </div>
        )}
      </form>
    </>
  );
}

/* ---------------- families & gothrams ---------------- */

export function FamiliesPanel({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const { families, canEdit, tree, user, say } = ctx;
  const list = Object.values(families).sort((a, b) => a.surname.localeCompare(b.surname));
  const [vals, setVals] = useState<Record<string, string>>({});
  const [surname, setSurname] = useState("");
  const [goth, setGoth] = useState("");
  const saveOne = async (id: string) => {
    const f = families[id];
    const v = (vals[id] ?? f.gothram).trim();
    if (v === f.gothram) return;
    try {
      await applyChanges(tree.id, user, [{ coll: "families", id, before: familyDoc(f), after: { surname: f.surname, gothram: v }, label: `Set ${f.surname} gothram to ${v || "blank"}` }]);
      say(`Saved ${f.surname} gothram.`);
    } catch (e) { say(errMsg(e)); }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = surname.trim();
    if (!s) return;
    if (list.some((f) => f.surname.toLowerCase() === s.toLowerCase())) { say(`${s} is already listed.`); return; }
    try {
      await applyChanges(tree.id, user, [{ coll: "families", id: makeId(s, families), before: null, after: { surname: s, gothram: goth.trim() }, label: `Added family ${s}` }]);
      setSurname(""); setGoth(""); say(`Added ${s}.`);
    } catch (err) { say(errMsg(err)); }
  };
  return (
    <>
      <div><h3>Families</h3><h2>Families &amp; gothrams</h2>
        <p className="muted">Enter each family&apos;s gothram once. Everyone in that line, and the women who marry into it, pick it up automatically.</p></div>
      {list.length === 0 && <p className="muted">No families yet. Add one below or while adding a person.</p>}
      <ul className="list">
        {list.map((f) => (
          <li key={f.id} className="fam">
            <span>{f.surname}</span>
            {canEdit ? <input aria-label={`Gothram for ${f.surname}`} id={`goth-${f.id}`} value={vals[f.id] ?? f.gothram} placeholder="To be added" maxLength={120} onChange={(e) => setVals((o) => ({ ...o, [f.id]: e.target.value }))} />
              : <span className={f.gothram ? "goth" : "muted"}>{gothramText(f.gothram)}</span>}
            {canEdit ? <button type="button" onClick={() => saveOne(f.id)}>Save</button> : <span />}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form className="fam" onSubmit={add}>
          <input id="newfam-surname" placeholder="Surname" aria-label="New family surname" value={surname} onChange={(e) => setSurname(e.target.value)} maxLength={120} required />
          <input id="newfam-gothram" placeholder="Gothram (optional)" aria-label="New family gothram" value={goth} onChange={(e) => setGoth(e.target.value)} maxLength={120} />
          <button type="submit">Add</button>
        </form>
      )}
      <div className="row"><button type="button" onClick={onClose}>Done</button></div>
    </>
  );
}

/* ---------------- history ---------------- */

export function HistoryPanel({ ctx, history, onClose }: { ctx: Ctx; history: HistoryEntry[]; onClose: () => void }) {
  const { canEdit, tree, user, people, families, say } = ctx;
  const [busy, setBusy] = useState("");
  const undo = async (h: HistoryEntry) => {
    setBusy(h.id);
    const cur = h.coll === "people" ? (people[h.docId] ? personDoc(people[h.docId]) : null) : (families[h.docId] ? familyDoc(families[h.docId]) : null);
    try { await undoChange(tree.id, user, h, cur); say("Change undone."); } catch (e) { say(errMsg(e)); }
    setBusy("");
  };
  return (
    <>
      <div><h3>Changes</h3><h2>Edit history</h2><p className="muted">The 50 most recent changes. Undo puts that record back the way it was before the change.</p></div>
      {!canEdit ? <p className="notice">Edit history is visible to owners and editors only.</p> : history.length === 0 ? <p className="muted">No changes yet.</p> : (
        <ul className="list">
          {history.map((h) => (
            <li key={h.id} className="item">
              <div>{h.label}<small>{new Date(h.ts).toLocaleString()} · {h.by === user.uid ? "You" : h.byName || "Someone"}</small></div>
              {canEdit && <button type="button" disabled={busy === h.id} onClick={() => undo(h)}>Undo</button>}
            </li>
          ))}
        </ul>
      )}
      <div className="row"><button type="button" onClick={onClose}>Done</button></div>
    </>
  );
}

/* ---------------- sharing ---------------- */

export function SharePanel({ ctx, members, onClose }: { ctx: Ctx; members: Member[]; onClose: () => void }) {
  const { tree, user, role, say } = ctx;
  const isOwner = role === "owner";
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState("");
  const [days, setDays] = useState<number>(7);
  const load = () => { if (isOwner) listInvites(tree.id).then(setInvites).catch(() => {}); };
  useEffect(load, [tree.id, isOwner]);
  const link = (inv: Invite) => `${window.location.origin}/join?tree=${tree.id}&invite=${inv.id}`;
  const make = async (r: "editor" | "viewer") => {
    try { await createInvite(tree.id, tree.name, user, r, days); load(); say(`New ${r} link created. It works for ${days} day${days === 1 ? "" : "s"}.`); } catch (e) { say(errMsg(e)); }
  };
  const copy = async (inv: Invite) => {
    try { await navigator.clipboard.writeText(link(inv)); setCopied(inv.id); } catch { say("Couldn't copy. Select the link and copy it yourself."); }
  };
  const roleLabel: Record<Role, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };
  return (
    <>
      <div><h3>Sharing</h3><h2>People with access</h2></div>
      <ul className="list">
        {members.sort((a, b) => a.name.localeCompare(b.name)).map((m) => (
          <li key={m.uid} className="item">
            <div>{m.name}{m.uid === user.uid && " (you)"}<small>{m.email}</small></div>
            {isOwner && m.role !== "owner" ? (
              <div className="row">
                <select aria-label={`Role for ${m.name}`} id={`role-${m.uid}`} value={m.role} onChange={(e) => setMemberRole(tree.id, m.uid, e.target.value as "editor" | "viewer").catch((er) => say(errMsg(er)))}>
                  <option value="editor">Editor</option><option value="viewer">Viewer</option>
                </select>
                <button type="button" className="danger" onClick={() => removeMember(tree.id, m.uid).catch((er) => say(errMsg(er)))}>Remove</button>
              </div>
            ) : <span className="muted">{roleLabel[m.role]}</span>}
          </li>
        ))}
      </ul>
      {isOwner ? (
        <>
          <div><h3>Invite links</h3><p className="muted">Anyone who opens a link and signs in joins with that link&apos;s role. Links stop working when they expire, or when you turn them off.</p></div>
          <label>New links work for
            <select id="invite-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {INVITE_DAYS.map((d) => <option key={d} value={d}>{d} day{d === 1 ? "" : "s"}</option>)}
            </select>
          </label>
          <div className="row"><button type="button" onClick={() => make("editor")}>New editor link</button><button type="button" onClick={() => make("viewer")}>New viewer link</button></div>
          <ul className="list">
            {invites.filter((i) => inviteStatus(i).active).map((inv) => (
              <li key={inv.id} className="stack" style={{ gap: 6 }}>
                <span><strong>{inv.role === "editor" ? "Editor" : "Viewer"} link</strong> <span className="muted">· {inviteStatus(inv).label}</span></span>
                <span className="code">{link(inv)}</span>
                <div className="row">
                  <button type="button" onClick={() => copy(inv)}>{copied === inv.id ? "Copied" : "Copy link"}</button>
                  <button type="button" className="danger" onClick={() => revokeInvite(tree.id, inv.id).then(load).catch((e) => say(errMsg(e)))}>Turn off</button>
                </div>
              </li>
            ))}
          </ul>
          {invites.some((i) => !inviteStatus(i).active) && <p className="muted" style={{ fontSize: ".85rem" }}>{invites.filter((i) => !inviteStatus(i).active).length} expired or turned-off link(s) hidden.</p>}
        </>
      ) : <p className="notice">Only the tree&apos;s owner can invite people or change access.</p>}
      <div className="row"><button type="button" onClick={onClose}>Done</button></div>
    </>
  );
}

/* ---------------- import / export ---------------- */

export function DataPanel({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const { tree, people, families, user, canEdit, say } = ctx;
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const key = `mft-backup-${tree.id}`;
  const readTs = () => { try { const v = localStorage.getItem(key); return v ? Number(v) : null; } catch { return null; } };
  const [lastBackup, setLastBackup] = useState<number | null>(readTs);
  const download = () => {
    try { localStorage.setItem(key, String(Date.now())); } catch { /* storage unavailable */ }
    setLastBackup(Date.now());
    const blob = new Blob([JSON.stringify(exportTree(tree.name, people, families), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${tree.name.replace(/[^\w-]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErrors([]);
    const r = parseTreeFile(await f.text());
    if (!r.ok) { setErrors(r.errors.slice(0, 20)); return; }
    setBusy(true);
    try {
      await applyChanges(tree.id, user, importChanges(r.file, people, families));
      say(`Imported ${r.file.people.length} people and ${r.file.families.length} families.`);
    } catch (e) { setErrors([errMsg(e)]); }
    setBusy(false);
  };
  return (
    <>
      <div><h3>Data</h3><h2>Import &amp; export</h2></div>
      <p className="muted">Export saves the whole tree as a file you keep. Import adds people and families from a file; anyone with the same id is replaced, and each change appears in Edit history.</p>
      <div className="row"><button type="button" onClick={download}>Export tree file</button>
        <span className="muted" style={{ fontSize: ".85rem" }}>{lastBackup === null ? "No backup saved on this device yet." : `Last backup on this device: ${new Date(lastBackup).toLocaleDateString()}`}</span></div>
      {canEdit && <p className="notice">Keep a copy safe: export a backup every few weeks, and after big changes.</p>}
      {canEdit && (
        <label>Import a tree file (.json)
          <input id="import-file" type="file" accept="application/json,.json" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      )}
      {busy && <p className="muted">Importing…</p>}
      {errors.length > 0 && <ul className="error">{errors.map((x) => <li key={x}>{x}</li>)}</ul>}
      <div className="row"><button type="button" onClick={onClose}>Done</button></div>
    </>
  );
}

/* ---------------- tree settings (owner) ---------------- */

export function SettingsPanel({ ctx, members, onClose }: { ctx: Ctx; members: Member[]; onClose: () => void }) {
  const { tree, user, role, say } = ctx;
  const [to, setTo] = useState("");
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState("");
  if (role !== "owner") return <><h2>Tree settings</h2><p className="notice">Only the tree&apos;s owner can change these settings.</p><div className="row"><button type="button" onClick={onClose}>Done</button></div></>;
  const others = members.filter((m) => m.uid !== user.uid);
  const target = others.find((m) => m.uid === to);
  const transfer = async () => {
    if (!target) return;
    setBusy("transfer");
    try { await transferOwnership(tree.id, user.uid, target.uid); say(`${target.name} is now the owner. You're an editor.`); onClose(); }
    catch (e) { say(errMsg(e)); setBusy(""); }
  };
  const del = async () => {
    setBusy("delete");
    try { await deleteTree(tree.id, user.uid, (m) => say(m)); window.location.href = "/"; }
    catch (e) { say(errMsg(e) + " Some data may already be removed; try again to finish."); setBusy(""); }
  };
  return (
    <>
      <div><h3>Owner</h3><h2>Tree settings</h2></div>

      <section className="stack">
        <h3>Hand over this tree</h3>
        <p className="muted">Make another member the owner. You&apos;ll stay on as an editor. Only one person can own a tree.</p>
        {others.length === 0 ? <p className="notice">Invite someone first; you can hand the tree only to an existing member.</p> : (
          <>
            <select id="transfer-to" aria-label="New owner" value={to} onChange={(e) => { setTo(e.target.value); setConfirmTransfer(false); }}>
              <option value="">Choose a member</option>
              {others.map((m) => <option key={m.uid} value={m.uid}>{m.name}{m.email ? ` (${m.email})` : ""}</option>)}
            </select>
            {target && !confirmTransfer && <div className="row"><button type="button" onClick={() => setConfirmTransfer(true)}>Make {target.name} the owner</button></div>}
            {target && confirmTransfer && (
              <div className="notice">Hand {tree.name} to {target.name}? You can&apos;t undo this yourself; only the new owner can hand it back.
                <div className="row" style={{ marginTop: 8 }}>
                  <button type="button" className="primary" onClick={transfer} disabled={busy !== ""}>Yes, hand it over</button>
                  <button type="button" onClick={() => setConfirmTransfer(false)}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="stack">
        <h3>Delete this tree</h3>
        <p className="muted">Permanently removes everyone in the tree, its history and all invite links, for every member. Export a backup first if you might want it later.</p>
        <label>Type the tree name to confirm<span className="hint">{tree.name}</span>
          <input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
        <div className="row"><button type="button" className="danger" disabled={typed.trim() !== tree.name.trim() || busy !== ""} onClick={del}>{busy === "delete" ? "Deleting…" : "Delete tree forever"}</button></div>
      </section>

      <div className="row"><button type="button" onClick={onClose}>Done</button></div>
    </>
  );
}

