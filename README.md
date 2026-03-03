# FNF Rhythm Game

A Friday Night Funkin' style rhythm game built with HTML5 Canvas.

## How to Play

### Option 1: Using a Local Server (Recommended)

1. **Using Python:**
   ```bash
   python -m http.server 3000
   ```
   Then open http://localhost:3000 in your browser

2. **Using Node.js:**
   ```bash
   npx serve .
   ```
   Then open the URL shown in the terminal

3. **Using PowerShell (Windows):**
   ```powershell
   powershell -ExecutionPolicy Bypass -File serve.ps1
   ```
   Then open http://localhost:3000

### Option 2: Open Directly (Limited Features)
- Simply double-click `index.html` to open in your browser
- Note: Chart data is embedded, but some browser features may be limited

## Game Controls

- **Arrow Keys** or **A/S/W/D**: Hit notes
  - A / Left Arrow: Left lane
  - S / Down Arrow: Down lane
  - W / Up Arrow: Up lane
  - D / Right Arrow: Right lane

- **Escape**: Pause menu
- **B**: Toggle bot mode (on/off)
- **7**: Toggle chart editor (in-game)

## Game Modes

- **Bot Mode**: Auto-plays all notes perfectly
- **Practice**: Can't die, loops forever
- **Easy**: Fewer notes, slower speed
- **Normal**: Standard gameplay
- **Hard**: Fast and challenging

You can combine Bot with any difficulty!

## Features

- ✅ 5 songs with unique charts
- ✅ Bot mode toggle
- ✅ Hold notes
- ✅ Splash effects on perfect hits
- ✅ Unique hit sounds per lane
- ✅ Chart editor (press 7 in-game)
- ✅ Instant looping (notes restart immediately)
- ✅ Pause menu with difficulty switching

## Audio Files

The game supports multiple audio formats: **.ogg**, **.mp3**, **.wav**, and **.m4a**

Place your song files in `assets/songs/` with these names:
- `tutorial` (+ extension)
- `bopeebo` (+ extension)
- `fresh` (+ extension)
- `dadbattle` (+ extension)
- `south` (+ extension)

The game will automatically detect which format you're using!

## Files Included

- `index.html` - Main game page
- `src/` - All game code
- `assets/charts/` - Song chart data (embedded in code)
- `assets/songs/` - Place audio files here

## Credits

Built with Claude Code 🤖
