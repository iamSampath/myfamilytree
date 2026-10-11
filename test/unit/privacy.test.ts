import { describe, it, expect } from "vitest";
import { daysSince, inviteStatus, mergeSecrets, needsPrivacyMigration, splitPrivate } from "@/lib/privacy";
import type { People } from "@/lib/types";

const base = { sex: "M" as const, family: "", fatherId: "", motherId: "", spouseId: "" };

describe("private names", () => {
  it("never puts a private name in the shared document", () => {
    const { pub, secretName } = splitPrivate({ ...base, name: "Kavya Rao", private: true });
    expect(pub.name).toBe("");
    expect(secretName).toBe("Kavya Rao");
  });
  it("leaves public people unchanged", () => {
    const d = { ...base, name: "Ravi Rao", private: false };
    expect(splitPrivate(d)).toEqual({ pub: d, secretName: null });
  });
  it("editors see the real name again after merging", () => {
    const people: People = { k: { id: "k", ...base, name: "", private: true }, r: { id: "r", ...base, name: "Ravi", private: false } };
    const m = mergeSecrets(people, { k: "Kavya Rao" });
    expect(m.k.name).toBe("Kavya Rao");
    expect(m.r.name).toBe("Ravi");
  });
  it("viewers (no secrets) keep the empty name", () => {
    const people: People = { k: { id: "k", ...base, name: "", private: true } };
    expect(mergeSecrets(people, {}).k.name).toBe("");
  });
  it("finds old private records that still expose the name", () => {
    const raw: People = { a: { id: "a", ...base, name: "Old", private: true }, b: { id: "b", ...base, name: "", private: true } };
    expect(needsPrivacyMigration(raw).map((p) => p.id)).toEqual(["a"]);
  });
});

describe("invite status", () => {
  const now = 1_000_000_000_000;
  it("reports expiry in days and hours", () => {
    expect(inviteStatus({ revoked: false, expiresAt: now + 7 * 86_400_000 }, now)).toEqual({ active: true, label: "Expires in 7 days" });
    expect(inviteStatus({ revoked: false, expiresAt: now + 3 * 3_600_000 }, now)).toEqual({ active: true, label: "Expires in 3 hours" });
  });
  it("marks expired and turned-off links inactive", () => {
    expect(inviteStatus({ revoked: false, expiresAt: now - 1 }, now).active).toBe(false);
    expect(inviteStatus({ revoked: true, expiresAt: now + 1e9 }, now).label).toBe("Turned off");
  });
  it("treats old links without expiry as active", () => {
    expect(inviteStatus({ revoked: false }, now)).toEqual({ active: true, label: "No expiry" });
  });
});

describe("backup reminder", () => {
  it("counts whole days", () => {
    expect(daysSince(null)).toBeNull();
    expect(daysSince(0, 3 * 86_400_000 + 5)).toBe(3);
  });
});
