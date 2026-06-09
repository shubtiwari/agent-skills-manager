const vscode = require('vscode');
const { SkillScanner } = require('./skillScanner');
const { SkillsTreeProvider } = require('./skillsTreeProvider');
const { SkillWebviewPanel } = require('./skillWebviewPanel');

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
        SkillWebviewPanel.show(context, skillData, pluginData);
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
