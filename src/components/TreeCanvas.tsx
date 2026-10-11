"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CARD_H, CARD_W, layoutTree, wrapName } from "@/lib/layout";
import { displayName, gothramOf, gothramText, maidenLabel } from "@/lib/family";
import type { Families, People } from "@/lib/types";

interface Props { people: People; families: Families; canEdit: boolean; selected: string | null; onSelect: (id: string) => void }

export function TreeCanvas({ people, families, canEdit, selected, onSelect }: Props) {
  const layout = useMemo(() => layoutTree(people), [people]);
  const [zoom, setZoom] = useState(1);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const drag = useRef<{ x: number; y: number; l: number; t: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const clamp = (v: number) => Math.min(2, Math.max(0.25, v));
  const fit = () => {
    const el = box.current;
    if (!el || !layout.width) return;
    setZoom(clamp(Math.min(1, Math.min((el.clientWidth - 8) / layout.width, (el.clientHeight - 8) / layout.height))));
  };
  // On first show: fit the whole family if names stay readable; otherwise open at a
  // readable size, centred horizontally, and let people scroll or tap Fit.
  useEffect(() => {
    const el = box.current;
    if (fitted.current || !layout.width || !el) return;
    fitted.current = true;
    const fitZ = Math.min((el.clientWidth - 8) / layout.width, (el.clientHeight - 8) / layout.height);
    const z = clamp(Math.min(1, Math.max(fitZ, 0.75)));
    setZoom(z);
    requestAnimationFrame(() => { el.scrollLeft = Math.max(0, (layout.width * z - el.clientWidth) / 2); el.scrollTop = 0; });
  });

  // Bring the selected person into view.
  useEffect(() => {
    const el = box.current;
    const n = selected ? layout.nodes.find((x) => x.id === selected) : undefined;
    if (!el || !n) return;
    const left = n.x * zoom - el.clientWidth / 2;
    const top = n.y * zoom - el.clientHeight / 2;
    const off = n.x * zoom < el.scrollLeft || n.x * zoom > el.scrollLeft + el.clientWidth || n.y * zoom < el.scrollTop || n.y * zoom > el.scrollTop + el.clientHeight;
    if (off) el.scrollTo({ left, top, behavior: "smooth" });
  }, [selected, zoom, layout]);

  // Zoom around the visible centre.
  const zoomTo = (v: number) => {
    const el = box.current;
    const nz = clamp(v);
    if (el) {
      const cx = (el.scrollLeft + el.clientWidth / 2) / zoom;
      const cy = (el.scrollTop + el.clientHeight / 2) / zoom;
      requestAnimationFrame(() => { el.scrollLeft = cx * nz - el.clientWidth / 2; el.scrollTop = cy * nz - el.clientHeight / 2; });
    }
    setZoom(nz);
  };

  // Mouse drag to pan (touch already scrolls natively).
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !box.current) return;
    drag.current = { x: e.clientX, y: e.clientY, l: box.current.scrollLeft, t: box.current.scrollTop, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !box.current) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 4) { d.moved = true; setDragging(true); }
    if (d.moved) { box.current.scrollLeft = d.l - dx; box.current.scrollTop = d.t - dy; }
  };
  const endDrag = () => { setTimeout(() => { drag.current = null; }, 0); setDragging(false); };
  const onWheel = (e: React.WheelEvent) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } };

  const matches = q.trim().length < 1 ? [] : Object.values(people)
    .filter((p) => displayName(p, canEdit).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8);
  const pick = (id: string) => { setQ(""); onSelect(id); };

  return (
    <div className="canvas-wrap">
      <div className="canvas-tools">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input id="tree-search" type="search" placeholder="Find a person" aria-label="Find a person" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) pick(matches[0].id); if (e.key === "Escape") setQ(""); }} />
          {matches.length > 0 && (
            <ul className="results">
              {matches.map((m) => <li key={m.id}><button type="button" onClick={() => pick(m.id)}>{displayName(m, canEdit)}</button></li>)}
            </ul>
          )}
          {q.trim() && matches.length === 0 && <ul className="results"><li className="muted" style={{ padding: "8px 10px" }}>No one by that name</li></ul>}
        </div>
        <div className="zoom">
          <button type="button" className="icon" aria-label="Zoom out" onClick={() => zoomTo(zoom / 1.2)}>−</button>
          <button type="button" onClick={fit}>Fit</button>
          <button type="button" className="icon" aria-label="Zoom in" onClick={() => zoomTo(zoom * 1.2)}>+</button>
        </div>
      </div>
      <div className={`canvas${dragging ? " dragging" : ""}`} ref={box}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag} onWheel={onWheel}>
        <svg className="tree" viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width * zoom} height={layout.height * zoom} role="img" aria-label="Family tree">
          {layout.rows.map((r, i) => (
            <g key={r.gen} className="gen-row">
              {i % 2 === 0 && <rect className="gen-band" x={0} y={r.y - CARD_H / 2 - 18} width={layout.width} height={CARD_H + 36} />}
              <text className="gen-label" x={18} y={r.y - 4}>Generation</text>
              <text className="gen-num" x={18} y={r.y + 22}>{r.gen}</text>
            </g>
          ))}
          {layout.edges.map((e, i) => (
            <path key={i} className="edge" d={"M" + e.points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L")} />
          ))}
          {layout.nodes.filter((n) => n.union).map((n) => <circle key={n.id} className="union" cx={n.x} cy={n.y} r={7} />)}
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
                onClick={() => { if (!drag.current?.moved) onSelect(n.id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.id); } }}>
                <rect className="ring" x={n.x - CARD_W / 2 - 4} y={n.y - CARD_H / 2 - 4} width={CARD_W + 8} height={CARD_H + 8} rx={14} />
                <rect className="card-bg" x={n.x - CARD_W / 2} y={n.y - CARD_H / 2} width={CARD_W} height={CARD_H} rx={11} />
                {lines.map((l) => { const y = ty; ty += 17; return <text key={l + y} className="n" x={n.x} y={y} textAnchor="middle">{l}</text>; })}
                {sub && <text className="s" x={n.x} y={ty - 1} textAnchor="middle">{sub}</text>}
                <line x1={n.x - 66} x2={n.x + 66} y1={n.y + 20} y2={n.y + 20} />
                <text className={`g${g ? "" : " tba"}`} x={n.x} y={n.y + 37} textAnchor="middle">{gothramText(g)}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
