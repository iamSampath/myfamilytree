"use client";
/**
 * Firestore data layer. Every change to a person or family is written together
 * with a history entry in one batch, so the log can't drift from the data.
 */
import {
  collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, writeBatch,
  updateDoc, deleteDoc, setDoc, type Unsubscribe, type WriteBatch,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { fb } from "./firebase";
import type { Families, Family, HistoryEntry, Invite, Member, People, Person, Role, Tree } from "./types";
import type { TreeFile } from "./portable";

const strip = <T extends { id: string }>(o: T) => { const { id, ...r } = o; return r; };

export function randomId(prefix = "", len = 24) {
  const abc = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return prefix + Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

const who = (u: User) => ({ name: (u.displayName || u.email || "Someone").slice(0, 120), email: (u.email || "").slice(0, 200) });

/* ---------- trees ---------- */

export async function createTree(user: User, name: string): Promise<string> {
  const { db } = fb();
  const id = randomId("t_", 16);
  const b = writeBatch(db);
  b.set(doc(db, "trees", id), { name: name.slice(0, 120), ownerId: user.uid, createdAt: Date.now() });
  b.set(doc(db, "trees", id, "members", user.uid), { uid: user.uid, role: "owner", ...who(user), joinedAt: Date.now() });
  b.set(doc(db, "users", user.uid, "trees", id), { role: "owner", addedAt: Date.now() });
  await b.commit();
  return id;
}

export async function listMyTrees(uid: string): Promise<(Tree & { role: Role })[]> {
  const { db } = fb();
  const idx = await getDocs(collection(db, "users", uid, "trees"));
  const out: (Tree & { role: Role })[] = [];
  for (const d of idx.docs) {
    try {
      const [t, m] = await Promise.all([getDoc(doc(db, "trees", d.id)), getDoc(doc(db, "trees", d.id, "members", uid))]);
      if (t.exists() && m.exists()) out.push({ id: d.id, ...(t.data() as Omit<Tree, "id">), role: m.data().role });
    } catch {
      // No longer a member (removed by the owner): skip it.
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export const renameTree = (treeId: string, name: string) => updateDoc(doc(fb().db, "trees", treeId), { name: name.slice(0, 120) });

/* ---------- live subscriptions ---------- */

export interface TreeHandlers {
  tree: (t: Tree | null) => void;
  people: (p: People) => void;
  families: (f: Families) => void;
  history: (h: HistoryEntry[]) => void;
  members: (m: Member[]) => void;
  error: (e: Error) => void;
}

export function subscribeTree(treeId: string, h: TreeHandlers): Unsubscribe {
  const { db } = fb();
  const subs: Unsubscribe[] = [
    onSnapshot(doc(db, "trees", treeId), (s) => h.tree(s.exists() ? ({ id: s.id, ...s.data() } as Tree) : null), h.error),
    onSnapshot(collection(db, "trees", treeId, "people"), (s) => {
      const o: People = {};
      s.docs.forEach((d) => (o[d.id] = { id: d.id, ...(d.data() as Omit<Person, "id">) }));
      h.people(o);
    }, h.error),
    onSnapshot(collection(db, "trees", treeId, "families"), (s) => {
      const o: Families = {};
      s.docs.forEach((d) => (o[d.id] = { id: d.id, ...(d.data() as Omit<Family, "id">) }));
      h.families(o);
    }, h.error),
    onSnapshot(query(collection(db, "trees", treeId, "history"), orderBy("ts", "desc"), limit(50)), (s) =>
      h.history(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HistoryEntry, "id">) }))), h.error),
    onSnapshot(collection(db, "trees", treeId, "members"), (s) =>
      h.members(s.docs.map((d) => d.data() as Member)), h.error),
  ];
  return () => subs.forEach((u) => u());
}

/* ---------- edits with history ---------- */

export interface Change {
  coll: "people" | "families";
  id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  label: string;
}

function addChange(b: WriteBatch, treeId: string, user: User, c: Change, ts: number) {
  const { db } = fb();
  const ref = doc(db, "trees", treeId, c.coll, c.id);
  if (c.after) b.set(ref, c.after); else b.delete(ref);
  b.set(doc(collection(db, "trees", treeId, "history")), {
    ts, coll: c.coll, docId: c.id, before: c.before, after: c.after, label: c.label.slice(0, 300),
    by: user.uid, byName: who(user).name,
  });
}

/** Apply several changes atomically (Firestore batches hold up to 500 writes; each change uses 2). */
export async function applyChanges(treeId: string, user: User, changes: Change[]) {
  const { db } = fb();
  const ts = Date.now();
  for (let i = 0; i < changes.length; i += 200) {
    const b = writeBatch(db);
    changes.slice(i, i + 200).forEach((c, j) => addChange(b, treeId, user, c, ts + i + j));
    await b.commit();
  }
}

export const personDoc = (p: Person) => {
  const d: Record<string, unknown> = strip(p);
  if (!p.placeholder) delete d.placeholder;
  return d;
};
export const familyDoc = (f: Family) => strip(f);

/**
 * Save a person and keep spouse links two-way: linking A↔B unlinks any previous
 * spouse of A or B, so the marriage is never one-sided.
 */
export function personSaveChanges(next: Person, people: People, isNew: boolean, extra: Change[] = []): Change[] {
  const prev = people[next.id];
  const changes: Change[] = [{
    coll: "people", id: next.id, before: prev ? personDoc(prev) : null, after: personDoc(next),
    label: `${isNew ? "Added" : "Edited"} ${next.name}`,
  }];
  const touched: Record<string, Person> = {};
  const get = (id: string) => touched[id] ?? people[id];
  const setP = (p: Person, label: string) => {
    const before = people[p.id];
    touched[p.id] = p;
    changes.push({ coll: "people", id: p.id, before: before ? personDoc(before) : null, after: personDoc(p), label });
  };
  const oldS = prev?.spouseId;
  if (oldS && oldS !== next.spouseId && get(oldS)?.spouseId === next.id) setP({ ...get(oldS), spouseId: "" }, `Unlinked ${get(oldS).name}'s spouse`);
  if (next.spouseId && get(next.spouseId) && get(next.spouseId).spouseId !== next.id) {
    const t = get(next.spouseId);
    if (t.spouseId && t.spouseId !== next.id && get(t.spouseId)?.spouseId === t.id) setP({ ...get(t.spouseId), spouseId: "" }, `Unlinked ${get(t.spouseId).name}'s spouse`);
    setP({ ...t, spouseId: next.id }, `Linked ${t.name} as spouse of ${next.name}`);
  }
  return [...changes, ...extra];
}

export function personDeleteChanges(id: string, people: People): Change[] {
  const p = people[id];
  const changes: Change[] = [];
  for (const c of Object.values(people)) {
    if (c.id === id) continue;
    const n = { ...c };
    let hit = false;
    if (n.fatherId === id) { n.fatherId = ""; hit = true; }
    if (n.motherId === id) { n.motherId = ""; hit = true; }
    if (n.spouseId === id) { n.spouseId = ""; hit = true; }
    if (hit) changes.push({ coll: "people", id: c.id, before: personDoc(c), after: personDoc(n), label: `Unlinked ${p.name} from ${c.name}` });
  }
  changes.push({ coll: "people", id, before: personDoc(p), after: null, label: `Deleted ${p.name}` });
  return changes;
}

export function importChanges(file: TreeFile, people: People, families: Families): Change[] {
  return [
    ...file.families.map((f) => ({ coll: "families" as const, id: f.id, before: families[f.id] ? familyDoc(families[f.id]) : null, after: familyDoc(f), label: `Imported family ${f.surname}` })),
    ...file.people.map((p) => ({ coll: "people" as const, id: p.id, before: people[p.id] ? personDoc(people[p.id]) : null, after: personDoc(p), label: `Imported ${p.name}` })),
  ];
}

/** Undo: put the document back the way it was before that change. */
export const undoChange = (treeId: string, user: User, h: HistoryEntry, current: Record<string, unknown> | null) =>
  applyChanges(treeId, user, [{ coll: h.coll, id: h.docId, before: current, after: h.before, label: `Undid: ${h.label}` }]);

/* ---------- sharing ---------- */

export async function createInvite(treeId: string, treeName: string, user: User, role: "editor" | "viewer") {
  const id = randomId("inv_", 24);
  await setDoc(doc(fb().db, "trees", treeId, "invites", id), { treeName, role, createdBy: user.uid, createdAt: Date.now(), revoked: false });
  return id;
}

export async function listInvites(treeId: string): Promise<Invite[]> {
  const s = await getDocs(collection(fb().db, "trees", treeId, "invites"));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Invite, "id">) })).sort((a, b) => b.createdAt - a.createdAt);
}

