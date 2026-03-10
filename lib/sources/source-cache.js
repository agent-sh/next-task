/**
 * Source Cache
 * File-based persistence for task source preferences
 *
 * State directory is platform-aware:
 * - Claude Code: .claude/sources/
 * - OpenCode: .opencode/sources/
 * - Codex CLI: .codex/sources/
 *
 * @module lib/sources/source-cache
 */

const fs = require('fs');
const path = require('path');
const { getStateDir } = require('../platform/state-dir');
const { writeJsonAtomic } = require('../utils/atomic-write');

const PREFERENCE_FILE = 'preference.json';
const MAX_SKIPS_BEFORE_REMOVAL = 3;

/**
 * Get the sources directory path (platform-aware)
 * @returns {string} Path to sources directory
 */
function getSourcesDir() {
  return path.join(getStateDir(), 'sources');
}

/**
 * Validate tool name to prevent path traversal
 * @param {string} toolName - Tool name to validate
 * @returns {boolean} True if valid
 */
function isValidToolName(toolName) {
  // Prevent path traversal and shell metacharacters
  return /^[a-zA-Z0-9_-]+$/.test(toolName);
}

/**
 * Ensure sources directory exists
 * @returns {string} Path to sources directory
 */
function ensureDir() {
  const sourcesDir = getSourcesDir();
  if (!fs.existsSync(sourcesDir)) {
    fs.mkdirSync(sourcesDir, { recursive: true });
  }
  return sourcesDir;
}

/**
 * Get cached source preference
 * @returns {Object|null} Preference object or null if not cached
 * @example
 * // Returns: { source: 'github' }
 * // Or: { source: 'custom', type: 'cli', tool: 'tea' }
 */
function getPreference() {
  const filePath = path.join(getSourcesDir(), PREFERENCE_FILE);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read preference file:`, err.message);
    return null;
  }
}

/**
 * Save source preference
 * @param {Object} preference - Preference object
 * @param {string} preference.source - Source type (github, gitlab, local, custom, other)
 * @param {string} [preference.type] - For custom: mcp, cli, skill, file
 * @param {string} [preference.tool] - Tool name or path
 * @param {string} [preference.description] - For other: user's free text
 */
function savePreference(preference) {
  ensureDir();
  const filePath = path.join(getSourcesDir(), PREFERENCE_FILE);
  writeJsonAtomic(filePath, {
    ...preference,
    savedAt: new Date().toISOString()
  });
}

/**
 * Get cached tool capabilities (for custom sources)
 * @param {string} toolName - Tool identifier (e.g., 'tea', 'glab')
 * @returns {Object|null} Capabilities object or null
 */
function getToolCapabilities(toolName) {
  // Prevent path traversal
  if (!isValidToolName(toolName)) {
    console.error(`Invalid tool name: ${toolName}`);
    return null;
  }
  const filePath = path.join(getSourcesDir(), `${toolName}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read tool capabilities for ${toolName}:`, err.message);
    return null;
  }
}

/**
 * Save tool capabilities after discovery
 * @param {string} toolName - Tool identifier
 * @param {Object} capabilities - Discovered capabilities
 * @param {string[]} capabilities.features - Available features (issues, prs, ci)
 * @param {Object} capabilities.commands - Command mappings
 */
function saveToolCapabilities(toolName, capabilities) {
  // Prevent path traversal
  if (!isValidToolName(toolName)) {
    console.error(`Invalid tool name: ${toolName}`);
    return;
  }
  ensureDir();
  const filePath = path.join(getSourcesDir(), `${toolName}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    ...capabilities,
    discoveredAt: new Date().toISOString()
  }, null, 2));
}

/**
 * Clear all cached preferences
 */
function clearCache() {
  const sourcesDir = getSourcesDir();
  if (fs.existsSync(sourcesDir)) {
    const files = fs.readdirSync(sourcesDir);
    for (const file of files) {
      const filePath = path.join(sourcesDir, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        fs.unlinkSync(filePath);
      }
    }
  }
}

/**
 * Check if preference matches a specific source
 * @param {string} source - Source to check
 * @returns {boolean} True if preference matches
 */
function isPreferred(source) {
  const pref = getPreference();
  return pref?.source === source;
}

/**
 * Get cached free-text options for a specific question.
 * Returns options the user typed via free language in previous runs.
 * @param {string} questionKey - 'source' | 'priority' | 'stopPoint'
 * @returns {Array<{label: string, value: string, useCount: number}>}
 */
function getFreeTextOptions(questionKey) {
  const filePath = path.join(getSourcesDir(), PREFERENCE_FILE);
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data.freeText?.[questionKey] || [];
  } catch { return []; }
}

/**
 * Record that a free-text option was selected (increment useCount, reset skipCount).
 * If it doesn't exist yet, create it.
 * @param {string} questionKey - 'source' | 'priority' | 'stopPoint'
 * @param {string} value - The free-text value the user entered
 * @param {string} label - Display label (truncated to 30 chars)
 */
function trackFreeTextSelection(questionKey, value, label) {
  ensureDir();
  const filePath = path.join(getSourcesDir(), PREFERENCE_FILE);
  let data = {};
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}

  if (!data.freeText) data.freeText = {};
  if (!data.freeText[questionKey]) data.freeText[questionKey] = [];

  const existing = data.freeText[questionKey].find(o => o.value === value);
  if (existing) {
    existing.useCount = (existing.useCount || 0) + 1;
    existing.skipCount = 0;
    existing.lastUsed = new Date().toISOString();
  } else {
    data.freeText[questionKey].push({
      label: label.substring(0, 30),
      value,
      useCount: 1,
      skipCount: 0,
      lastUsed: new Date().toISOString()
    });
  }

  writeJsonAtomic(filePath, data);
}

/**
 * Record that a free-text option was NOT selected this run.
 * Increment skipCount for all options of this question.
 * Remove any that exceeded MAX_SKIPS_BEFORE_REMOVAL.
 * @param {string} questionKey - 'source' | 'priority' | 'stopPoint'
 * @param {string|null} selectedValue - The value that WAS selected (skip others)
 */
function decayFreeTextOptions(questionKey, selectedValue) {
  ensureDir();
  const filePath = path.join(getSourcesDir(), PREFERENCE_FILE);
  let data = {};
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}

  const options = data.freeText?.[questionKey];
  if (!options || options.length === 0) return;

  data.freeText[questionKey] = options
    .map(o => {
      if (o.value === selectedValue) return o;
      return { ...o, skipCount: (o.skipCount || 0) + 1 };
    })
    .filter(o => o.skipCount < MAX_SKIPS_BEFORE_REMOVAL);

  writeJsonAtomic(filePath, data);
}

module.exports = {
  getPreference,
  savePreference,
  getToolCapabilities,
  saveToolCapabilities,
  clearCache,
  isPreferred,
  getFreeTextOptions,
  trackFreeTextSelection,
  decayFreeTextOptions
};
