This is a [Plasmo extension](https://docs.plasmo.com/) project bootstrapped with [`plasmo init`](https://www.npmjs.com/package/plasmo).

## Current Features (MVP)

### Feature A - PII Redactor (ChatGPT)
- Redact PII in the prompt before sending.
- Supported types: email, phone, credit card (Luhn validated), and password values (e.g. `password is ...`).
- Visible UI next to the prompt:
  - `Redact PII` button: replaces detected items with placeholders like `<EMAIL_1>`, `<PHONE_1>`, `<CC_1>`, `<PASSWORD_1>`, `<CUSTOM_1>`.
  - `Restore` button: restores the original prompt if no edits were made after redaction.
  - Status text + chips list of placeholders used.
- Robust prompt detection for ChatGPT ProseMirror input (`#prompt-textarea`).

#### Custom Patterns
- Two lists in the popup:
  - Plain text patterns (exact match).
  - Regex patterns (regular expressions).
- All matches are replaced with `<CUSTOM_#>`.
- Patterns are stored in `chrome.storage.local` (requires `storage` permission).
- Popup has a "Save patterns" button to persist entries.
- Export/Import patterns as JSON from the popup.
- Popup has Light/Dark/System theme support and a PII Redactor toggle.

### Feature B - Prompt Firewall (planned)
- Local checks against banned intents/keywords before send.

### Feature C - Phishing Radar (planned)
- Gmail sender/body extraction + backend risk banner.

## Install & Run (Local Development)

### Requirements
- Node.js 18+ (recommended)
- npm or pnpm
- Google Chrome (or Chromium-based browser)

### Setup
1) Clone the repo:
```bash
git clone <your-repo-url>
cd browser_extension
```

2) Install dependencies:
```bash
npm install
# or
pnpm install
```

3) Start the dev server (Plasmo):
```bash
npm run dev
# or
pnpm dev
```

### Load the Extension in Chrome
1) Open Chrome and go to `chrome://extensions`.
2) Enable **Developer mode** (top-right).
3) Click **Load unpacked**.
4) Select the folder: `build/chrome-mv3-dev`.
5) The extension will appear in the toolbar. Pin it for easy access.

When you make changes:
- Keep `npm run dev` running.
- Click **Reload** on the extension card in `chrome://extensions`.
- Hard-refresh ChatGPT (Ctrl+Shift+R).

### Usage (Quick Start)
1) Open ChatGPT at `https://chatgpt.com/`.
2) Use the popup to:
   - Toggle PII Redactor on/off.
   - Add custom patterns (plain text + regex).
   - Save / Export / Import patterns.
   - Pick Light/Dark/System theme.
3) In ChatGPT, use the on-page controls:
   - **Redact PII** to replace sensitive items.
   - **Restore** to revert if not edited after redaction.

## Project Structure (Key Files)
- `src/contents/chatgpt.tsx` — PII redaction logic + on-page controls.
- `src/popup/index.tsx` — extension popup UI and settings.
- `src/shared/storage.ts` — settings persistence (`chrome.storage.local`).
- `src/shared/types.ts` — shared settings types.

## Notes
- Credit cards are validated with Luhn to reduce false positives.
- Phone detection supports international formats with spaces and separators.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!
