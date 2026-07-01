#!/usr/bin/env bash
# Encodes the Chrome Cookies file from the local browser profile and pushes it
# to the BANNER_PROFILE_B64 GitHub Secret so CI can restore the session.
#
# Run after any local Banner authentication:
#   cd backend && npm run update-banner-secret
set -euo pipefail

COOKIES="$(dirname "$0")/../data/browser-profile/Default/Cookies"

if [ ! -f "$COOKIES" ]; then
  echo "Error: $COOKIES not found."
  echo "Run the scraper locally first: node scrapers/banner_puppeteer_scraper.js"
  exit 1
fi

SIZE=$(wc -c < "$COOKIES")
echo "Cookies file: ${SIZE} bytes"
if [ "$SIZE" -gt 36000 ]; then
  echo "Warning: file exceeds ~36 KB — base64 may exceed GitHub's 48 KB secret limit."
fi

echo "Uploading to GitHub Secret BANNER_PROFILE_B64..."
base64 -i "$COOKIES" | tr -d '\n' | gh secret set BANNER_PROFILE_B64
echo "Done. CI runs will restore this profile for headless auth."
