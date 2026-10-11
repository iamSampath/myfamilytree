/**
 * Tree layout.
 *
 * - Everyone sits in a row for their generation (Generation 1 = oldest in the tree).
 * - A married couple is laid out as one unit, so spouses always sit side by side with
 *   the marriage dot between them. The husband is on the left.
 * - dagre orders the units left-to-right to keep lines short; rows and spacing are then
 *   fixed here so generations line up and nothing overlaps.
 */
import dagre from "dagre";
import type { People, Person } from "./types";
import { spouseOf } from "./family";

export const CARD_W = 184;
export const CARD_H = 92;
const COUPLE_GAP = 36;      // space between spouses (holds the marriage dot)
const UNIT_GAP = 34;        // min space between neighbouring units in a row
const ROW_GAP = 96;         // vertical space between generations (room for separate line levels)
const LEFT = 128;           // room for the generation labels
const TOP = 28;
const MARGIN = 28;

export interface LaidNode { id: string; x: number; y: number; union: boolean }
export interface LaidEdge { from: string; to: string; points: { x: number; y: number }[] }
export interface Row { gen: number; y: number }
export interface Layout { width: number; height: number; nodes: LaidNode[]; edges: LaidEdge[]; rows: Row[]; generation: Record<string, number> }

export const unionKey = (a: string, b: string) => "u:" + [a, b].sort().join("|");

/**
 * Generation number for everyone: parents are one above their children and spouses
 * share a generation. Each separate family group starts at Generation 1.
 */
export function computeGenerations(people: People): Record<string, number> {
  const gen: Record<string, number> = {};
  const kids: Record<string, string[]> = {};
  for (const p of Object.values(people)) {
    for (const par of [p.fatherId, p.motherId]) if (par && people[par]) (kids[par] ??= []).push(p.id);
  }
  // Start each group from its oldest-looking person (no parents in the tree), in a stable order.
  const order = Object.values(people).sort((a, b) =>
    Number(!!(people[a.fatherId] || people[a.motherId])) - Number(!!(people[b.fatherId] || people[b.motherId])) || a.id.localeCompare(b.id));
  for (const start of order) {
    if (gen[start.id] !== undefined) continue;
    const comp: string[] = [];
    const q: string[] = [start.id];
    gen[start.id] = 0;
    while (q.length) {
      const id = q.shift()!;
      comp.push(id);
      const p = people[id];
      const g = gen[id];
      const next: [string, number][] = [];
      if (people[p.fatherId]) next.push([p.fatherId, g - 1]);
      if (people[p.motherId]) next.push([p.motherId, g - 1]);
      const s = spouseOf(p, people);
      if (s) next.push([s.id, g]);
      for (const k of kids[id] ?? []) next.push([k, g + 1]);
      for (const [nid, ng] of next) if (gen[nid] === undefined) { gen[nid] = ng; q.push(nid); }
    }
    const min = Math.min(...comp.map((id) => gen[id]));
    for (const id of comp) gen[id] = gen[id] - min + 1;
  }
  return gen;
}

interface Unit { key: string; members: Person[]; gen: number; w: number; x: number; y: number }

