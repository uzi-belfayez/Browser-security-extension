Phishing detection can be improved while staying extension-only. High-impact upgrades:

1) Look-alike domain detection (stronger)
   - Use a better similarity check (Levenshtein + homograph mapping).
   - Flag domains with swapped characters (e.g., rn -> m), or unicode look-alikes.

2) Display-name spoofing (stricter)
   - Detect if display name matches a trusted employee but sender domain isn't trusted.
   - Add extra weight if subject/body includes "urgent" plus a name match.

3) Domain age / reputation (optional, offline)
   - Use a local cache of known internal domains.
   - If external domain isn't on allowlist and has no prior trust, increase risk.

4) Attachment / link signals
   - Flag messages that contain file-type keywords or suspicious link text in the body preview.
   - Even without full HTML parsing, catch common "invoice.pdf" or "verify account" patterns.

5) Thread context
   - If the subject starts with "Re:" but the sender is not in the thread's known participants, raise risk.

6) Scoring model tuning
   - Adjust weights and thresholds for your environment (less noisy, more accurate).

---

Already implemented (current extension-only features):

- Keyword/intent signals: urgent tone, financial request, credential harvest, link/attachment prompts,
  exec impersonation, secrecy pressure.
- Trusted allowlist checks: trusted sender emails, trusted domains, trusted employee display names.
- Look-alike domain detection using Levenshtein distance.
- Display-name spoof detection (trusted name + untrusted domain).
- SPF/DKIM/DMARC extraction from "Show original" and risk scoring for non-pass results.
- Local scoring + risk levels: green < 0.35, yellow 0.35–0.69, red >= 0.7.
