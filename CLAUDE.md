# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run the app in development (Electron)
npm run dist       # Build distributable (portable + NSIS installer for Windows x64)
npm run create-icon  # Regenerate the app icon via create-icon.js
```

## Architecture

This is a minimal Electron app with no build pipeline or frontend framework — no webpack, no TypeScript, no React.

**Three source files:**

- `main.js` — Electron main process. Creates the `BrowserWindow`, hides the menu bar, and handles the `focus-window` IPC event (brings window to front when alarm fires).
- `preload.js` — Context bridge. Exposes `window.electronAPI.focusWindow()` to the renderer, keeping `nodeIntegration` disabled.
- `pomodoro.html` — The entire UI and app logic in one self-contained file: CSS, HTML, and a `<script>` block. No external JS files.

**Renderer logic (inside `pomodoro.html`):**

- Timer state (`workDur`, `breakDur`, `secondsLeft`, `isRunning`, `isWorkMode`) is plain JS variables.
- The canvas (`#ringCanvas`) renders the animated background and progress ring. `drawFrame()` runs via `requestAnimationFrame` continuously; `tick` drives all animations.
- `drawWork()` renders a steampunk/clockwork scene (gears, steam, furnace glow). `drawBreak()` renders a forest scene (fireflies, spores, stars).
- Sound is synthesized entirely via the Web Audio API (`AudioContext`) — no audio files. Six named sounds (`beep`, `alarm`, `pulse`, `chime`, `bells`, `ding`) are defined in `playSound()`.
- Settings (work/break durations, alarm sounds) live only in memory — they reset on reload.

**Electron builder config** is in `package.json` under the `"build"` key. Output targets: portable `.exe` and NSIS installer, both x64.
