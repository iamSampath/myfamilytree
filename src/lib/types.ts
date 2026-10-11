export type Sex = "M" | "F" | "";
export type Role = "owner" | "editor" | "viewer";

/** A person in a tree. Relationships are stored as ids on the person. */
export interface Person {
  id: string;
  name: string;
  sex: Sex;
  /** Birth family id (a document in the tree's `families` collection). */
  family: string;
  fatherId: string;
  motherId: string;
  spouseId: string;
  /** Hide the name from view-only members. Display safeguard, not encryption. */
  private: boolean;
  /** Shown with a dashed outline: a known person whose details are missing. */
  placeholder?: boolean;
}

/** A family line: surname plus its gothram, entered once per tree. */
export interface Family {
  id: string;
  surname: string;
  gothram: string;
}

export interface Tree {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}

export interface Member {
  uid: string;
  role: Role;
  name: string;
  email: string;
  joinedAt: number;
  inviteId?: string;
}

export interface Invite {
  id: string;
  treeName: string;
  role: Exclude<Role, "owner">;
  createdBy: string;
  createdAt: number;
  revoked: boolean;
}

export interface HistoryEntry {
  id: string;
  ts: number;
  coll: "people" | "families";
  docId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  label: string;
  by: string;
  byName: string;
}

export type People = Record<string, Person>;
export type Families = Record<string, Family>;
