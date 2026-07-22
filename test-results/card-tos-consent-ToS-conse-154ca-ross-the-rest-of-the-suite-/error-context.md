# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: card-tos-consent.spec.js >> ToS consent gate >> already-accepted shop never sees the gate (default mock across the rest of the suite)
- Location: qa-tests/card-tos-consent.spec.js:76:3

# Error details

```
Error: browserType.launch: Failed to launch chromium because executable doesn't exist at /opt/pw-browsers/chromium
```