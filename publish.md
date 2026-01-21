# Chrome Web Store Publishing Guide

## 1) Prepare your release build
1) Make sure your working tree is clean (optional but recommended).
2) Build the extension:
   - `npm run build`
3) Package the extension:
   - `npm run package`
4) Find the generated zip:
   - Plasmo typically writes a zip under `build/` (look for something like `build/chrome-mv3-prod.zip`).

## 2) Create a Chrome Web Store developer account
1) Go to https://chrome.google.com/webstore/devconsole
2) Sign in with the Google account you will use for publishing.
3) Pay the one-time developer registration fee (if you have not already).

## 3) Create a new item
1) In the Developer Dashboard, click "New item".
2) Upload the zip from step 1.

## 4) Fill out the listing
1) Store listing:
   - Name, short description, full description
   - Category, language
2) Images:
   - Icon: 128x128 (required) + any additional sizes used in the manifest
   - Screenshots: at least 1 (1280x800 recommended)
   - Promo images (optional but helpful)
3) Privacy:
   - Provide a privacy policy URL
   - Data usage disclosure (be precise):
     - Reads page content on `chatgpt.com` and `mail.google.com`
     - Stores settings and trusted lists in `chrome.storage.local`
     - No remote API calls (background API functionality removed)
4) Permissions justification:
   - `storage`: saves settings + trusted lists
   - `host_permissions`: `chatgpt.com` for PII redaction UI, `mail.google.com` for phishing radar

## 5) Upload and verify
1) Click "Save draft".
2) Review any validation errors or warnings.
3) Fix issues and re-upload if needed.

## 6) Submit for review
1) Click "Submit for review".
2) The review can take from hours to several days.
3) You will get email updates from the Web Store team.

## 7) Post-submission checklist
- Be ready to answer any review questions about permissions or data use.
- If rejected, read the report carefully and address each point.
