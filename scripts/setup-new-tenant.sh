#!/usr/bin/env bash
# ============================================================
# setup-new-tenant.sh — automates the tedious, easy-to-get-wrong parts of
# giving a new customer their own separate Firebase project: creating the
# project, deploying the exact security rules and indexes this app needs
# (the same ones already proven working for Shah Jewellers, copied
# automatically instead of manually re-clicking through Firestore's
# "create index" links one at a time like we did the first time around),
# registering a web app, and printing the connection keys needed for
# firebase-config.js.
#
# HONEST ABOUT WHAT THIS DOES NOT AUTOMATE: creating a brand-new Firebase
# project doesn't come with Firestore/Authentication/Storage switched on
# by default — those need to be enabled once, by hand, in the Firebase
# console, before this script's deploy step will succeed. That's step 2
# in NEW-CUSTOMER-SETUP.md, and this script will tell you clearly if it
# hits that wall.
#
# USAGE:
#   ./scripts/setup-new-tenant.sh <project-id> "<Shop Display Name>"
#
# EXAMPLE:
#   ./scripts/setup-new-tenant.sh patel-jewellers-gharana "Patel Jewellers"
#
# REQUIRES (one-time, on whichever computer runs this):
#   npm install -g firebase-tools
#   firebase login
# ============================================================

set -e

PROJECT_ID="$1"
DISPLAY_NAME="$2"

if [ -z "$PROJECT_ID" ] || [ -z "$DISPLAY_NAME" ]; then
  echo "Usage: ./scripts/setup-new-tenant.sh <project-id> \"<Shop Display Name>\""
  echo "Example: ./scripts/setup-new-tenant.sh patel-jewellers-gharana \"Patel Jewellers\""
  exit 1
fi

echo "============================================================"
echo " Setting up a new tenant: $DISPLAY_NAME"
echo " Project ID: $PROJECT_ID"
echo "============================================================"
echo ""

echo "[1/5] Creating the Firebase project…"
firebase projects:create "$PROJECT_ID" --display-name "$DISPLAY_NAME"

echo ""
echo "[2/5] Setting this as the active project for the remaining steps…"
firebase use "$PROJECT_ID"

echo ""
echo "------------------------------------------------------------"
echo " STOP — before continuing, this project needs three things"
echo " switched on by hand, once, in the Firebase console:"
echo "   https://console.firebase.google.com/project/$PROJECT_ID"
echo "   1. Firestore Database — create it (choose a region close to"
echo "      your customer, production mode)"
echo "   2. Authentication — enable the Email/Password sign-in method"
echo "   3. Storage — create the default bucket"
echo " These three can't be created via this script — Firebase"
echo " requires the first-time setup for each to happen in the"
echo " console. Once you've done this, press Enter to continue."
echo "------------------------------------------------------------"
read -p ""

echo ""
echo "[3/5] Deploying security rules and indexes — the same ones"
echo "      already proven working, not recreated from scratch…"
firebase deploy --only firestore:rules,firestore:indexes,storage --project "$PROJECT_ID"

echo ""
echo "[4/5] Registering a web app in this project…"
firebase apps:create web "$DISPLAY_NAME Gharana" --project "$PROJECT_ID"

echo ""
echo "[5/5] Here are the connection keys for js/firebase-config.js —"
echo "      copy the config block below into a COPY of this codebase"
echo "      for $DISPLAY_NAME (see NEW-CUSTOMER-SETUP.md for the rest):"
echo ""
firebase apps:sdkconfig web --project "$PROJECT_ID"

echo ""
echo "============================================================"
echo " Done with the Firebase side. Remaining manual steps:"
echo "   - Paste the config above into js/firebase-config.js"
echo "   - Deploy this codebase as a NEW, separate Vercel project"
echo "   - Create the first staff login in:"
echo "     https://console.firebase.google.com/project/$PROJECT_ID/authentication/users"
echo "   - Hand over the URL and login — they set up their own Shop"
echo "     Details (name, address, logo) from inside the app themselves"
echo " Full details for all of this: NEW-CUSTOMER-SETUP.md"
echo "============================================================"
