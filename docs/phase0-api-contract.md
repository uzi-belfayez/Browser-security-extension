# Phase 0 - Phishing API Contract (FastAPI)

## Endpoint
- POST `/analyze-email`

## Request (JSON)
```
{
  "sender_email": "ceo@g0ogle.com",
  "sender_name": "Sundar Pichai",
  "subject": "Urgent wire transfer",
  "body_text": "Please transfer $50,000 today..."
}
```

## Response (JSON)
```
{
  "risk": "red",
  "score": 0.91,
  "summary": "High likelihood of CEO fraud. Sender domain appears spoofed.",
  "signals": [
    "spoofed-domain",
    "urgent-financial-request"
  ]
}
```

## Notes
- `score` is 0.0 to 1.0.
- `risk` must be one of: `green`, `yellow`, `red`.
- Return `summary` under 200 chars.

