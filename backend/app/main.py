from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env", override=False)
load_dotenv(ROOT / "browser_extension" / ".env", override=False)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vamisec")


class PhishingRequest(BaseModel):
    sender_email: str
    sender_name: Optional[str] = None
    receiver_email: Optional[str] = None
    subject: Optional[str] = None
    body_text: str


class PhishingResponse(BaseModel):
    risk: str = Field(pattern="^(green|yellow|red)$")
    score: float = Field(ge=0.0, le=1.0)
    summary: str
    signals: List[str] = []


app = FastAPI(title="VamiGuard Phishing Radar API", version="0.1.0")


def _text(payload: PhishingRequest) -> str:
    parts = [payload.subject or "", payload.body_text or ""]
    return " ".join(parts).lower()


def _heuristic_signals(payload: PhishingRequest) -> List[str]:
    text = _text(payload)
    signals: List[str] = []

    def add_if(pattern: str, label: str) -> None:
        if re.search(pattern, text):
            signals.append(label)

    add_if(r"\b(urgent|asap|immediately|action required|today)\b", "urgent-tone")
    add_if(r"\b(wire|transfer|bank|payment|invoice|gift card|crypto)\b", "financial-request")
    add_if(r"\b(verify|login|password|reset|account|credentials)\b", "credential-harvest")
    add_if(r"\b(click|open|download|attachment|link)\b", "link-request")
    add_if(r"\b(ceo|cfo|president|director)\b", "exec-impersonation")
    add_if(r"\bconfidential\b|\bdo not share\b", "secrecy-pressure")

    sender = (payload.sender_email or "").lower()
    if sender and re.search(r"\b\d{2,}\b", sender):
        signals.append("suspicious-sender")

    return list(dict.fromkeys(signals))


def _score_from_signals(signals: List[str]) -> float:
    score = 0.1 + 0.15 * len(signals)
    return min(score, 0.95)


def _risk_from_score(score: float) -> str:
    if score >= 0.7:
        return "red"
    if score >= 0.35:
        return "yellow"
    return "green"


def _summary(signals: List[str]) -> str:
    if not signals:
        return "No obvious phishing indicators detected."
    return "Signals detected: " + ", ".join(signals[:5]) + "."


def analyze_heuristic(payload: PhishingRequest) -> PhishingResponse:
    signals = _heuristic_signals(payload)
    score = _score_from_signals(signals)
    risk = _risk_from_score(score)
    return PhishingResponse(risk=risk, score=score, summary=_summary(signals), signals=signals)


def _extract_text_from_response(data: dict) -> str:
    if isinstance(data, dict):
        if isinstance(data.get("output_text"), str):
            return data["output_text"]
        output = data.get("output", [])
        for item in output:
            for content in item.get("content", []):
                if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                    return content["text"]
    return ""


def _parse_response(text: str) -> Optional[PhishingResponse]:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        payload = json.loads(match.group(0))
        return PhishingResponse(**payload)
    except Exception:
        return None


async def analyze_openai(payload: PhishingRequest) -> Optional[PhishingResponse]:
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        return None

    model = os.getenv("PHISHING_MODEL", "gpt-4o-mini")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    url = f"{base_url.rstrip('/')}/responses"
    instructions = (
        "You are a phishing risk classifier. Return ONLY JSON with keys: "
        "risk (green|yellow|red), score (0-1), summary (<=200 chars), signals (string list)."
    )

    body = {
        "model": model,
        "input": [
            {"role": "system", "content": instructions},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "sender_email": payload.sender_email,
                        "sender_name": payload.sender_name,
                        "receiver_email": payload.receiver_email,
                        "subject": payload.subject,
                        "body_text": payload.body_text,
                    }
                ),
            },
        ],
    }

    logger.info("OpenAI request payload: %s", json.dumps(body))
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(url, headers={"Authorization": f"Bearer {api_key}"}, json=body)
        response.raise_for_status()
        data = response.json()

    text = _extract_text_from_response(data)
    return _parse_response(text)


async def analyze_gemini(payload: PhishingRequest) -> Optional[PhishingResponse]:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return None

    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    base_url = os.getenv(
        "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"
    )
    url = f"{base_url.rstrip('/')}/models/{model}:generateContent"
    instructions = (
        "You are a phishing risk classifier. Return ONLY JSON with keys: "
        "risk (green|yellow|red), score (0-1), summary (<=200 chars), signals (string list)."
    )
    prompt = json.dumps(
        {
            "sender_email": payload.sender_email,
            "sender_name": payload.sender_name,
            "receiver_email": payload.receiver_email,
            "subject": payload.subject,
            "body_text": payload.body_text,
        }
    )

    body = {
        "contents": [
            {
                "parts": [
                    {"text": instructions},
                    {"text": prompt},
                ]
            }
        ]
    }

    logger.info("Gemini request payload: %s", json.dumps(body))
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(url, params={"key": api_key}, json=body)
        response.raise_for_status()
        data = response.json()

    candidates = data.get("candidates", [])
    if not candidates:
        return None
    parts = candidates[0].get("content", {}).get("parts", [])
    text = parts[0].get("text") if parts else ""
    if not isinstance(text, str):
        return None
    return _parse_response(text)


@app.post("/phishing/analyze", response_model=PhishingResponse)
async def analyze(payload: PhishingRequest) -> PhishingResponse:
    try:
        ai = await analyze_gemini(payload)
        if ai:
            return ai
    except Exception:
        pass
    try:
        ai = await analyze_openai(payload)
        if ai:
            return ai
    except Exception:
        pass
    return analyze_heuristic(payload)


@app.post("/analyze-email", response_model=PhishingResponse)
async def analyze_email(payload: PhishingRequest) -> PhishingResponse:
    return await analyze(payload)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
