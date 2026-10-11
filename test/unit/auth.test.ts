import { describe, it, expect } from "vitest";
import { authErrorMessage, safeNext, signupProblems } from "@/lib/authHelpers";

describe("sign-in helpers", () => {
  it("only returns to pages on this site", () => {
    expect(safeNext("/join?tree=t&invite=i")).toBe("/join?tree=t&invite=i");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
  it("explains common errors plainly", () => {
    expect(authErrorMessage("auth/email-already-in-use", "signup")).toMatch(/already an account/);
    expect(authErrorMessage("auth/invalid-credential", "signin")).toMatch(/don't match/);
    expect(authErrorMessage("auth/popup-closed-by-user", "signin")).toBe("");
    expect(authErrorMessage("something/else", "signup")).toMatch(/Couldn't create/);
  });
  it("checks sign-up fields", () => {
    expect(signupProblems("", "x", "short")).toHaveLength(3);
    expect(signupProblems("Ravi", "ravi@example.com", "longenough")).toEqual([]);
  });
});
