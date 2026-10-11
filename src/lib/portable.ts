/**
 * Import/export format for a whole tree ("myfamilytree/v1").
 * Import validates everything before anything is written.
 */
import type { Families, Family, People, Person, Sex } from "./types";

export const FORMAT = "myfamilytree/v1";

export interface TreeFile {
  format: typeof FORMAT;
  name: string;
  families: Family[];
  people: Person[];
}

const ID = /^[A-Za-z0-9_.~:@+-]{1,200}$/;
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

export function exportTree(name: string, people: People, families: Families): TreeFile {
  return {
    format: FORMAT,
    name,
    families: Object.values(families).sort((a, b) => a.id.localeCompare(b.id)),
    people: Object.values(people).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export type ParseResult =
  | { ok: true; file: TreeFile }
  | { ok: false; errors: string[] };

export function parseTreeFile(text: string): ParseResult {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["This file isn't valid JSON."] };
  }
  const errors: string[] = [];
  if (!raw || raw.format !== FORMAT) errors.push(`This isn't a ${FORMAT} file.`);
  if (!Array.isArray(raw?.people)) errors.push("The file has no people list.");
  if (!Array.isArray(raw?.families)) errors.push("The file has no families list.");
  if (errors.length) return { ok: false, errors };

  const families: Family[] = [];
  const famIds = new Set<string>();
  for (const f of raw.families) {
    if (!ID.test(f?.id ?? "")) { errors.push(`Family id "${f?.id}" is not valid.`); continue; }
    if (famIds.has(f.id)) { errors.push(`Family "${f.id}" appears twice.`); continue; }
    famIds.add(f.id);
    families.push({ id: f.id, surname: str(f.surname) || f.id, gothram: str(f.gothram) });
  }

  const people: Person[] = [];
  const ids = new Set<string>();
  for (const p of raw.people) {
    if (!ID.test(p?.id ?? "")) { errors.push(`Person id "${p?.id}" is not valid.`); continue; }
    if (ids.has(p.id)) { errors.push(`Person "${p.id}" appears twice.`); continue; }
    if (!str(p.name).trim()) { errors.push(`Person "${p.id}" has no name.`); continue; }
    ids.add(p.id);
    const sex: Sex = p.sex === "M" || p.sex === "F" ? p.sex : "";
    people.push({
      id: p.id, name: str(p.name).trim(), sex, family: str(p.family),
      fatherId: str(p.fatherId), motherId: str(p.motherId), spouseId: str(p.spouseId),
      private: !!p.private, ...(p.placeholder ? { placeholder: true } : {}),
    });
  }
  for (const p of people) {
    for (const k of ["fatherId", "motherId", "spouseId"] as const) {
      if (p[k] && !ids.has(p[k])) errors.push(`${p.name}: ${k.replace("Id", "")} "${p[k]}" is not in the file.`);
    }
    if (p.family && !famIds.has(p.family)) errors.push(`${p.name}: family "${p.family}" is not in the file.`);
  }
  if (people.length > 5000) errors.push("A tree file can hold at most 5,000 people.");
  if (errors.length) return { ok: false, errors };
  return { ok: true, file: { format: FORMAT, name: str(raw.name) || "Family tree", families, people } };
}
