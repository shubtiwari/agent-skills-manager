const vscode = require('vscode');
const { SkillScanner } = require('./skillScanner');
const { SkillsTreeProvider } = require('./skillsTreeProvider');
const { SkillWebviewPanel } = require('./skillWebviewPanel');
const { SkillEditorPanel } = require('./skillEditor');
const { SkillCreator } = require('./skillCreator');

/**
 * Output channel for extension logging.
 * @type {vscode.OutputChannel}
 */
let outputChannel;

/**
 * Called when the extension is activated.
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  outputChannel = vscode.window.createOutputChannel('Antigravity Skills');
  outputChannel.appendLine('Antigravity Skills Viewer activating...');

  const scanner = new SkillScanner();
  outputChannel.appendLine(`Scanning plugins at: ${scanner.pluginsDir}`);

  const treeProvider = new SkillsTreeProvider(scanner);

  // Register the tree view
  const treeView = vscode.window.createTreeView('antigravitySkillsTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(treeView);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.refreshSkills', async () => {
      await treeProvider.refresh();
      vscode.window.showInformationMessage('Antigravity Skills refreshed');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.viewSkill', (skillData, pluginData) => {
      if (skillData && pluginData) {
        SkillWebviewPanel.show(context, skillData, pluginData, (skillToEdit, pluginToEdit) => {
          vscode.commands.executeCommand('antigravity.editSkill', { skillData: skillToEdit, pluginData: pluginToEdit });
        });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.createSkill', async () => {
      await SkillCreator.create(scanner, async () => {
        await treeProvider.refresh();
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.editSkill', (treeItem) => {
      if (treeItem && treeItem.skillData && treeItem.pluginData) {
        SkillEditorPanel.show(context, treeItem.skillData, treeItem.pluginData, async () => {
          await treeProvider.refresh();
          // Update the open webview panel with the latest data if it's open
          vscode.commands.executeCommand('antigravity.viewSkill', treeItem.skillData, treeItem.pluginData);
        });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.deleteSkill', async (payload) => {
      const skillData = payload.skillData;
      if (skillData && skillData.filePath) {
        const confirm = await vscode.window.showWarningMessage(
          `Are you sure you want to delete the skill "${skillData.displayName}"? This action cannot be undone.`,
          { modal: true },
          'Delete'
        );
        
        if (confirm === 'Delete') {
          try {
            const fs = require('fs');
            const path = require('path');
            const skillDir = path.dirname(skillData.filePath);
            await fs.promises.rm(skillDir, { recursive: true, force: true });
            
            vscode.window.showInformationMessage(`Skill "${skillData.displayName}" deleted successfully.`);
            await treeProvider.refresh();
            
            if (SkillWebviewPanel._currentPanel && SkillWebviewPanel._currentPanel._skillData.filePath === skillData.filePath) {
              SkillWebviewPanel._currentPanel._dispose();
            }
          } catch (err) {
            vscode.window.showErrorMessage(`Failed to delete skill: ${err.message}`);
          }
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.openSkillFile', (treeItem) => {
      if (treeItem && treeItem.skillData) {
        const uri = vscode.Uri.file(treeItem.skillData.filePath);
        vscode.window.showTextDocument(uri);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.showSidebar', () => {
      vscode.commands.executeCommand('antigravitySkillsTree.focus');
    })
  );

  // Watch for filesystem changes in the plugins directory
  const pluginsDir = scanner.pluginsDir;
  try {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(pluginsDir), '**/*.md')
    );
    watcher.onDidChange(() => treeProvider.refresh());
    watcher.onDidCreate(() => treeProvider.refresh());
    watcher.onDidDelete(() => treeProvider.refresh());
    context.subscriptions.push(watcher);
  } catch (err) {
    outputChannel.appendLine(`File watcher setup failed: ${err.message}`);
  }

  // Initial scan
  try {
    await treeProvider.refresh();
    outputChannel.appendLine('Initial scan complete');
  } catch (err) {
    outputChannel.appendLine(`Initial scan failed: ${err.message}`);
  }

  outputChannel.appendLine('Antigravity Skills Viewer activated successfully');
}

/**
 * Called when the extension is deactivated.
 */
function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
}

module.exports = { activate, deactivate };
