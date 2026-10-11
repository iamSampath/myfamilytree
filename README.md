# My Family Tree

A web app for building family trees together. It works out each person's **gothram** automatically:

- A gothram is inherited through the father's line, so each family's gothram is entered **once**.
- A **married woman takes her husband's gothram**. Her birth gothram is kept and shown on her details.
- "née Surname" is shown automatically for married women.

Built with Next.js (static export), Firebase Authentication (Google sign-in) and Cloud Firestore.

## Features (Phase 1)

- Sign in with Google; create any number of trees.
- Tree laid out automatically (dagre): couples meet at a marigold dot, children hang below.
- Add / edit / delete people; quick **Add child / spouse / parent** from any person.
- Spouse links kept two-way; checks that block impossible data (own ancestor, self-links).
- **Families & gothrams** panel: set a family's gothram once, everyone updates.
- **Edit history** with **Undo** for every change (written in the same batch as the change).
- **Sharing**: owner creates Editor or Viewer **invite links**; joining requires sign-in. Owner can change roles, remove people and turn links off.
- **Private** flag hides a name from Viewers (a display safeguard, see Limits).
- **Import / export** the whole tree as a JSON file (`myfamilytree/v1`, example in `data/example-family.json`).

## Setup

You need Node.js 20+ and a Google account.

1. **Create a Firebase project** at https://console.firebase.google.com.
2. **Authentication → Sign-in method → enable Google.**
3. **Firestore Database → Create database** (production mode; pick a region near your family).
4. **Project settings → Your apps → add a Web app**, then copy its config values.
5. In this folder:
   ```bash
   npm install
   cp .env.example .env.local      # paste the config values in
   npx firebase login
   npx firebase use --add          # choose your project
   npx firebase deploy --only firestore:rules
   npm run dev                     # http://localhost:3000
   ```

### Deploy

**Vercel:** import the GitHub repo, add the six `NEXT_PUBLIC_FIREBASE_*` variables in Project → Settings → Environment Variables, deploy. Then in Firebase → Authentication → Settings → **Authorized domains**, add your Vercel domain (and your custom domain if you add one).

**Or Firebase Hosting:** `npm run build && npx firebase deploy --only hosting`.

## Data model (Firestore)

```
users/{uid}/trees/{treeId}          the user's own list of trees
trees/{treeId}                      { name, ownerId, createdAt }
trees/{treeId}/members/{uid}        { role: owner | editor | viewer, name, email, ... }
trees/{treeId}/invites/{inviteId}   { role: editor | viewer, treeName, revoked, ... }
trees/{treeId}/people/{personId}    { name, sex, family, fatherId, motherId, spouseId, private, placeholder? }
trees/{treeId}/families/{familyId}  { surname, gothram }
trees/{treeId}/history/{entryId}    append-only change log
```

Access is enforced in `firestore.rules`: only members read a tree, only owners/editors change it, invites can't grant more than their role, history can't be rewritten.

## Tests

```bash
npm test            # family rules, layout, import/export (vitest)
npm run test:rules  # security rules against the Firestore emulator (needs Java 11+)
```

## Limits / next steps

- **Private names are hidden in the app only.** Viewers' browsers still receive the data. True privacy needs a server-side split (Phase 2).
- Google sign-in only for now; email-link sign-in is a small addition.
- Deleting a whole tree isn't in the UI yet.
- Phase 2 ideas: GEDCOM export, dates and places, photos, search, real privacy for living people.

## Your own family data

Real family files are ignored by git (`data/*.json` except the fictional example). Import yours from the app's **Import / export** panel instead of committing it.
