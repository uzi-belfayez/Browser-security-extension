# Edge Publishing

## 1) Create a Microsoft Partner Center account
1) Go to https://partner.microsoft.com/dashboard
2) Sign in with a Microsoft account.
3) Enroll in the Microsoft Edge Add-ons program (one-time registration).

## 2) Package the extension
1) Build the extension:
   - `npm run build`
2) Package the extension:
   - `npm run package`
3) Use the generated zip in `build/` (same package as Chrome).

## 3) Create a new submission
1) In Partner Center -> Edge Add-ons, click "New extension".
2) Upload the zip package.

## 4) Fill out the listing
1) Store listing:
   - Name, short description, full description
   - Category, language
2) Images:
   - Icon: 128x128 (required) + any additional sizes used in the manifest
   - Screenshots: at least 1 (1280x800 recommended)
3) Privacy:
   - Provide a privacy policy URL
   - Data usage disclosure (be precise):
     - Reads page content on `chatgpt.com` and `mail.google.com`
     - Stores settings and trusted lists in `chrome.storage.local`
     - No remote API calls (background API functionality removed)
4) Permissions justification:
   - `storage`: saves settings + trusted lists
   - `host_permissions`: `chatgpt.com` for PII redaction UI, `mail.google.com` for phishing radar

## 5) Submit for review
1) Review any validation warnings.
2) Fix issues and re-upload if needed.
3) Submit for review.

## 6) After approval
- You will get a public Edge store link.
- Publish updates via new submissions.

## Code changes
- Usually none. Edge supports Chrome MV3 extensions.
- Only update if you rely on Chrome-only APIs (not expected here).
