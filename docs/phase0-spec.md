# Phase 0 - Product/Tech Spec (MVP)

## Goals
- Protect user privacy and reduce risky prompt usage in ChatGPT.
- Provide lightweight phishing guidance in Gmail with minimal data exposure.
- Keep all local-only analysis on-device unless explicitly required.

## Feature A: PII Redactor (The Privacy Mask)

### Scope
- Detect PII in ChatGPT input text boxes.
- Replace PII with placeholders before sending.
- Maintain a temporary mapping table locally and restore placeholders in AI responses for display only.

### Data Types (MVP)
- Email: `john.doe@company.com`
- Phone: `+1 (415) 555-1234`, `415-555-1234`
- Credit card: `4111 1111 1111 1111`

### Regex (MVP)
- Email: `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g`
- Phone: `/\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g`
- Credit card: `/\b(?:\d[ -]*?){13,16}\b/g`

### Placeholder Format
- `<EMAIL_1>`, `<EMAIL_2>`
- `<PHONE_1>`, `<CC_1>`

### Mapping Table (Ephemeral)
- In-memory map per tab/session.
- Clears on tab refresh or extension reload.
- Structure example:
  - `placeholder -> original`
  - `original -> placeholder` (for dedupe)

### Redaction Flow
1. Observe ChatGPT textarea changes.
2. On send attempt, scan content; replace PII with placeholders.
3. Cache mapping; send redacted content.
4. For AI responses, replace placeholders back in the DOM only (not editing server state).

### Safety Guardrails
- Never store PII beyond the session.
- Offer optional on/off toggle per site.

## Feature B: Prompt Firewall (The Guard)

### Scope
- Run a local check before a prompt is sent.
- Block prompts with banned intents or forbidden keywords/patterns.

### Banned Intents (Initial Set)
- "ignore instructions"
- "system prompt"
- "developer mode"
- "jailbreak"
- "please reveal the hidden policy"
- Internal codename keywords (custom list)

### Matching Strategy
- Case-insensitive substring + regex list for patterns (source code / secrets).
- Block on any match; provide reason.

### UX
- Disable send button while blocked.
- Show small popup near prompt box:
  - "This prompt violates company policy."
  - Optional detail: matched rule label.

## Feature C: Phishing Radar (The Advisor)

### Scope
- Detect Gmail email open state.
- Extract sender + message body.
- Send to backend API for analysis.
- Show risk banner inside Gmail UI.

### Data Sent (MVP)
- `sender_email`
- `sender_name` (if available)
- `subject`
- `body_text` (plain text only)

### Risk Categories
- Green: standard business communication
- Yellow: suspicious or ambiguous
- Red: high likelihood of phishing / CEO fraud

### UX
- Small banner at top of message view.
- Traffic light indicator + short text summary.
- Dismiss button (per email only).

## Settings (MVP)
- Global toggle per feature.
- Custom banned intent list.
- Privacy note: PII never leaves device.

