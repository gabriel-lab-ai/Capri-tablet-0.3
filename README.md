# Capri (desktop companion)

    npm install
    npm start

- She starts as a dormant orb. Click it: she glitches awake with a portrait panel and a terminal chat box.
- Type and press Enter to talk. Esc (or 30s idle) puts her back to sleep.
- To give her a brain: type `/key YOUR_ANTHROPIC_API_KEY` in the chat once (stored locally),
  or set the ANTHROPIC_API_KEY environment variable. Without a key she gives canned replies.
- Drag the orb to move it. Right-click it, or use the tray icon, for the menu:
  Mode (orb / full body), Voice, Size, Start with Windows, Claude Code hooks.
- Tray > "Install Claude Code hooks" makes her react to Claude Code (backs up settings.json first).

## Brain options
- Anthropic key (`sk-ant-...`, paid) or a Google Gemini key (`AIza...`, from Google AI Studio; check their current free limits).
- `/key YOUR_KEY` sets it, `/key clear` removes it. A rejected key is dropped automatically.
- No key: she uses a built-in offline personality (jokes, small talk, remembers your name).
