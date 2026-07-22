# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: card-cart-based-selling-flow.spec.js >> /checkout — cart checkout + picking + receipt >> partial failure: item 2's stock got taken by another session — item 1 still succeeds, is not rolled back
- Location: qa-tests/card-cart-based-selling-flow.spec.js:155:3

# Error details

```
Error: browserType.launch: Failed to launch chromium because executable doesn't exist at /opt/pw-browsers/chromium
```