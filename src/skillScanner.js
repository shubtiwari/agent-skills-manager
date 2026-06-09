const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Scans ~/.gemini/config/plugins for all SKILL.md files
 * and returns structured data grouped by plugin.
 */
class SkillScanner {
  constructor() {
    this._pluginsDir = path.join(os.homedir(), '.gemini', 'config', 'plugins');
  }

  /**
   * Returns the plugins directory path
   */
  get pluginsDir() {
    return this._pluginsDir;
  }

  /**
   * Scan all plugins and return structured skill data.
   * @returns {Promise<PluginData[]>}
   */
  async scan() {
    const plugins = [];

    if (!fs.existsSync(this._pluginsDir)) {
      return plugins;
    }

    const entries = await fs.promises.readdir(this._pluginsDir, { withFileTypes: true });
    const pluginDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

    for (const dir of pluginDirs) {
      const pluginPath = path.join(this._pluginsDir, dir.name);
      const pluginData = await this._scanPlugin(pluginPath, dir.name);
      if (pluginData && pluginData.skills.length > 0) {
        plugins.push(pluginData);
      }
    }

    // Sort plugins alphabetically
    plugins.sort((a, b) => a.name.localeCompare(b.name));
    return plugins;
  }

  /**
   * Scan a single plugin directory.
   * @param {string} pluginPath
   * @param {string} dirName
   * @returns {Promise<PluginData|null>}
   */
  async _scanPlugin(pluginPath, dirName) {
    // Read plugin.json for metadata
    const metadata = await this._readPluginJson(pluginPath);

    // Find all SKILL.md files
    const skills = [];
    await this._findSkillFiles(pluginPath, skills);

    // Sort skills alphabetically by name
    skills.sort((a, b) => a.name.localeCompare(b.name));

    return {
      name: (metadata && metadata.name) || dirName,
      displayName: this._formatPluginName(dirName),
      description: (metadata && metadata.description) || '',
      version: (metadata && metadata.version) || '',
      path: pluginPath,
      skills
    };
  }

  /**
   * Read plugin.json metadata.
   * @param {string} pluginPath
   * @returns {Promise<object|null>}
   */
  async _readPluginJson(pluginPath) {
    const jsonPath = path.join(pluginPath, 'plugin.json');
    try {
      const content = await fs.promises.readFile(jsonPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Recursively find all SKILL.md files.
   * @param {string} dirPath
   * @param {SkillData[]} results
   */
  async _findSkillFiles(dirPath, results) {
    let entries;
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await this._findSkillFiles(fullPath, results);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        const skillData = await this._parseSkillFile(fullPath);
        if (skillData) {
          results.push(skillData);
        }
      }
    }
  }

  /**
   * Parse a SKILL.md file, extracting YAML frontmatter and body.
   * @param {string} filePath
   * @returns {Promise<SkillData|null>}
   */
  async _parseSkillFile(filePath) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const { frontmatter, body } = this._parseFrontmatter(content);

      // Derive the skill name from frontmatter or directory name
      const dirName = path.basename(path.dirname(filePath));
      const name = (frontmatter && frontmatter.name) || dirName;
      const description = (frontmatter && frontmatter.description) || '';

      return {
        name,
        displayName: this._formatSkillName(name),
        description: typeof description === 'string' ? description.trim() : String(description).trim(),
        filePath,
        body,
        rawContent: content
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse YAML frontmatter from markdown content.
   * Handles both single-line and multi-line (>) YAML values.
   * @param {string} content
   * @returns {{ frontmatter: object|null, body: string }}
   */
  _parseFrontmatter(content) {
    const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = content.match(fmRegex);

    if (!match) {
      return { frontmatter: null, body: content };
    }

    const yamlBlock = match[1];
    const body = content.slice(match[0].length);

    // Simple YAML parser for name/description (supports multi-line with >)
    const frontmatter = {};
    const lines = yamlBlock.split('\n');
    let currentKey = null;
    let currentValue = '';
    let isMultiLine = false;

    for (const line of lines) {
      // Check for a new key
      const keyMatch = line.match(/^(\w+):\s*(.*)/);
      if (keyMatch && !line.startsWith('  ')) {
        // Save previous key if any
        if (currentKey) {
          frontmatter[currentKey] = isMultiLine ? currentValue.trim() : currentValue;
        }

        currentKey = keyMatch[1];
        const rawValue = keyMatch[2].trim();

        if (rawValue === '>' || rawValue === '|') {
          // Multi-line YAML value
          isMultiLine = true;
          currentValue = '';
        } else {
          isMultiLine = false;
          currentValue = rawValue;
        }
      } else if (currentKey && isMultiLine) {
        // Continuation of multi-line value
        currentValue += ' ' + line.trim();
      }
    }

    // Save the last key
    if (currentKey) {
      frontmatter[currentKey] = isMultiLine ? currentValue.trim() : currentValue;
    }

    return { frontmatter, body };
  }

  /**
   * Format a plugin directory name into a display name.
   * e.g. "chrome-devtools-plugin" → "Chrome Devtools"
   * @param {string} name
   * @returns {string}
   */
  _formatPluginName(name) {
    return name
      .replace(/-plugin$/, '')
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  /**
   * Format a skill name into a display name.
   * e.g. "chrome-devtools" → "Chrome Devtools"
   * @param {string} name
   * @returns {string}
   */
  _formatSkillName(name) {
    return name
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}

module.exports = { SkillScanner };

/**
 * @typedef {object} PluginData
 * @property {string} name
 * @property {string} displayName
 * @property {string} description
 * @property {string} version
 * @property {string} path
 * @property {SkillData[]} skills
 */

/**
 * @typedef {object} SkillData
 * @property {string} name
 * @property {string} displayName
 * @property {string} description
 * @property {string} filePath
 * @property {string} body
 * @property {string} rawContent
 */
