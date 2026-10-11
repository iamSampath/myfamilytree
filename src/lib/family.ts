/**
 * Family rules: relationships, gothram inheritance and names.
 * Pure functions, no Firebase, so they can be unit-tested.
 *
 * Gothram rule (as specified by the product owner):
 * - A gothram is patrilineal: a person takes the gothram of their birth family line.
 * - A married woman takes her husband's gothram, even though her surname may differ.
 *   Her birth gothram is kept and shown separately.
 */
import type { Families, Person, People } from "./types";

export function spouseOf(p: Person, people: People): Person | null {
  const s = p.spouseId ? people[p.spouseId] : undefined;
  // Only count a marriage when both sides point at each other.
  return s && s.spouseId === p.id ? s : null;
}

/** The husband, if `p` is a married woman; otherwise null. */
export function husbandOf(p: Person, people: People): Person | null {
  if (p.sex !== "F") return null;
  const s = spouseOf(p, people);
  return s && s.sex !== "F" ? s : null;
}

export function lineGothram(p: Person, families: Families): string {
  return families[p.family]?.gothram ?? "";
}

/** The gothram to display for a person. "" means not yet known. */
export function gothramOf(p: Person, people: People, families: Families): string {
  const h = husbandOf(p, people);
  return h ? lineGothram(h, families) : lineGothram(p, families);
}

/** Birth gothram for married women; null when it is the same as their gothram by rule. */
export function birthGothramOf(p: Person, people: People, families: Families): string | null {
  return husbandOf(p, people) ? lineGothram(p, families) : null;
}

/** "née Surname" for a married woman whose current name doesn't already contain her birth surname. */
export function maidenLabel(p: Person, people: People, families: Families): string {
  const f = families[p.family];
  if (!f || !f.surname || !husbandOf(p, people)) return "";
  return p.name.toLowerCase().includes(f.surname.toLowerCase()) ? "" : `née ${f.surname}`;
}

export function childrenOf(id: string, people: People): Person[] {
  return Object.values(people).filter((c) => c.fatherId === id || c.motherId === id);
}

export const gothramText = (g: string) => g || "To be added";

/** Name to show a viewer: private people are hidden from view-only members. */
export function displayName(p: Person, canEdit: boolean): string {
  return p.private && !canEdit ? "Private" : p.name;
}

/** URL-safe id from a name, unique within `taken`. */
export function makeId(name: string, taken: Record<string, unknown>): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "person";
  let id = base;
  let i = 2;
  while (taken[id]) id = `${base}-${i++}`;
  return id;
}

/**
 * Problems in the data that would make the tree wrong. Returned as readable
 * messages; the editor blocks saves that would introduce them.
 */
export function validatePerson(p: Person, people: People): string[] {
  const errs: string[] = [];
  if (!p.name.trim()) errs.push("Name is required.");
  if (p.name.length > 200) errs.push("Name is too long (200 characters max).");
  for (const k of ["fatherId", "motherId", "spouseId"] as const) {
    if (p[k] === p.id && p.id) errs.push("A person can't be linked to themselves.");
  }
  if (p.fatherId && p.fatherId === p.motherId) errs.push("Father and mother must be different people.");
  if (p.spouseId && (p.spouseId === p.fatherId || p.spouseId === p.motherId))
    errs.push("A parent can't also be the spouse.");
  // Cycle check: the person must not be their own ancestor.
  if (p.id) {
    const seen = new Set<string>();
    const stack = [p.fatherId, p.motherId].filter(Boolean);
    while (stack.length) {
      const id = stack.pop()!;
      if (id === p.id) {
        errs.push("These parents would make this person their own ancestor.");
        break;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      const a = people[id];
      if (a) stack.push(...[a.fatherId, a.motherId].filter(Boolean));
    }
  }
  return [...new Set(errs)];
}
