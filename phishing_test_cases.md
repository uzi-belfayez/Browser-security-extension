# Phishing Radar Test Cases

## Setup (once)
1) Load the extension in Chrome and open https://mail.google.com/.
2) Open the extension popup and enable Phishing Radar.
3) Populate the Trusted List in the popup:
   - Trusted sender emails:
     - ceo@company.com
     - finance@company.com
   - Trusted domains:
     - company.com
     - partner.org
   - Employee display names:
     - Jane Doe
     - John Smith
4) Click "Save trusted list".

## Test Case 1 — Safe/trusted sender
Goal: "Trusted sender" and "Trusted domain" checks pass.
1) Send yourself an email from ceo@company.com with subject:
   - Monthly update
2) Body:
   - Just a status update. No action required.
3) Open the message.
Expected:
- Risk: green
- Checks: Trusted sender/pass, Trusted domain/pass, Content signals/pass.

## Test Case 2 — Trusted domain but not sender
Goal: "Trusted domain" pass, "Trusted sender" fail.
1) Send from hr@company.com.
2) Body: Welcome to the team!
Expected:
- Trusted domain: pass
- Trusted sender: fail
- Overall risk likely green or yellow depending on keywords.

## Test Case 3 — Look-alike domain detection
Goal: "Look-alike domain" fail.
1) Send from ceo@companv.com (letter "v" instead of "y").
2) Body: Please review the attached policy update.
Expected:
- Look-alike domain: fail
- Trusted sender/domain: fail
- Risk should increase (yellow/red).

## Test Case 4 — Display-name spoof
Goal: "Display-name spoof" fail.
1) Send from alerts@randommail.net but set display name to "Jane Doe".
2) Body: Please review this ASAP.
Expected:
- Display-name spoof: fail
- Trusted sender/domain: fail
- Risk should increase.

## Test Case 5 — Keyword signals
Goal: Each keyword cluster adds signals. Send emails with these subjects/bodies (one at a time):

A) Urgent tone
- Subject: URGENT: action required today
- Body: Please respond ASAP.
Expected: urgent-tone

B) Financial request
- Body: Please wire transfer $5,000 today.
Expected: financial-request

C) Credential harvest
- Body: Verify your account and reset password.
Expected: credential-harvest

D) Link request
- Body: Open the attachment or click the link.
Expected: link-request

E) Executive impersonation
- Body: This is the CEO requesting a quick favor.
Expected: exec-impersonation

F) Secrecy pressure
- Body: This is confidential, do not share.
Expected: secrecy-pressure

## Test Case 6 — Header checks (SPF/DKIM/DMARC)
Goal: "Headers" check updates after you click "Check headers".
1) Open any email in Gmail.
2) Click "Check headers" in the banner.
3) A new "show original" tab opens; after it loads, the banner should update on the original email.
Expected:
- Headers check shows spf=... | dkim=... | dmarc=... with pass/fail.

## Test Case 7 — Dismissed message doesn’t reappear
Goal: Dismiss fingerprints are respected.
1) Open an email that shows the banner.
2) Click "Check headers" or dismiss (if you re-add the button later).
If you keep "dismiss" removed, skip this test.

## Test Case 8 — Settings toggle
Goal: Turning radar off removes the banner.
1) In popup, disable "Phishing Radar".
2) Reload Gmail or open a new email.
Expected:
- Banner disappears and does not re-render.
