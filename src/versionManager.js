const fs = require('fs');
const path = require('path');

/**
 * Manages version history for SKILL.md files.
 * Versions are stored in a `.versions/` directory alongside each SKILL.md,
 * using sequential numbering: SKILL.v1.md, SKILL.v2.md, etc.
 */
class VersionManager {
  /**
   * Name of the hidden versions directory.
   */
  static VERSIONS_DIR = '.versions';
  static METADATA_FILE = 'metadata.json';

  /**
   * Create a new version snapshot of the current SKILL.md before overwriting.
   * @param {string} skillFilePath - Absolute path to the SKILL.md file
   * @param {string} [description=''] - Human-readable description of this version
   * @returns {Promise<VersionEntry>} The created version entry
   */
  static async createVersion(skillFilePath, description = '') {
    const versionsDir = VersionManager._getVersionsDir(skillFilePath);

    // Ensure .versions directory exists
    await fs.promises.mkdir(versionsDir, { recursive: true });

    // Read current content
    const currentContent = await fs.promises.readFile(skillFilePath, 'utf-8');

    // Read existing metadata (or create fresh)
    const metadata = await VersionManager._readMetadata(versionsDir);

    // Determine next version number
    const nextVersion = metadata.versions.length > 0
      ? Math.max(...metadata.versions.map(v => v.version)) + 1
      : 1;

    // Write the snapshot file
    const snapshotFileName = `SKILL.v${nextVersion}.md`;
    const snapshotPath = path.join(versionsDir, snapshotFileName);
    await fs.promises.writeFile(snapshotPath, currentContent, 'utf-8');

    // Create version entry
    const entry = {
      version: nextVersion,
      timestamp: new Date().toISOString(),
      description: description || `Version ${nextVersion}`,
      fileName: snapshotFileName
    };

    // Update metadata
    metadata.versions.push(entry);
    await VersionManager._writeMetadata(versionsDir, metadata);

    return entry;
  }

  /**
   * Get all version entries for a skill.
   * @param {string} skillFilePath
   * @returns {Promise<VersionEntry[]>}
   */
  static async getVersions(skillFilePath) {
    const versionsDir = VersionManager._getVersionsDir(skillFilePath);

    if (!fs.existsSync(versionsDir)) {
      return [];
    }

    const metadata = await VersionManager._readMetadata(versionsDir);
    // Return in reverse chronological order (newest first)
    return [...metadata.versions].reverse();
  }

  /**
   * Get the content of a specific version.
   * @param {string} skillFilePath
   * @param {number} versionNumber
   * @returns {Promise<string>}
   */
  static async getVersionContent(skillFilePath, versionNumber) {
    const versionsDir = VersionManager._getVersionsDir(skillFilePath);
    const snapshotPath = path.join(versionsDir, `SKILL.v${versionNumber}.md`);

    if (!fs.existsSync(snapshotPath)) {
      throw new Error(`Version ${versionNumber} not found`);
    }

    return fs.promises.readFile(snapshotPath, 'utf-8');
  }

  /**
   * Restore a previous version. Creates a safety snapshot of the current
   * content before overwriting.
   * @param {string} skillFilePath
   * @param {number} versionNumber
   * @returns {Promise<void>}
   */
  static async restoreVersion(skillFilePath, versionNumber) {
    // Safety: snapshot current state before restoring
    await VersionManager.createVersion(skillFilePath, `Auto-backup before restoring v${versionNumber}`);

    // Read the requested version
    const content = await VersionManager.getVersionContent(skillFilePath, versionNumber);

    // Overwrite the current SKILL.md
    await fs.promises.writeFile(skillFilePath, content, 'utf-8');
  }

  /**
   * Get the count of versions for a skill (without loading full metadata).
   * @param {string} skillFilePath
   * @returns {Promise<number>}
   */
  static async getVersionCount(skillFilePath) {
    const versionsDir = VersionManager._getVersionsDir(skillFilePath);

    if (!fs.existsSync(versionsDir)) {
      return 0;
    }

    const metadata = await VersionManager._readMetadata(versionsDir);
    return metadata.versions.length;
  }

  // ── Private helpers ─────────────────────────────────────────

  /**
   * Get the .versions directory path for a given SKILL.md file.
   * @param {string} skillFilePath
   * @returns {string}
   */
  static _getVersionsDir(skillFilePath) {
    return path.join(path.dirname(skillFilePath), VersionManager.VERSIONS_DIR);
  }

  /**
   * Read the metadata.json from a .versions directory.
   * @param {string} versionsDir
   * @returns {Promise<VersionMetadata>}
   */
  static async _readMetadata(versionsDir) {
    const metaPath = path.join(versionsDir, VersionManager.METADATA_FILE);
    try {
      const raw = await fs.promises.readFile(metaPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return { versions: [] };
    }
  }

  /**
   * Write the metadata.json to a .versions directory.
   * @param {string} versionsDir
   * @param {VersionMetadata} metadata
   */
  static async _writeMetadata(versionsDir, metadata) {
    const metaPath = path.join(versionsDir, VersionManager.METADATA_FILE);
    await fs.promises.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }
}

module.exports = { VersionManager };

/**
 * @typedef {object} VersionEntry
 * @property {number} version
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {string} description
 * @property {string} fileName - e.g. "SKILL.v1.md"
 */

/**
 * @typedef {object} VersionMetadata
 * @property {VersionEntry[]} versions
 */
