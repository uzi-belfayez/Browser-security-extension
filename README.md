# VamiGuard Browser Extension

A Plasmo-based browser extension that protects users from accidental data leaks in AI prompts and flags suspicious emails in Gmail and Outlook. Everything runs locally in the browser—no external API calls required for the current features.

## Current Features

### 1) PII Redactor (ChatGPT / Claude / Gemini)
- Detects and redacts sensitive data in prompt text.
- Supported types:
  - Emails
  - Phone numbers
  - Credit cards (Luhn validated)
  - Password values (e.g., `password is ...`)
  - Tokens/keys (common API key patterns, JWT, bearer tokens, etc.)
  - Custom patterns (plain text + regex)
- On‑page controls near the prompt:
  - **Redact PII** button
  - **Restore** button (only if the prompt wasn’t edited after redaction)
  - Chips showing placeholders like `<EMAIL_1>`, `<PHONE_1>`, `<CC_1>`, `<PASSWORD_1>`, `<TOKEN_1>`, `<CUSTOM_1>`

### 2) Phishing Radar (Gmail)
- Local, rule‑based analysis of sender, subject, and body text.
- Signals include urgency, financial requests, credential prompts, link/attachment prompts, exec impersonation, secrecy pressure.
- Trusted lists for sender emails, domains, and employee display names.
- Optional header checks (SPF/DKIM/DMARC) via “Show original” page.
- Renders a banner in Gmail with risk score, summary, signals, and checks.

### 3) Phishing Radar (Outlook)
- Local, rule‑based analysis similar to Gmail.
- Floating widget with:
  - Compact view (score + summary)
  - Expandable details (checks list)
  - Hide button (session-only)

## Popup UI (Extension Panel)
- Two tabs: **PII Redactor** and **Phishing Radar**
- Remembers the last selected tab

**PII Redactor tab**
- Master toggle
- Per‑type toggles (email, phone, credit card, password, token/key, custom patterns)
- Custom patterns (plain text + regex) with Save / Export / Import

**Phishing Radar tab**
- Toggle Gmail radar
- Toggle Outlook radar
- Trusted lists:
  - Trusted sender emails
  - Trusted domains
  - Employee display names
- Import/Export per list + Save

## Project Structure (Key Files)
- `src/contents/chatgpt.tsx` — PII redaction logic + on‑page controls
- `src/contents/gmail.tsx` — Gmail phishing radar
- `src/contents/outlook.tsx` — Outlook phishing radar
- `src/popup/index.tsx` — popup UI (tabs + settings)
- `src/shared/storage.ts` — `chrome.storage.local` persistence
- `src/shared/types.ts` — shared types and settings

## Development

### Requirements
- Node.js 18+
- npm or pnpm
- Chrome or Chromium‑based browser

### Install
```bash
npm install
# or
pnpm install
```

### Run Dev
```bash
npm run dev
# or
pnpm dev
```

### Load Unpacked Extension
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `build/chrome-mv3-dev`

## Notes
- Phone detection supports international formats and common separators.
- Token detection includes common API key patterns and private key blocks.
- The extension does not send email content to external services.
