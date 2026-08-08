# Setting up Gharana for a new customer

This is the full process for giving a new jeweller their own, completely
separate copy of this app — their own login, their own database, their own
photo storage, none of it shared with Shah Jewellers or with any other
customer.

**Time estimate:** first time, roughly 60–90 minutes while you're learning
the flow. After you've done it two or three times, more like 25–40 minutes.

---

## Before you start (only ever needed once, on whichever computer does this)

1. Install the Firebase command-line tool:
   ```
   npm install -g firebase-tools
   ```
2. Log in with the Google account that manages your Firebase projects:
   ```
   firebase login
   ```
   This opens a browser window to approve access — do it once, it stays
   logged in after that.

You only do this section once, ever — not once per customer.

---

## Per new customer

### Step 1 — Pick a project ID and run the setup script

Decide on a short, unique ID for this customer (lowercase, no spaces —
e.g. `patel-jewellers-gharana`), then run:

```
./scripts/setup-new-tenant.sh patel-jewellers-gharana "Patel Jewellers"
```

This automates the tedious, easy-to-get-wrong parts:
- Creating the new Firebase project
- Deploying the exact security rules and indexes this app needs — the
  same ones already proven working, not recreated by hand
- Registering a web app in that project
- Printing the connection keys you'll need in Step 3

**The script will pause partway through** and ask you to switch on three
things by hand in the Firebase console (this is the one part that can't be
scripted — Firebase requires it):

1. **Firestore Database** — click "Create database," choose a region close
   to your customer (for India, `asia-south1` is a good default), start in
   production mode
2. **Authentication** — go to the Sign-in method tab, enable
   **Email/Password**
3. **Storage** — click "Get started," accept the default settings

Once those three are switched on, go back to the terminal and press Enter
— the script picks up automatically from there.

### Step 2 — Copy the codebase and paste in the new config

1. Make a fresh copy of this entire project folder for the new customer
   (don't reuse the same folder you deploy for Shah Jewellers)
2. Open `js/firebase-config.js` in that copy
3. Replace the existing config block with the one the script printed at
   the end of Step 1

### Step 3 — Deploy as a separate Vercel project

Deploy that copied folder as a **brand-new Vercel project** — not an
update to the existing Shah Jewellers deployment. This gives the new
customer their own web address (e.g. `patel-jewellers.vercel.app`).

### Step 4 — Create their first login

In the Firebase console for the new project
(`https://console.firebase.google.com/project/<their-project-id>/authentication/users`),
click "Add user" and create the first email + password for their staff to
log in with. Add a second one here too if they have more than one person
who'll use it, same as Shah Jewellers has two.

### Step 5 — Hand it over

Give them their URL and login. From here, **they set themselves up** —
nothing left for you to configure:

- They log in and go to **Profile → Shop Details** to enter their own
  shop name, address, phone, and logo
- Everything else (customers, loans, reports) starts completely empty,
  ready for them to use

---

## Troubleshooting

**"Error: Failed to create Google Cloud project"** — usually means the
project ID you picked is already taken globally (Firebase project IDs
must be unique across *all* Firebase users worldwide, not just your own
account). Try a more specific ID and run the script again.

**The rules/indexes deploy step fails** — almost always means one of the
three console steps (Firestore, Authentication, or Storage) wasn't
actually switched on yet, or is still finishing setup. Wait a minute and
re-run just that step:
```
firebase deploy --only firestore:rules,firestore:indexes,storage --project <their-project-id>
```

**You need to re-print the config keys later** (e.g. you lost them):
```
firebase apps:sdkconfig web --project <their-project-id>
```

**Indexes still show "Building" in the console after deploying** — this is
normal and matches what happened the first time for Shah Jewellers too.
They finish on their own, usually within a few minutes, sometimes longer
for the first deploy on a brand-new project. The app works fine while
they're building; queries that need a still-building index will just show
an error until it finishes.
