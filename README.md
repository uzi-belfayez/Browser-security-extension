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

#### Custom Patterns (Feature 5)
- Two lists in the popup:
  - Plain text patterns (exact match).
  - Regex patterns (regular expressions).
- All matches are replaced with `<CUSTOM_#>`.
- Patterns are stored in `chrome.storage.local` (requires `storage` permission).
- Popup has a "Save patterns" button to persist entries.

### Feature B - Prompt Firewall (planned)
- Local checks against banned intents/keywords before send.

### Feature C - Phishing Radar (planned)
- Gmail sender/body extraction + backend risk banner.

## Getting Started

First, run the development server:

```bash
pnpm dev
# or
npm run dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

You can start editing the popup by modifying `popup.tsx`. It should auto-update as you make changes. To add an options page, simply add a `options.tsx` file to the root of the project, with a react component default exported. Likewise to add a content page, add a `content.ts` file to the root of the project, importing some module and do some logic, then reload the extension on your browser.

For further guidance, [visit our Documentation](https://docs.plasmo.com/)

## Making production build

Run the following:

```bash
pnpm build
# or
npm run build
```

This should create a production bundle for your extension, ready to be zipped and published to the stores.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!
