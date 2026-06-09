const vscode = require('vscode');
const path = require('path');
const { renderMarkdown, extractToc, escapeHtml } = require('./markdownRenderer');
const { VersionManager } = require('./versionManager');

/**
 * Manages the webview panel that renders SKILL.md content
 * with a TOC sidebar, version history, and edit capabilities.
 */
class SkillWebviewPanel {
  static _currentPanel = undefined;
  static _viewType = 'antigravitySkillView';

  /**
   * Show or update the skill webview panel.
   * @param {vscode.ExtensionContext} context
   * @param {import('./skillScanner').SkillData} skillData
   * @param {import('./skillScanner').PluginData} pluginData
   * @param {Function} [onEditCallback] - Called when user clicks Edit
   */
  static async show(context, skillData, pluginData, onEditCallback) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel already exists, update it
    if (SkillWebviewPanel._currentPanel) {
      SkillWebviewPanel._currentPanel._panel.reveal(column);
      await SkillWebviewPanel._currentPanel._update(skillData, pluginData, context, onEditCallback);
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

    SkillWebviewPanel._currentPanel = new SkillWebviewPanel(panel, context, skillData, pluginData, onEditCallback);
  }

  constructor(panel, context, skillData, pluginData, onEditCallback) {
    this._panel = panel;
    this._context = context;
    this._skillData = skillData;
    this._pluginData = pluginData;
    this._onEditCallback = onEditCallback;
    this._disposables = [];

    this._init(skillData, pluginData, context, onEditCallback);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'edit':
            if (this._onEditCallback) {
              this._onEditCallback(this._skillData, this._pluginData);
            }
            break;
          case 'delete':
            vscode.commands.executeCommand('antigravity.deleteSkill', { skillData: this._skillData, pluginData: this._pluginData });
            break;
          case 'viewVersion':
            await this._handleViewVersion(message.version);
            break;
          case 'restoreVersion':
            await this._handleRestoreVersion(message.version);
            break;
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
  }

  async _init(skillData, pluginData, context, onEditCallback) {
    await this._update(skillData, pluginData, context, onEditCallback);
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
   * Handle viewing a specific version.
   */
  async _handleViewVersion(versionNumber) {
    try {
      const content = await VersionManager.getVersionContent(this._skillData.filePath, versionNumber);
      // Open in a new untitled editor for viewing
      const doc = await vscode.workspace.openTextDocument({
        content,
        language: 'markdown'
      });
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to load version ${versionNumber}: ${err.message}`);
    }
  }

  /**
   * Handle restoring a version.
   */
  async _handleRestoreVersion(versionNumber) {
    const confirm = await vscode.window.showWarningMessage(
      `Restore version ${versionNumber}? The current content will be archived first.`,
      { modal: true },
      'Restore'
    );

    if (confirm !== 'Restore') return;

    try {
      await VersionManager.restoreVersion(this._skillData.filePath, versionNumber);
      vscode.window.showInformationMessage(`Version ${versionNumber} restored successfully.`);

      // Re-read the file and update the panel
      const fs = require('fs');
      const newContent = await fs.promises.readFile(this._skillData.filePath, 'utf-8');
      const { SkillScanner } = require('./skillScanner');
      const scanner = new SkillScanner();
      const updatedSkillData = {
        ...this._skillData,
        rawContent: newContent,
        body: newContent // Will be re-parsed
      };
      // Re-parse frontmatter
      const parsed = scanner._parseFrontmatter(newContent);
      updatedSkillData.body = parsed.body;
      if (parsed.frontmatter) {
        updatedSkillData.name = parsed.frontmatter.name || updatedSkillData.name;
        updatedSkillData.description = parsed.frontmatter.description || '';
      }

      this._skillData = updatedSkillData;
      await this._update(updatedSkillData, this._pluginData, this._context, this._onEditCallback);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to restore version: ${err.message}`);
    }
  }

  /**
   * Update the webview content with the given skill data.
   */
  async _update(skillData, pluginData, context, onEditCallback) {
    this._skillData = skillData;
    this._pluginData = pluginData;
    this._onEditCallback = onEditCallback;
    this._panel.title = `${skillData.displayName} — Skill`;
    this._panel.webview.html = await this._getHtml(skillData, pluginData, context);
  }

  /**
   * Generate the full HTML for the webview.
   */
  async _getHtml(skillData, pluginData, context) {
    const cssUri = this._panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, 'media', 'webview.css'))
    );

    const markdownBody = skillData.body || skillData.rawContent || '';
    const renderedBody = renderMarkdown(markdownBody);
    const tocEntries = extractToc(markdownBody);
    const nonce = this._getNonce();

    // Get version history
    let versions = [];
    let versionCount = 0;
    try {
      versions = await VersionManager.getVersions(skillData.filePath);
      versionCount = versions.length;
    } catch {
      // No versions yet
    }

    const tocHtml = this._buildTocHtml(tocEntries);
    const versionHtml = this._buildVersionHistoryHtml(versions);

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
  <title>${escapeHtml(skillData.displayName)}</title>