export function layoutTree(people: People): Layout {
  const generation = computeGenerations(people);
  const list = Object.values(people).sort((a, b) => a.id.localeCompare(b.id));

  // 1. Group couples into units.
  const unitOf: Record<string, Unit> = {};
  const units: Unit[] = [];
  for (const p of list) {
    if (unitOf[p.id]) continue;
    const s = spouseOf(p, people);
    let members = [p];
    if (s && !unitOf[s.id]) {
      members = [p, s].sort((a, b) => (a.sex === "M" ? -1 : b.sex === "M" ? 1 : a.sex === "F" ? 1 : b.sex === "F" ? -1 : a.id.localeCompare(b.id)));
    }
    const u: Unit = {
      key: members.length === 2 ? unionKey(members[0].id, members[1].id) : p.id,
      members, gen: generation[p.id], w: members.length * CARD_W + (members.length - 1) * COUPLE_GAP, x: 0, y: 0,
    };
    members.forEach((m) => (unitOf[m.id] = u));
    units.push(u);
  }

  // 2. Let dagre order units within rows.
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: UNIT_GAP, ranksep: ROW_GAP, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const u of units) g.setNode(u.key, { width: u.w, height: CARD_H });
  for (const c of list) {
    const cu = unitOf[c.id];
    const parentUnits = new Set([c.fatherId, c.motherId].filter((id) => people[id]).map((id) => unitOf[id]));
    for (const pu of parentUnits) {
      if (pu === cu || g.hasEdge(pu.key, cu.key)) continue;
      g.setEdge(pu.key, cu.key, { minlen: Math.max(1, cu.gen - pu.gen), weight: 2 });
    }
  }
  dagre.layout(g);

  // 3. Fix rows by generation and remove overlaps.
  const gens = [...new Set(units.map((u) => u.gen))].sort((a, b) => a - b);
  const rowY = (gen: number) => TOP + (gen - 1) * (CARD_H + ROW_GAP) + CARD_H / 2;
  for (const u of units) { u.x = g.node(u.key).x; u.y = rowY(u.gen); }

  // Refine left-to-right order so parents sit above their children (barycenter sweeps).
  const offsetOf = (u: Unit, id: string) => u.members.length === 2 ? (u.members[0].id === id ? -1 : 1) * (u.w / 2 - CARD_W / 2) : 0;
  const parentLinks = new Map<Unit, { pu: Unit; off: number }[]>();   // child unit -> parent units (+ child's offset in its unit)
  const childLinks = new Map<Unit, { cu: Unit; off: number }[]>();    // parent unit -> child units
  for (const c of list) {
    const cu = unitOf[c.id];
    const pus = new Set([c.fatherId, c.motherId].filter((id) => people[id]).map((id) => unitOf[id]));
    for (const pu of pus) {
      if (pu === cu) continue;
      (parentLinks.get(cu) ?? parentLinks.set(cu, []).get(cu)!).push({ pu, off: offsetOf(cu, c.id) });
      (childLinks.get(pu) ?? childLinks.set(pu, []).get(pu)!).push({ cu, off: offsetOf(cu, c.id) });
    }
  }
  const rows = new Map(gens.map((gen) => [gen, units.filter((u) => u.gen === gen).sort((a, b) => a.x - b.x)]));
  const place = (row: Unit[], desired: Map<Unit, number>) => {
    row.sort((a, b) => desired.get(a)! - desired.get(b)! || a.x - b.x);
    // Average a left-packed and a right-packed placement: keeps order and gaps, stays near targets.
    const left = row.map(() => 0), right = row.map(() => 0);
    row.forEach((u, i) => { const d = desired.get(u)!; left[i] = i === 0 ? d : Math.max(d, left[i - 1] + row[i - 1].w / 2 + UNIT_GAP + u.w / 2); });
    for (let i = row.length - 1; i >= 0; i--) { const d = desired.get(row[i])!; right[i] = i === row.length - 1 ? d : Math.min(d, right[i + 1] - row[i + 1].w / 2 - UNIT_GAP - row[i].w / 2); }
    row.forEach((u, i) => (u.x = (left[i] + right[i]) / 2));
  };
  for (let iter = 0; iter < 8; iter++) {
    const up = iter % 2 === 0;
    const seq = up ? [...gens].reverse() : gens;
    for (const gen of seq) {
      const row = rows.get(gen)!;
      const desired = new Map<Unit, number>();
      for (const u of row) {
        const links = up ? (childLinks.get(u) ?? []).map((l) => l.cu.x + l.off) : (parentLinks.get(u) ?? []).map((l) => l.pu.x - l.off);
        desired.set(u, links.length ? links.reduce((a, b) => a + b, 0) / links.length : u.x);
      }
      place(row, desired);
    }
  }
  const minLeft = Math.min(...units.map((u) => u.x - u.w / 2));
  for (const u of units) u.x += LEFT - minLeft;

  // 4. Positions for cards and marriage dots.
  const pos: Record<string, { x: number; y: number }> = {};
  const nodes: LaidNode[] = [];
  const edges: LaidEdge[] = [];
  for (const u of units) {
    if (u.members.length === 2) {
      const [a, b] = u.members;
      pos[a.id] = { x: u.x - u.w / 2 + CARD_W / 2, y: u.y };
      pos[b.id] = { x: u.x + u.w / 2 - CARD_W / 2, y: u.y };
      nodes.push({ id: u.key, x: u.x, y: u.y, union: true });
      edges.push({ from: a.id, to: b.id, points: [{ x: pos[a.id].x + CARD_W / 2, y: u.y }, { x: pos[b.id].x - CARD_W / 2, y: u.y }] });
    } else {
      pos[u.members[0].id] = { x: u.x, y: u.y };
    }
  }
  for (const p of list) nodes.push({ id: p.id, x: pos[p.id].x, y: pos[p.id].y, union: false });

  // 5. Parent-to-child lines: down from the marriage dot (or a lone parent's card),
  //    across on a bar, then down to each child. Each family gets its own bar level
  //    where bars would overlap, so lines from different parents never merge.
  interface Group { from: string; sx: number; sy: number; parentRow: number; kids: { id: string; x: number; y: number }[] }
  const groups = new Map<string, Group>();
  for (const c of list) {
    const f = people[c.fatherId], m = people[c.motherId];
    if (!f && !m) continue;
    let from: string; let sx: number; let sy: number;
    if (f && m && unitOf[f.id] === unitOf[m.id] && unitOf[f.id].members.length === 2) {
      const u = unitOf[f.id];
      from = u.key; sx = u.x; sy = u.y;
    } else {
      const par = (f || m)!;
      from = par.id; sx = pos[par.id].x; sy = pos[par.id].y + CARD_H / 2;
    }
    const gkey = from;
    if (!groups.has(gkey)) groups.set(gkey, { from, sx, sy, parentRow: f ? pos[f.id].y : pos[m!.id].y, kids: [] });
    groups.get(gkey)!.kids.push({ id: c.id, x: pos[c.id].x, y: pos[c.id].y - CARD_H / 2 });
  }
  // Assign bar levels per parent row: overlapping spans get different levels.
  const byRow = new Map<number, Group[]>();
  for (const gr of groups.values()) (byRow.get(gr.parentRow) ?? byRow.set(gr.parentRow, []).get(gr.parentRow)!).push(gr);
  for (const [rowY, grs] of byRow) {
    const spans = grs.map((gr) => {
      const xs = [gr.sx, ...gr.kids.map((k) => k.x)];
      return { gr, lo: Math.min(...xs), hi: Math.max(...xs), lane: 0 };
    }).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    const laneEnd: number[] = [];
    for (const sp of spans) {
      let lane = laneEnd.findIndex((end) => end + 12 < sp.lo);
      if (lane === -1) { lane = laneEnd.length; laneEnd.push(sp.hi); } else laneEnd[lane] = sp.hi;
      sp.lane = lane;
    }
    const lanes = Math.max(1, laneEnd.length);
    const top = rowY + CARD_H / 2 + 16, bottom = rowY + CARD_H / 2 + ROW_GAP - 16;
    const step = lanes > 1 ? (bottom - top) / (lanes - 1) : 0;
    for (const sp of spans) {
      const busY = lanes > 1 ? top + sp.lane * step : rowY + CARD_H / 2 + ROW_GAP / 2;
      for (const k of sp.gr.kids) {
        edges.push({ from: sp.gr.from, to: k.id, points: [{ x: sp.gr.sx, y: sp.gr.sy }, { x: sp.gr.sx, y: busY }, { x: k.x, y: busY }, { x: k.x, y: k.y }] });
      }
    }
  }

  const width = Math.max(...units.map((u) => u.x + u.w / 2), LEFT) + MARGIN;
  const height = (gens.length ? rowY(gens[gens.length - 1]) + CARD_H / 2 : TOP) + MARGIN;
  return { width, height, nodes, edges, rows: gens.map((gen) => ({ gen, y: rowY(gen) })), generation };
}

/** Split a long name across two lines near the middle word boundary. */
export function wrapName(name: string, max = 20): string[] {
  const w = name.split(" ");
  if (name.length <= max || w.length < 2) return [name];
  let best = 1;
  let diff = Infinity;
  for (let i = 1; i < w.length; i++) {
    const d = Math.abs(w.slice(0, i).join(" ").length - w.slice(i).join(" ").length);
    if (d < diff) { diff = d; best = i; }
  }
  return [w.slice(0, best).join(" "), w.slice(best).join(" ")];
}
