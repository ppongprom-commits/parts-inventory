# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: card-concurrent-session-jwt-invalidation.spec.js >> Heartbeat-based eviction detection (fixes silent JWT-still-valid bug) >> when the session row disappears (evicted by another device), the next heartbeat signs the user out with a clear message
- Location: qa-tests/card-concurrent-session-jwt-invalidation.spec.js:33:3

# Error details

```
Error: browserType.launch: Failed to launch chromium because executable doesn't exist at /opt/pw-browsers/chromium
```