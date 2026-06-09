# Antigravity Skills Viewer

Browse and view the **SKILL.md** files used by Antigravity directly from your VS Code sidebar.

## Features

- 🔍 **Auto-discovers** all SKILL.md files from `~/.gemini/config/plugins`
- 📂 **Tree view** in the Activity Bar, grouped by plugin
- 📖 **Beautiful rendering** of skill markdown with dark-themed glassmorphism UI
- 🔄 **Auto-refresh** when skill files change on disk
- 📝 **Open raw file** to edit SKILL.md directly in the editor

## Usage

1. Click the **Antigravity Skills** icon in the Activity Bar (left sidebar)
2. Expand a plugin to see its skills
3. Click any skill to view its rendered content
4. Right-click a skill to open the raw SKILL.md file

## Commands

| Command | Description |
|---------|-------------|
| `Antigravity: Refresh Skills` | Re-scan for SKILL.md files |
| `Antigravity: Open Raw Skill File` | Open the SKILL.md in the editor |

## Requirements

- Antigravity plugins installed at `~/.gemini/config/plugins`
- VS Code 1.85.0 or later

## Development

```bash
# Install dependencies
npm install

# Run in Extension Development Host
# Press F5 in VS Code
```
