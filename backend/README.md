# VamiGuard Phishing Radar Backend (FastAPI)

## Setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Setup (uv)
```bash
uv venv
uv pip install -r requirements.txt
```

## Environment
This server reads `.env` from:
- `backend/.env`
- `browser_extension/.env`

Required:
```
OPENAI_API_KEY=...
GEMINI_API_KEY=...
```

Optional:
```
PHISHING_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
GEMINI_MODEL=gemini-1.5-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
```

## Run
```bash
uvicorn app.main:app --reload --port 8000
```

## Endpoint
- `POST /phishing/analyze`
- `POST /analyze-email` (alias for the spec doc)

Body:
```json
{
  "sender_email": "ceo@g0ogle.com",
  "sender_name": "Sundar Pichai",
  "subject": "Urgent wire transfer",
  "body_text": "Please transfer $50,000 today..."
}
```
