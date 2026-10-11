/**
 * Automatic tree layout with dagre. Couples meet at a small "union" node and
 * their children hang from it, so no one positions boxes by hand.
 */
import dagre from "dagre";
import type { People } from "./types";
import { spouseOf } from "./family";

export const CARD_W = 184;
export const CARD_H = 92;

export interface LaidNode { id: string; x: number; y: number; union: boolean }
export interface LaidEdge { from: string; to: string; points: { x: number; y: number }[] }
export interface Layout { width: number; height: number; nodes: LaidNode[]; edges: LaidEdge[] }

export const unionKey = (a: string, b: string) => "u:" + [a, b].sort().join("|");

export function layoutTree(people: People): Layout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 26, ranksep: 34, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  const list = Object.values(people);
  for (const p of list) g.setNode(p.id, { width: CARD_W, height: CARD_H });

  const unions = new Map<string, [string, string]>();
  for (const p of list) {
    const s = spouseOf(p, people);
    if (s) unions.set(unionKey(p.id, s.id), [p.id, s.id]);
  }
  // Parents who aren't recorded as spouses still share a union for their children.
  for (const c of list) {
    if (people[c.fatherId] && people[c.motherId]) {
      const k = unionKey(c.fatherId, c.motherId);
      if (!unions.has(k)) unions.set(k, [c.fatherId, c.motherId]);
    }
  }
  for (const [k, pair] of unions) {
    g.setNode(k, { width: 12, height: 12 });
    for (const id of pair) g.setEdge(id, k);
  }
  for (const c of list) {
    const f = people[c.fatherId];
    const m = people[c.motherId];
    if (f && m) g.setEdge(unionKey(f.id, m.id), c.id);
    else if (f || m) g.setEdge((f || m)!.id, c.id, { minlen: 2 });
  }

  dagre.layout(g);
  const gr = g.graph();
  return {
    width: gr.width ?? 0,
    height: gr.height ?? 0,
    nodes: g.nodes().map((id) => {
      const n = g.node(id);
      return { id, x: n.x, y: n.y, union: id.startsWith("u:") };
    }),
    edges: g.edges().map((e) => ({ from: e.v, to: e.w, points: g.edge(e).points ?? [] })),
  };
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
