const vscode = require('vscode');
const path = require('path');
const { renderMarkdown, escapeHtml } = require('./markdownRenderer');

/**
 * Manages the webview panel that renders SKILL.md content
 * with beautiful dark-themed styling.
 */
class SkillWebviewPanel {
  static _currentPanel = undefined;
  static _viewType = 'antigravitySkillView';

  /**
   * Show or update the skill webview panel.
   * @param {vscode.ExtensionContext} context
   * @param {import('./skillScanner').SkillData} skillData
   * @param {import('./skillScanner').PluginData} pluginData
   */
  static show(context, skillData, pluginData) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel already exists, update it
    if (SkillWebviewPanel._currentPanel) {
      SkillWebviewPanel._currentPanel._panel.reveal(column);
      SkillWebviewPanel._currentPanel._update(skillData, pluginData, context);
      return;
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      SkillWebviewPanel._viewType,
      `${skillData.displayName} — Skill`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'media'))
        ],
        retainContextWhenHidden: true
      }
    );

    SkillWebviewPanel._currentPanel = new SkillWebviewPanel(panel, context, skillData, pluginData);
  }

  constructor(panel, context, skillData, pluginData) {
    this._panel = panel;
    this._disposables = [];

    this._update(skillData, pluginData, context);

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
  }

  _dispose() {
    SkillWebviewPanel._currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }

  /**
   * Update the webview content with the given skill data.
   */
  _update(skillData, pluginData, context) {
    this._panel.title = `${skillData.displayName} — Skill`;
    this._panel.webview.html = this._getHtml(skillData, pluginData, context);
  }

  /**
   * Generate the full HTML for the webview.
   */
  _getHtml(skillData, pluginData, context) {
    const cssUri = this._panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, 'media', 'webview.css'))
    );

    const renderedBody = renderMarkdown(skillData.body || skillData.rawContent || '');
    const nonce = this._getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" 
        content="default-src 'none'; 
               style-src ${this._panel.webview.cspSource} 'nonce-${nonce}'; 
               font-src https://fonts.gstatic.com; 
               img-src ${this._panel.webview.cspSource} https: data:;">
  <link href="${cssUri}" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <title>${escapeHtml(skillData.displayName)}</title>
</head>
<body>
  <div class="skill-container">
    <!-- Animated background orbs -->
    <div class="bg-orb bg-orb-1"></div>
    <div class="bg-orb bg-orb-2"></div>
    <div class="bg-orb bg-orb-3"></div>

    <!-- Header Card -->
    <header class="skill-header">
      <div class="breadcrumb">
        <span class="breadcrumb-plugin">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          ${escapeHtml(pluginData.displayName)}
        </span>
        <span class="breadcrumb-separator">›</span>
        <span class="breadcrumb-skill">${escapeHtml(skillData.displayName)}</span>
      </div>

      <h1 class="skill-title">${escapeHtml(skillData.displayName)}</h1>
      
      ${skillData.description ? `
      <p class="skill-description">${escapeHtml(skillData.description)}</p>
      ` : ''}

      <div class="skill-meta">
        ${pluginData.version ? `
        <span class="meta-badge version-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          v${escapeHtml(pluginData.version)}
        </span>` : ''}
        <span class="meta-badge plugin-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          ${escapeHtml(pluginData.name)}
        </span>
        <span class="meta-badge file-badge" title="${escapeHtml(skillData.filePath)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          SKILL.md
        </span>
      </div>
    </header>

    <!-- Content -->
    <main class="skill-content">
      ${renderedBody}
    </main>

    <!-- Footer -->
    <footer class="skill-footer">
      <div class="footer-path" title="${escapeHtml(skillData.filePath)}">
        📁 ${escapeHtml(skillData.filePath)}
      </div>
    </footer>
  </div>
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

module.exports = { SkillWebviewPanel };
