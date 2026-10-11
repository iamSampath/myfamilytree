import { describe, it, expect } from "vitest";
import example from "../../data/example-family.json";
import {
  birthGothramOf, childrenOf, displayName, gothramOf, maidenLabel, makeId, spouseOf, validatePerson,
} from "@/lib/family";
import { computeGenerations, layoutTree, wrapName, unionKey, CARD_W } from "@/lib/layout";
import { exportTree, parseTreeFile } from "@/lib/portable";
import type { Families, People, Person } from "@/lib/types";

const people: People = Object.fromEntries((example.people as Person[]).map((p) => [p.id, p]));
const families: Families = Object.fromEntries(example.families.map((f) => [f.id, f]));
const P = (id: string) => people[id];

describe("gothram rules", () => {
  it("men take their birth family's gothram", () => {
    expect(gothramOf(P("ravi"), people, families)).toBe("Kashyapa");
    expect(gothramOf(P("anil"), people, families)).toBe("Kashyapa");
  });
  it("a married woman takes her husband's gothram and keeps her birth gothram", () => {
    expect(gothramOf(P("lata"), people, families)).toBe("Kashyapa");
    expect(birthGothramOf(P("lata"), people, families)).toBe("Bharadvaja");
  });
  it("an unmarried daughter takes her father's line", () => {
    expect(gothramOf(P("kavya"), people, families)).toBe("Kashyapa");
    expect(birthGothramOf(P("kavya"), people, families)).toBeNull();
  });
  it("an unknown family gothram returns empty (shown as 'To be added')", () => {
    const fams = { ...families, rao: { ...families.rao, gothram: "" } };
    expect(gothramOf(P("lata"), people, fams)).toBe("");
  });
  it("a one-sided spouse link is not a marriage", () => {
    const ppl: People = { ...people, lata: { ...P("lata"), spouseId: "" } };
    expect(spouseOf(ppl.ravi, ppl)).toBeNull();
    expect(gothramOf(ppl.lata, ppl, families)).toBe("Bharadvaja");
  });
});

describe("names", () => {
  it("adds née for married women whose name lacks their birth surname", () => {
    expect(maidenLabel(P("lata"), people, families)).toBe("née Reddy");
    expect(maidenLabel(P("kavya"), people, families)).toBe("");
  });
  it("hides private names from view-only members", () => {
    expect(displayName(P("kavya"), false)).toBe("Private");
    expect(displayName(P("kavya"), true)).toBe("Kavya Rao");
  });
  it("makes unique ids", () => {
    expect(makeId("Ravi Rao", people)).toBe("ravi-rao");
    expect(makeId("Ravi", people)).toBe("ravi-2");
  });
  it("wraps long names into two balanced lines", () => {
    expect(wrapName("Hanumantha Rao Medarametla")).toEqual(["Hanumantha Rao", "Medarametla"]);
    expect(wrapName("Short Name")).toEqual(["Short Name"]);
  });
});

describe("validation", () => {
  it("rejects a person who would be their own ancestor", () => {
    const edited = { ...P("ravi"), fatherId: "anil" };
    expect(validatePerson(edited, people)).toContain("These parents would make this person their own ancestor.");
  });
  it("rejects linking to self and same father/mother", () => {
    expect(validatePerson({ ...P("anil"), spouseId: "anil" }, people)).toContain("A person can't be linked to themselves.");
    expect(validatePerson({ ...P("anil"), motherId: "ravi" }, people)).toContain("Father and mother must be different people.");
  });
  it("accepts valid data", () => {
    for (const p of Object.values(people)) expect(validatePerson(p, people)).toEqual([]);
  });
  it("finds children", () => {
    expect(childrenOf("ravi", people).map((c) => c.id).sort()).toEqual(["anil", "kavya"]);
  });
});

describe("layout", () => {
  it("places parents above children and joins couples at a union", () => {
    const l = layoutTree(people);
    const y = (id: string) => l.nodes.find((n) => n.id === id)!.y;
    expect(y("ravi")).toBeLessThan(y("anil"));
    expect(l.nodes.some((n) => n.id === unionKey("ravi", "lata"))).toBe(true);
    expect(l.edges.some((e) => e.from === unionKey("ravi", "lata") && e.to === "anil")).toBe(true);
  });
});

describe("import/export", () => {
  it("round-trips", () => {
    const out = exportTree("X", people, families);
    const r = parseTreeFile(JSON.stringify(out));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.people).toHaveLength(4);
  });
  it("reports broken links instead of importing them", () => {
    const bad = { ...example, people: [{ ...example.people[2], fatherId: "nobody" }] };
    const r = parseTreeFile(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/nobody/);
  });
  it("rejects non-JSON", () => {
    expect(parseTreeFile("not json").ok).toBe(false);
  });
});

describe("generations and spouse placement", () => {
  it("numbers generations from the oldest, spouses share a row", () => {
    const g = computeGenerations(people);
    expect(g.ravi).toBe(1);
    expect(g.lata).toBe(1);
    expect(g.anil).toBe(2);
  });
  it("a married-in spouse takes their partner's generation", () => {
    const ppl: People = { ...people,
      anil: { ...P("anil"), spouseId: "meena" },
      meena: { id: "meena", name: "Meena Rao", sex: "F", family: "", fatherId: "", motherId: "", spouseId: "anil", private: false },
    };
    expect(computeGenerations(ppl).meena).toBe(2);
    const l = layoutTree(ppl);
    const n = (id: string) => l.nodes.find((x) => x.id === id)!;
    expect(n("meena").y).toBe(n("anil").y);
  });
  it("puts spouses right next to each other, husband on the left", () => {
    const l = layoutTree(people);
    const n = (id: string) => l.nodes.find((x) => x.id === id)!;
    expect(n("ravi").y).toBe(n("lata").y);
    expect(n("lata").x - n("ravi").x).toBe(CARD_W + 36);
    const dot = n(unionKey("ravi", "lata"));
    expect(dot.x).toBeGreaterThan(n("ravi").x);
    expect(dot.x).toBeLessThan(n("lata").x);
  });
  it("labels one row per generation", () => {
    expect(layoutTree(people).rows.map((r) => r.gen)).toEqual([1, 2]);
  });
});

