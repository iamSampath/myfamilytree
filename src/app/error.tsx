"use client";
import { useEffect } from "react";

/** Shown instead of a blank screen if something unexpected breaks on a page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="wrap narrow">
      <div className="card">
        <h2>Something went wrong</h2>
        <p className="muted">The page hit an unexpected problem. Your family tree is safe; nothing was lost. Try again, or reload the page.</p>
        <div className="row">
          <button className="primary" type="button" onClick={reset}>Try again</button>
          <button type="button" onClick={() => window.location.reload()}>Reload page</button>
          <a href="/">Go to your trees</a>
        </div>
      </div>
    </main>
  );
}