</head>
<body>
  <div class="skill-container ${tocEntries.length > 0 ? 'has-toc' : ''}">
    <!-- Animated background orbs -->
    <div class="bg-orb bg-orb-1"></div>
    <div class="bg-orb bg-orb-2"></div>
    <div class="bg-orb bg-orb-3"></div>

    ${tocEntries.length > 0 ? `
    <!-- Table of Contents Sidebar -->
    <nav class="toc-sidebar" id="toc-sidebar">
      <div class="toc-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        Table of Contents
      </div>
      <ul class="toc-list">
        ${tocHtml}
      </ul>
    </nav>
    ` : ''}

    <div class="skill-main-column">
      <!-- Header Card -->
      <header class="skill-header">
      <div class="header-top-row">
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

        <div class="header-actions">
          <button class="action-btn edit-btn" id="btn-edit" title="Edit this skill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>

          <button class="action-btn delete-btn" id="btn-delete" title="Delete this skill" style="background: rgba(239, 68, 68, 0.1); color: #fca5a5; border-color: rgba(239, 68, 68, 0.2);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Delete
          </button>

          ${versionCount > 0 ? `
          <button class="action-btn version-btn" id="btn-versions" title="View version history">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            ${versionCount} version${versionCount !== 1 ? 's' : ''}
          </button>
          ` : ''}
        </div>
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

    ${versionCount > 0 ? `
    <!-- Version History Panel (hidden by default) -->
    <div class="version-panel" id="version-panel" style="display: none;">
      <div class="version-panel-header">
        <h3 class="version-panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Version History
        </h3>
        <button class="version-close-btn" id="btn-close-versions">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="version-list">
        ${versionHtml}
      </div>
    </div>
    ` : ''}

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
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      // ── Edit & Delete buttons ──────────────────────────────
      const editBtn = document.getElementById('btn-edit');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          vscode.postMessage({ command: 'edit' });
        });
      }

      const deleteBtn = document.getElementById('btn-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          vscode.postMessage({ command: 'delete' });
        });
      }

      // ── Version history toggle ───────────────────────────
      const versionsBtn = document.getElementById('btn-versions');
      const versionPanel = document.getElementById('version-panel');
      const closeVersionsBtn = document.getElementById('btn-close-versions');

      if (versionsBtn && versionPanel) {
        versionsBtn.addEventListener('click', () => {
          const isVisible = versionPanel.style.display !== 'none';
          versionPanel.style.display = isVisible ? 'none' : 'block';
          versionsBtn.classList.toggle('active', !isVisible);
        });
      }

      if (closeVersionsBtn && versionPanel) {
        closeVersionsBtn.addEventListener('click', () => {
          versionPanel.style.display = 'none';
          if (versionsBtn) versionsBtn.classList.remove('active');
        });
      }

      // ── Version action buttons ───────────────────────────
      document.querySelectorAll('.version-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const ver = parseInt(btn.dataset.version, 10);
          vscode.postMessage({ command: 'viewVersion', version: ver });
        });
      });

      document.querySelectorAll('.version-restore-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const ver = parseInt(btn.dataset.version, 10);
          vscode.postMessage({ command: 'restoreVersion', version: ver });
        });
      });

      // ── TOC smooth scrolling + active tracking ───────────
      const tocLinks = document.querySelectorAll('.toc-link');

      tocLinks.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const targetId = link.getAttribute('href').slice(1);
          const target = document.getElementById(targetId);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Update active state
            tocLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
          }
        });
      });

      // Active section tracking on scroll
      const headings = document.querySelectorAll('.skill-content h1[id], .skill-content h2[id], .skill-content h3[id], .skill-content h4[id], .skill-content h5[id], .skill-content h6[id]');

      if (headings.length > 0 && tocLinks.length > 0) {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const id = entry.target.id;
              tocLinks.forEach(link => {
                link.classList.toggle('active', link.getAttribute('href') === '#' + id);
              });
            }
          });
        }, { rootMargin: '-20% 0px -70% 0px' });

        headings.forEach(h => observer.observe(h));
      }
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Build TOC list HTML from entries.
   */
  _buildTocHtml(entries) {
    return entries.map(entry => {
      const indent = entry.depth > 0 ? ` style="padding-left: ${entry.depth * 16}px"` : '';
      return `<li class="toc-item toc-depth-${entry.depth}"${indent}>
        <a href="#${entry.id}" class="toc-link" title="${escapeHtml(entry.text)}">
          <span class="toc-index">${entry.index}</span>
          <span class="toc-text">${escapeHtml(entry.text)}</span>
        </a>
      </li>`;
    }).join('\n');
  }

  /**
   * Build version history HTML.
   */
  _buildVersionHistoryHtml(versions) {
    if (versions.length === 0) {
      return '<div class="version-empty">No previous versions found.</div>';
    }

    return versions.map(v => {
      const date = new Date(v.timestamp);
      const formattedDate = date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
      const formattedTime = date.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      });

      return `<div class="version-item">
        <div class="version-info">
          <span class="version-number">v${v.version}</span>
          <span class="version-date">${formattedDate} at ${formattedTime}</span>
          <span class="version-desc">${escapeHtml(v.description || '')}</span>
        </div>
        <div class="version-actions">
          <button class="version-view-btn" data-version="${v.version}" title="View this version">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            View
          </button>
          <button class="version-restore-btn" data-version="${v.version}" title="Restore this version">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
            Restore
          </button>
        </div>
      </div>`;
    }).join('\n');
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
