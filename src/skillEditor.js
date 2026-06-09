const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { VersionManager } = require('./versionManager');
const { escapeHtml } = require('./markdownRenderer');

/**
 * Manages a webview panel for editing SKILL.md files.
 * Provides structured form fields for frontmatter and a
 * textarea for the markdown body.
 */
class SkillEditorPanel {
  static _currentPanel = undefined;
  static _viewType = 'antigravitySkillEditor';

  /**
   * Open the editor panel for a given skill.
   * @param {vscode.ExtensionContext} context
   * @param {import('./skillScanner').SkillData} skillData
   * @param {import('./skillScanner').PluginData} pluginData
   * @param {Function} onSaveCallback - Called after a successful save to refresh views
   */
  static show(context, skillData, pluginData, onSaveCallback) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SkillEditorPanel._currentPanel) {
      SkillEditorPanel._currentPanel._panel.reveal(column);
      SkillEditorPanel._currentPanel._update(skillData, pluginData, context, onSaveCallback);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      SkillEditorPanel._viewType,
      `Edit: ${skillData.displayName}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'media'))
        ],
        retainContextWhenHidden: true
      }
    );

    SkillEditorPanel._currentPanel = new SkillEditorPanel(panel, context, skillData, pluginData, onSaveCallback);
  }

  constructor(panel, context, skillData, pluginData, onSaveCallback) {
    this._panel = panel;
    this._disposables = [];
    this._onSaveCallback = onSaveCallback;

    this._update(skillData, pluginData, context, onSaveCallback);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'save':
            await this._handleSave(message, skillData);
            break;
          case 'cancel':
            this._panel.dispose();
            break;
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
  }

  _dispose() {
    SkillEditorPanel._currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }

  /**
   * Handle save message from webview.
   */
  async _handleSave(message, originalSkillData) {
    const { name, description, body } = message.data;

    try {
      // Create version backup of the current file before saving
      if (fs.existsSync(originalSkillData.filePath)) {
        await VersionManager.createVersion(
          originalSkillData.filePath,
          `Before edit: ${new Date().toLocaleString()}`
        );
      }

      // Reconstruct the SKILL.md content
      const newContent = this._buildSkillContent(name, description, body);

      // Write to disk
      await fs.promises.writeFile(originalSkillData.filePath, newContent, 'utf-8');

      // Notify success
      this._panel.webview.postMessage({ command: 'saveSuccess' });
      vscode.window.showInformationMessage(`Skill "${name}" saved successfully. Previous version archived.`);

      // Trigger tree refresh
      if (this._onSaveCallback) {
        this._onSaveCallback();
      }

      // Close the editor
      this._panel.dispose();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to save skill: ${err.message}`);
      this._panel.webview.postMessage({ command: 'saveError', error: err.message });
    }
  }

  /**
   * Build SKILL.md content from structured fields.
   */
  _buildSkillContent(name, description, body) {
    let content = '---\n';
    content += `name: ${name}\n`;
    if (description) {
      // Use multi-line YAML if description is long
      if (description.length > 80 || description.includes('\n')) {
        content += `description: >\n`;
        const lines = description.split('\n');
        for (const line of lines) {
          content += `  ${line.trim()}\n`;
        }
      } else {
        content += `description: ${description}\n`;
      }
    }
    content += '---\n';
    content += body;
    return content;
  }

  _update(skillData, pluginData, context, onSaveCallback) {
    this._panel.title = `Edit: ${skillData.displayName}`;
    this._onSaveCallback = onSaveCallback;
    this._panel.webview.html = this._getHtml(skillData, pluginData, context);
  }

  _getHtml(skillData, pluginData, context) {
    const cssUri = this._panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, 'media', 'webview.css'))
    );

    const nonce = this._getNonce();

    // Prepare values for the form
    const nameVal = escapeHtml(skillData.name || '');
    const descVal = escapeHtml(skillData.description || '');
    // Escape the body for textarea (no HTML escaping needed inside textarea, but escape backticks for JS)
    const bodyVal = (skillData.body || skillData.rawContent || '')
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" 
        content="default-src 'none'; 
               style-src ${this._panel.webview.cspSource} 'nonce-${nonce}'; 
               script-src 'nonce-${nonce}';
               font-src https://fonts.gstatic.com; 
               img-src ${this._panel.webview.cspSource} https: data:;">
  <link href="${cssUri}" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <title>Edit Skill</title>
</head>
<body>
  <div class="skill-container">
    <div class="bg-orb bg-orb-1"></div>
    <div class="bg-orb bg-orb-2"></div>

    <!-- Editor Header -->
    <header class="skill-header editor-header">
      <div class="breadcrumb">
        <span class="breadcrumb-plugin">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Editing Skill
        </span>
        <span class="breadcrumb-separator">›</span>
        <span class="breadcrumb-skill">${escapeHtml(pluginData.displayName)} / ${escapeHtml(skillData.displayName)}</span>
      </div>

      <h1 class="skill-title">Edit Skill</h1>
      <p class="skill-description">Modify the skill's metadata and content below. Saving will automatically archive the current version.</p>
    </header>

    <!-- Editor Form -->
    <main class="skill-content editor-form">
      <div class="editor-field">
        <label class="editor-label" for="skill-name">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          Skill Name
        </label>
        <input type="text" id="skill-name" class="editor-input" value="${nameVal}" placeholder="e.g. chrome-devtools" />
      </div>

      <div class="editor-field">
        <label class="editor-label" for="skill-description">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          Description
        </label>
        <textarea id="skill-description" class="editor-textarea editor-textarea-sm" rows="3" placeholder="Brief description of what the skill does...">${descVal}</textarea>
      </div>

      <div class="editor-field">
        <label class="editor-label" for="skill-body">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Markdown Body
        </label>
        <textarea id="skill-body" class="editor-textarea editor-textarea-lg" rows="20" placeholder="Write the skill instructions in Markdown..."></textarea>
      </div>

      <div class="editor-actions">
        <button class="editor-btn editor-btn-secondary" id="btn-cancel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Cancel
        </button>
        <button class="editor-btn editor-btn-primary" id="btn-save">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save Skill
        </button>
      </div>
    </main>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      const bodyTextarea = document.getElementById('skill-body');

      // Set body value via JS to avoid HTML escaping issues
      bodyTextarea.value = \`${bodyVal}\`;

      // Save handler
      document.getElementById('btn-save').addEventListener('click', () => {
        const name = document.getElementById('skill-name').value.trim();
        const description = document.getElementById('skill-description').value.trim();
        const body = bodyTextarea.value;

        if (!name) {
          alert('Skill name is required.');
          return;
        }

        const saveBtn = document.getElementById('btn-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        vscode.postMessage({
          command: 'save',
          data: { name, description, body }
        });
      });

      // Cancel handler
      document.getElementById('btn-cancel').addEventListener('click', () => {
        vscode.postMessage({ command: 'cancel' });
      });

      // Handle messages from extension
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.command === 'saveError') {
          const saveBtn = document.getElementById('btn-save');
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Skill';
        }
      });

      // Tab key support in textarea
      bodyTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = bodyTextarea.selectionStart;
          const end = bodyTextarea.selectionEnd;
          bodyTextarea.value = bodyTextarea.value.substring(0, start) + '  ' + bodyTextarea.value.substring(end);
          bodyTextarea.selectionStart = bodyTextarea.selectionEnd = start + 2;
        }
      });
    })();
  </script>
</body>
</html>`;
  }

  _getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}

module.exports = { SkillEditorPanel };