export const revokeInvite = (treeId: string, id: string) => updateDoc(doc(fb().db, "trees", treeId, "invites", id), { revoked: true });

export async function readInvite(treeId: string, id: string): Promise<Invite | null> {
  const s = await getDoc(doc(fb().db, "trees", treeId, "invites", id));
  return s.exists() ? ({ id: s.id, ...(s.data() as Omit<Invite, "id">) }) : null;
}

/** Returns the role the user now holds. Already-members keep their current role. */
export async function acceptInvite(user: User, treeId: string, invite: Invite): Promise<Role> {
  const { db } = fb();
  const mref = doc(db, "trees", treeId, "members", user.uid);
  try {
    const existing = await getDoc(mref);
    if (existing.exists()) {
      const role = existing.data().role as Role;
      await setDoc(doc(db, "users", user.uid, "trees", treeId), { role, addedAt: Date.now() });
      return role;
    }
  } catch {
    // Not a member yet: reading the member list is refused, which is expected.
  }
  await setDoc(mref, { uid: user.uid, role: invite.role, ...who(user), joinedAt: Date.now(), inviteId: invite.id });
  await setDoc(doc(db, "users", user.uid, "trees", treeId), { role: invite.role, addedAt: Date.now() });
  return invite.role;
}

export const setMemberRole = (treeId: string, uid: string, role: "editor" | "viewer") =>
  updateDoc(doc(fb().db, "trees", treeId, "members", uid), { role });
export const removeMember = (treeId: string, uid: string) => deleteDoc(doc(fb().db, "trees", treeId, "members", uid));
