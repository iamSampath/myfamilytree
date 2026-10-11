/**
 * Privacy and invite helpers. Pure functions, no Firebase, so they can be unit-tested.
 *
 * A private person's name is never stored in the shared `people` document. It lives in
 * `secrets/{personId}`, which only owners and editors can read, so viewers' browsers
 * never receive it.
 */
import type { People, Person } from "./types";

/** Split a person document into what everyone may read and what only editors may read. */
export function splitPrivate(doc: Record<string, unknown>): { pub: Record<string, unknown>; secretName: string | null } {
  if (doc.private === true) return { pub: { ...doc, name: "" }, secretName: String(doc.name ?? "") };
  return { pub: doc, secretName: null };
}

/** Put protected names back onto private people (editors only receive `secrets`). */
export function mergeSecrets(people: People, secrets: Record<string, string>): People {
  const out: People = {};
  for (const [id, p] of Object.entries(people)) out[id] = p.private && secrets[id] ? { ...p, name: secrets[id] } : p;
  return out;
}

/** Private people whose name is still in the shared document (data saved before this protection existed). */
export function needsPrivacyMigration(raw: People): Person[] {
  return Object.values(raw).filter((p) => p.private && p.name !== "");
}

export const INVITE_DAYS = [1, 7, 30] as const;

/** Invite status for display. `expiresAt` is milliseconds since epoch, or undefined for old links. */
export function inviteStatus(inv: { revoked: boolean; expiresAt?: number }, now = Date.now()): { active: boolean; label: string } {
  if (inv.revoked) return { active: false, label: "Turned off" };
  if (inv.expiresAt === undefined) return { active: true, label: "No expiry" };
  const ms = inv.expiresAt - now;
  if (ms <= 0) return { active: false, label: "Expired" };
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 24) return { active: true, label: `Expires in ${hours} hour${hours === 1 ? "" : "s"}` };
  const days = Math.ceil(ms / 86_400_000);
  return { active: true, label: `Expires in ${days} day${days === 1 ? "" : "s"}` };
}

/** Days since the last backup, or null if never. */
export function daysSince(ts: number | null, now = Date.now()): number | null {
  return ts === null ? null : Math.floor((now - ts) / 86_400_000);
}
