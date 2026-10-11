/**
 * Security rules tests. Run with: npm run test:rules  (starts the Firestore emulator; needs Java).
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, collection, getDocs } from "firebase/firestore";

let env: RulesTestEnvironment;
const T = "tree1";
const INVITE = "inv_abcdefghijklmnopqrstuv";
const person = { name: "Ravi Rao", sex: "M", family: "rao", fatherId: "", motherId: "", spouseId: "", private: false };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-myfamilytree",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `trees/${T}`), { name: "Rao", ownerId: "owner", createdAt: 1 });
    await setDoc(doc(db, `trees/${T}/members/owner`), { uid: "owner", role: "owner", name: "O", email: "", joinedAt: 1 });
    await setDoc(doc(db, `trees/${T}/members/ed`), { uid: "ed", role: "editor", name: "E", email: "", joinedAt: 1 });
    await setDoc(doc(db, `trees/${T}/members/vw`), { uid: "vw", role: "viewer", name: "V", email: "", joinedAt: 1 });
    await setDoc(doc(db, `trees/${T}/invites/${INVITE}`), { treeName: "Rao", role: "editor", createdBy: "owner", createdAt: 1, revoked: false });
    await setDoc(doc(db, `trees/${T}/people/ravi`), person);
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe("reading", () => {
  it("members can read; strangers and signed-out visitors cannot", async () => {
    await assertSucceeds(getDoc(doc(as("vw"), `trees/${T}/people/ravi`)));
    await assertFails(getDoc(doc(as("stranger"), `trees/${T}/people/ravi`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `trees/${T}/people/ravi`)));
    await assertFails(getDoc(doc(as("stranger"), `trees/${T}`)));
  });
});

describe("editing people", () => {
  it("owners and editors can edit, viewers cannot", async () => {
    await assertSucceeds(setDoc(doc(as("ed"), `trees/${T}/people/anil`), { ...person, name: "Anil" }));
    await assertSucceeds(setDoc(doc(as("owner"), `trees/${T}/people/kavya`), { ...person, name: "Kavya", sex: "F" }));
    await assertFails(setDoc(doc(as("vw"), `trees/${T}/people/x`), person));
    await assertFails(deleteDoc(doc(as("vw"), `trees/${T}/people/ravi`)));
  });
  it("rejects unexpected fields and empty names", async () => {
    await assertFails(setDoc(doc(as("ed"), `trees/${T}/people/y`), { ...person, admin: true }));
    await assertFails(setDoc(doc(as("ed"), `trees/${T}/people/y`), { ...person, name: "" }));
  });
});

describe("creating a tree", () => {
  it("creator becomes owner in one batch", async () => {
    const db = as("alice");
    const b = writeBatch(db);
    b.set(doc(db, "trees/t2"), { name: "Mine", ownerId: "alice", createdAt: 1 });
    b.set(doc(db, "trees/t2/members/alice"), { uid: "alice", role: "owner", name: "A", email: "", joinedAt: 1 });
    await assertSucceeds(b.commit());
  });
  it("cannot claim ownership of an existing tree", async () => {
    await assertFails(setDoc(doc(as("mallory"), `trees/${T}/members/mallory`), { uid: "mallory", role: "owner", name: "M", email: "", joinedAt: 1 }));
  });
  it("cannot create a tree without the owner record", async () => {
    await assertFails(setDoc(doc(as("alice"), "trees/t3"), { name: "X", ownerId: "alice", createdAt: 1 }));
  });
});

describe("invites", () => {
  const join = (uid: string, role: string, inviteId = INVITE) =>
    setDoc(doc(as(uid), `trees/${T}/members/${uid}`), { uid, role, name: "N", email: "", joinedAt: 1, inviteId });

  it("signed-in person with a valid invite joins with its role", async () => {
    await assertSucceeds(getDoc(doc(as("newbie"), `trees/${T}/invites/${INVITE}`)));
    await assertSucceeds(join("newbie", "editor"));
  });
  it("cannot take a higher role than the invite gives", async () => {
    await assertFails(join("newbie", "owner"));
  });
  it("cannot join with a made-up or revoked invite", async () => {
    await assertFails(join("newbie", "editor", "inv_doesnotexist_xxxxxxxx"));
    await assertSucceeds(updateDoc(doc(as("owner"), `trees/${T}/invites/${INVITE}`), { revoked: true }));
    await assertFails(join("newbie", "editor"));
  });
  it("only owners list or create invites", async () => {
    await assertFails(getDocs(collection(as("ed"), `trees/${T}/invites`)));
    await assertSucceeds(getDocs(collection(as("owner"), `trees/${T}/invites`)));
    await assertFails(setDoc(doc(as("ed"), `trees/${T}/invites/inv_zzzzzzzzzzzzzzzzzzzzzz`), { treeName: "Rao", role: "editor", createdBy: "ed", createdAt: 1, revoked: false }));
  });
  it("a member cannot raise their own role", async () => {
    await assertFails(updateDoc(doc(as("vw"), `trees/${T}/members/vw`), { role: "editor" }));
    await assertFails(join("vw", "editor"));
  });
  it("owners can change roles and remove members, but not make another owner", async () => {
    await assertSucceeds(updateDoc(doc(as("owner"), `trees/${T}/members/vw`), { role: "editor" }));
    await assertFails(updateDoc(doc(as("owner"), `trees/${T}/members/ed`), { role: "owner" }));
    await assertSucceeds(deleteDoc(doc(as("owner"), `trees/${T}/members/ed`)));
  });
});

describe("history", () => {
  const entry = (by: string) => ({ ts: 1, coll: "people", docId: "ravi", before: null, after: person, label: "Added", by, byName: "" });
  it("editors append history as themselves; no one rewrites it", async () => {
    await assertSucceeds(setDoc(doc(as("ed"), `trees/${T}/history/h1`), entry("ed")));
    await assertFails(setDoc(doc(as("ed"), `trees/${T}/history/h2`), entry("owner")));
    await assertFails(setDoc(doc(as("vw"), `trees/${T}/history/h3`), entry("vw")));
    await assertFails(updateDoc(doc(as("owner"), `trees/${T}/history/h1`), { label: "x" }));
  });
});
