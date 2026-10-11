/** Sign-in helpers. Pure functions, no Firebase, so they can be unit-tested. */

/** Plain-language message for a Firebase Auth error code. */
export function authErrorMessage(code: string | undefined, mode: "signin" | "signup" | "reset"): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match an account. Check them, or use “Forgot password?”. If you signed up with Google, use the Google button.";
    case "auth/email-already-in-use":
      return "There's already an account with this email. Sign in instead. If you first joined with Google, use “Continue with Google”.";
    case "auth/account-exists-with-different-credential":
      return "This email already has an account with a different sign-in method. Try the other option on this page.";
    case "auth/invalid-email":
      return "That doesn't look like an email address.";
    case "auth/weak-password":
      return "Choose a stronger password: at least 8 characters.";
    case "auth/missing-password":
      return "Enter your password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "No connection. Check your internet and try again.";
    case "auth/operation-not-allowed":
      return "Email sign-in isn't turned on for this app yet. Use Google for now, or ask the site owner.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google window. Allow pop-ups for this site and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    default:
      return mode === "reset" ? "Couldn't send the reset email. Try again." : mode === "signup" ? "Couldn't create the account. Try again." : "Couldn't sign in. Try again.";
  }
}

/** Only allow returning to a page on this site (prevents redirecting people elsewhere). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

/** Simple sign-up checks before contacting the server. */
export function signupProblems(name: string, email: string, password: string): string[] {
  const out: string[] = [];
  if (!name.trim()) out.push("Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) out.push("Enter a valid email address.");
  if (password.length < 8) out.push("Password needs at least 8 characters.");
  return out;
}
