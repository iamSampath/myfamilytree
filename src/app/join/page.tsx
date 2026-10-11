"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth, NotConfigured, SignInCard, TopBar } from "@/components/AuthProvider";
import { firebaseConfigured } from "@/lib/firebase";
import { acceptInvite, myRole, readInvite } from "@/lib/data";
import { inviteStatus } from "@/lib/privacy";
import type { Invite, Role } from "@/lib/types";

const roleText: Record<Role, string> = { owner: "the Owner", editor: "an Editor", viewer: "a Viewer" };

function Join() {
  const q = useSearchParams();
  const treeId = q.get("tree") || "";
  const inviteId = q.get("invite") || "";
  const { user, loading } = useAuth();
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [existing, setExisting] = useState<Role | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user || !treeId || !inviteId) return;
    myRole(user, treeId).then(setExisting);
    readInvite(treeId, inviteId).then(setInvite).catch(() => setInvite(null));
  }, [user, treeId, inviteId]);

  const accept = async () => {
    if (!user || !invite) return;
    setBusy(true); setErr("");
    try {
      await acceptInvite(user, treeId, invite);
      window.location.href = `/tree?id=${treeId}`;
    } catch {
      setErr("Couldn't join this tree. The invite may have expired or been turned off. Ask for a new link.");
      setBusy(false);
    }
  };

  if (!firebaseConfigured) return <NotConfigured />;
  if (!treeId || !inviteId) return <div className="card"><h2>This invite link is incomplete</h2><p className="muted">Ask the person who shared it to send the full link again.</p></div>;
  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <SignInCard message="You've been invited to a family tree. Sign in to accept." />;
  if (invite === undefined || existing === undefined) return <p className="muted">Checking the invite…</p>;
  // Already a member: never change their role from an invite; just say so and open the tree.
  if (existing) {
    const differs = invite && existing !== "owner" && invite.role !== existing;
    return (
      <div className="card">
        <h3>Already a member</h3>
        <h2>You&apos;re already in {invite?.treeName ?? "this tree"}</h2>
        <p className="muted">You&apos;re {roleText[existing]} of this tree, so you don&apos;t need to join again.</p>
        {differs && <p className="notice">This link is for {roleText[invite!.role]}, but your access stays as {roleText[existing]}. To change it, ask the tree&apos;s owner to update your role in Share.</p>}
        <div className="row"><a href={`/tree?id=${treeId}`}><button className="primary" type="button">Open the tree</button></a></div>
      </div>
    );
  }
  if (!invite || !inviteStatus(invite).active) {
    const expired = invite && !invite.revoked && inviteStatus(invite).label === "Expired";
    return <div className="card"><h2>{expired ? "This invite has expired" : "This invite is no longer active"}</h2><p className="muted">Ask the tree&apos;s owner for a new link.</p></div>;
  }
  return (
    <div className="card">
      <h3>Invitation</h3>
      <h2>Join {invite.treeName}</h2>
      <p className="muted">You&apos;ll join as {invite.role === "editor" ? "an Editor: you can add and change people" : "a Viewer: you can see the tree but not change it"}.</p>
      <div className="row"><button className="primary" type="button" onClick={accept} disabled={busy}>{busy ? "Joining…" : "Join tree"}</button></div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

export default function JoinPage() {
  return (
    <>
      <TopBar />
      <main className="wrap narrow">
      <Suspense fallback={<p className="muted">Loading…</p>}><Join /></Suspense>
    </main>
    </>
  );
}
