const vscode = require('vscode');
const path = require('path');

/**
 * Provides tree data for the Antigravity Skills sidebar.
 * Two-level tree: Plugin → Skills
 */
class SkillsTreeProvider {
  constructor(scanner) {
    this._scanner = scanner;
    this._plugins = [];
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  /**
   * Refresh the tree by re-scanning plugins.
   */
  async refresh() {
    this._plugins = await this._scanner.scan();
    this._onDidChangeTreeData.fire();
  }

  /**
   * @param {SkillTreeItem} element
   * @returns {vscode.TreeItem}
   */
  getTreeItem(element) {
    return element;
  }

  /**
   * @param {SkillTreeItem|undefined} element
   * @returns {Promise<SkillTreeItem[]>}
   */
  async getChildren(element) {
    if (!element) {
      // Root level — return plugins
      if (this._plugins.length === 0) {
        await this.refresh();
      }
      return this._plugins.map(plugin => new PluginTreeItem(plugin));
    }

    if (element instanceof PluginTreeItem) {
      // Plugin level — return skills
      return element.pluginData.skills.map(skill => new SkillTreeItem(skill, element.pluginData));
    }

    return [];
  }
}

/**
 * Tree item representing a plugin (collapsible parent).
 */
class PluginTreeItem extends vscode.TreeItem {
  constructor(pluginData) {
    super(pluginData.displayName, vscode.TreeItemCollapsibleState.Expanded);

    this.pluginData = pluginData;
    this.contextValue = 'plugin';
    this.tooltip = this._buildTooltip(pluginData);
    this.description = pluginData.version ? `v${pluginData.version}` : `${pluginData.skills.length} skills`;
    this.iconPath = new vscode.ThemeIcon('extensions', new vscode.ThemeColor('charts.purple'));
  }

  _buildTooltip(plugin) {
    let tip = plugin.displayName;
    if (plugin.version) {
      tip += ` v${plugin.version}`;
    }
    if (plugin.description) {
      tip += `\n${plugin.description}`;
    }
    tip += `\n${plugin.skills.length} skill(s)`;
    return tip;
  }
}

/**
 * Tree item representing a skill (leaf node).
 */
class SkillTreeItem extends vscode.TreeItem {
  constructor(skillData, pluginData) {
    super(skillData.displayName, vscode.TreeItemCollapsibleState.None);

    this.skillData = skillData;
    this.pluginData = pluginData;
    this.contextValue = 'skill';
    this.tooltip = skillData.description || skillData.name;
    this.description = this._truncateDescription(skillData.description);
    this.iconPath = new vscode.ThemeIcon('book', new vscode.ThemeColor('charts.blue'));

    // Click to view the skill
    this.command = {
      command: 'antigravity.viewSkill',
      title: 'View Skill',
      arguments: [skillData, pluginData]
    };
  }

  _truncateDescription(desc) {
    if (!desc) return '';
    const maxLen = 60;
    if (desc.length <= maxLen) return desc;
    return desc.substring(0, maxLen) + '…';
  }
}

module.exports = { SkillsTreeProvider, PluginTreeItem, SkillTreeItem };
