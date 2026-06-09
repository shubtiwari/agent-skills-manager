const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Guided flow for creating new SKILL.md files.
 * Uses VS Code QuickPick and InputBox APIs for a step-by-step wizard.
 */
class SkillCreator {
  /**
   * Run the create-skill wizard.
   * @param {import('./skillScanner').SkillScanner} scanner
   * @param {Function} onCreatedCallback - Called after successful creation to refresh views
   */
  static async create(scanner, onCreatedCallback) {
    const pluginsDir = scanner.pluginsDir;

    // ── Step 1: Pick or create a plugin ──────────────────────

    const existingPlugins = await SkillCreator._getExistingPlugins(pluginsDir);

    const pluginItems = [
      {
        label: '$(add) Create New Plugin',
        description: 'Create a new plugin directory',
        isNew: true
      },
      ...existingPlugins.map(p => ({
        label: p.displayName,
        description: p.path,
        detail: `${p.skillCount} existing skill(s)`,
        pluginPath: p.path,
        pluginDirName: p.dirName,
        isNew: false
      }))
    ];

    const selectedPlugin = await vscode.window.showQuickPick(pluginItems, {
      title: 'Create New Skill — Step 1/3',
      placeHolder: 'Select a plugin to add the skill to, or create a new one',
      matchOnDescription: true
    });

    if (!selectedPlugin) return; // User cancelled

    let pluginPath;
    let pluginDirName;

    if (selectedPlugin.isNew) {
      const newPluginName = await vscode.window.showInputBox({
        title: 'Create New Skill — Step 1/3 (New Plugin)',
        prompt: 'Enter the plugin directory name',
        placeHolder: 'e.g., my-custom-plugin',
        validateInput: (value) => {
          if (!value || !value.trim()) return 'Plugin name is required';
          if (!/^[a-z0-9-]+$/.test(value.trim())) return 'Use lowercase letters, numbers, and hyphens only';
          const targetPath = path.join(pluginsDir, value.trim());
          if (fs.existsSync(targetPath)) return 'A plugin with this name already exists';
          return null;
        }
      });

      if (!newPluginName) return;

      pluginDirName = newPluginName.trim();
      pluginPath = path.join(pluginsDir, pluginDirName);
    } else {
      pluginPath = selectedPlugin.pluginPath;
      pluginDirName = selectedPlugin.pluginDirName;
    }

    // ── Step 2: Enter skill name ─────────────────────────────

    const skillName = await vscode.window.showInputBox({
      title: 'Create New Skill — Step 2/3',
      prompt: 'Enter the skill name',
      placeHolder: 'e.g., my-awesome-skill',
      validateInput: (value) => {
        if (!value || !value.trim()) return 'Skill name is required';
        if (!/^[a-z0-9-]+$/.test(value.trim())) return 'Use lowercase letters, numbers, and hyphens only';
        const skillDir = path.join(pluginPath, 'skills', value.trim());
        if (fs.existsSync(skillDir)) return 'A skill with this name already exists in this plugin';
        return null;
      }
    });

    if (!skillName) return;

    // ── Step 3: Enter skill description ──────────────────────

    const skillDescription = await vscode.window.showInputBox({
      title: 'Create New Skill — Step 3/3',
      prompt: 'Enter a brief description for the skill',
      placeHolder: 'e.g., Helps with debugging Chrome DevTools issues'
    });

    if (skillDescription === undefined) return; // User cancelled (empty is fine)

    // ── Create the skill ─────────────────────────────────────

    try {
      const skillDir = path.join(pluginPath, 'skills', skillName.trim());
      await fs.promises.mkdir(skillDir, { recursive: true });

      // Also create plugin.json if this is a new plugin
      if (selectedPlugin.isNew) {
        const pluginJsonPath = path.join(pluginPath, 'plugin.json');
        if (!fs.existsSync(pluginJsonPath)) {
          const pluginJson = {
            name: pluginDirName,
            version: '1.0.0',
            description: `Plugin: ${SkillCreator._formatName(pluginDirName)}`
          };
          await fs.promises.writeFile(pluginJsonPath, JSON.stringify(pluginJson, null, 2), 'utf-8');
        }
      }

      // Generate SKILL.md template
      const skillContent = SkillCreator._generateTemplate(skillName.trim(), skillDescription || '');
      const skillFilePath = path.join(skillDir, 'SKILL.md');
      await fs.promises.writeFile(skillFilePath, skillContent, 'utf-8');

      // Show success and open the file
      vscode.window.showInformationMessage(`Skill "${skillName}" created successfully!`);

      // Refresh tree
      if (onCreatedCallback) {
        onCreatedCallback();
      }

      // Open the new file in the editor
      const doc = await vscode.workspace.openTextDocument(skillFilePath);
      await vscode.window.showTextDocument(doc);

    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create skill: ${err.message}`);
    }
  }

  /**
   * Get existing plugin directories with their skill counts.
   */
  static async _getExistingPlugins(pluginsDir) {
    if (!fs.existsSync(pluginsDir)) {
      return [];
    }

    const entries = await fs.promises.readdir(pluginsDir, { withFileTypes: true });
    const plugins = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const pluginPath = path.join(pluginsDir, entry.name);
      const skillsDir = path.join(pluginPath, 'skills');
      let skillCount = 0;

      if (fs.existsSync(skillsDir)) {
        const skillEntries = await fs.promises.readdir(skillsDir, { withFileTypes: true });
        skillCount = skillEntries.filter(e => e.isDirectory() && !e.name.startsWith('.')).length;
      }

      plugins.push({
        dirName: entry.name,
        displayName: SkillCreator._formatName(entry.name),
        path: pluginPath,
        skillCount
      });
    }

    return plugins.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /**
   * Generate SKILL.md template content.
   */
  static _generateTemplate(name, description) {
    const displayName = SkillCreator._formatName(name);

    return `---
name: ${name}
description: ${description || `${displayName} skill`}
---

# ${displayName}

${description || 'Add your skill description here.'}

## When to Use

Describe when this skill should be triggered.

## Instructions

Add detailed instructions for the AI agent here.

### Step 1

Describe the first step.

### Step 2

Describe the second step.

## Examples

Provide usage examples here.

## References

- Add relevant documentation links
`;
  }

  /**
   * Format a kebab-case name into a display name.
   */
  static _formatName(name) {
    return name
      .replace(/-plugin$/, '')
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}

module.exports = { SkillCreator };
