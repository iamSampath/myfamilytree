"use client";
import { Suspense } from "react";
import { NotConfigured, TopBar } from "@/components/AuthProvider";
import { AuthForm } from "@/components/AuthForm";
import { firebaseConfigured } from "@/lib/firebase";

export default function Page() {
  return (
    <>
      <TopBar />
      <main className="wrap auth-wrap">
        {firebaseConfigured ? <Suspense fallback={<p className="muted">Loading…</p>}><AuthForm mode="signin" /></Suspense> : <NotConfigured />}
      </main>
    </>
  );
}
