# Phase 1 - Scaffold Notes (Plasmo)

## Planned Structure (MVP)
- `src/background/index.ts`
- `src/content/chatgpt.tsx`
- `src/content/gmail.tsx`
- `src/popup/index.tsx`
- `src/shared/types.ts`
- `src/shared/storage.ts`

## Content Scripts
- ChatGPT: inject UI overlay + intercept send.
- Gmail: inject banner into email view.

## Message Passing
- Content -> background: phishing check request
- Background -> content: response with risk

## Storage
- Session map for PII placeholders (per tab)
- Settings: feature toggles + banned list

