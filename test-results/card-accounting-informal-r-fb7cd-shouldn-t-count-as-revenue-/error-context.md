# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: card-accounting-informal-report.spec.js >> Sales report (/admin/reports) — Informal Report scope >> the query excludes item_status=not_found (bug fix — restored stock shouldn't count as revenue)
- Location: qa-tests/card-accounting-informal-report.spec.js:83:3

# Error details

```
Error: browserType.launch: Failed to launch chromium because executable doesn't exist at /opt/pw-browsers/chromium
```