# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.ts >> Login page >> sends the right credentials and shows the success toast
- Location: playwright/login.spec.ts:44:7

# Error details

```
Error: browserType.launch: Executable doesn't exist at /ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
╔════════════════════════════════════════════════════════╗
║ Looks like Playwright was just updated to 1.60.0.      ║
║ Please update docker image as well.                    ║
║ -  current: mcr.microsoft.com/playwright:v1.49.0-jammy ║
║ - required: mcr.microsoft.com/playwright:v1.60.0-jammy ║
║                                                        ║
║ <3 Playwright Team                                     ║
╚════════════════════════════════════════════════════════╝
```