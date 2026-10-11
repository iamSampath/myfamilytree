"use client";
import { useMemo, useRef, useState } from "react";
import { CARD_H, CARD_W, layoutTree, wrapName } from "@/lib/layout";
import { displayName, gothramOf, gothramText, maidenLabel } from "@/lib/family";
import type { Families, People } from "@/lib/types";

interface Props { people: People; families: Families; canEdit: boolean; selected: string | null; onSelect: (id: string) => void }

export function TreeCanvas({ people, families, canEdit, selected, onSelect }: Props) {
  const layout = useMemo(() => layoutTree(people), [people]);
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const z = (v: number) => setZoom(Math.min(2, Math.max(0.3, v)));

  return (
    <div className="canvas" ref={box}>
      <div className="zoom">
        <button type="button" aria-label="Zoom out" onClick={() => z(zoom / 1.2)}>−</button>
        <button type="button" onClick={() => box.current && layout.width && z((box.current.clientWidth - 16) / layout.width)}>Fit</button>
        <button type="button" aria-label="Zoom in" onClick={() => z(zoom * 1.2)}>+</button>
      </div>
      <svg className="tree" viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width * zoom} height={layout.height * zoom} role="img" aria-label="Family tree">
        {layout.edges.map((e, i) => (
          <path key={i} className="edge" d={"M" + e.points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L")} />
        ))}
        {layout.nodes.filter((n) => n.union).map((n) => <circle key={n.id} className="union" cx={n.x} cy={n.y} r={6} />)}
        {layout.nodes.filter((n) => !n.union).map((n) => {
          const p = people[n.id];
          if (!p) return null;
          const name = displayName(p, canEdit);
          const lines = wrapName(name);
          const sub = p.private && !canEdit ? "" : maidenLabel(p, people, families);
          const g = gothramOf(p, people, families);
          const sex = p.sex === "M" || p.sex === "F" ? p.sex : "U";
          let ty = n.y - (lines.length === 2 ? 24 : 16) - (sub ? 8 : 0) + (lines.length === 1 && !sub ? 6 : 0);
          return (
            <g key={n.id} className={`node ${sex}${p.placeholder ? " ph" : ""}${selected === n.id ? " sel" : ""}`}
              tabIndex={0} role="button" aria-label={name}
              onClick={() => onSelect(n.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.id); } }}>
              <rect x={n.x - CARD_W / 2} y={n.y - CARD_H / 2} width={CARD_W} height={CARD_H} rx={10} />
              {lines.map((l) => { const y = ty; ty += 16; return <text key={l + y} className="n" x={n.x} y={y} textAnchor="middle">{l}</text>; })}
              {sub && <text className="s" x={n.x} y={ty} textAnchor="middle">{sub}</text>}
              <line x1={n.x - 64} x2={n.x + 64} y1={n.y + 20} y2={n.y + 20} />
              <text className={`g${g ? "" : " tba"}`} x={n.x} y={n.y + 37} textAnchor="middle">{gothramText(g)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
