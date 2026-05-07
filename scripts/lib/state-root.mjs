/**
 * State Root Resolver (ESM)
 *
 * Single authoritative entry point for resolving the .omc root directory in
 * hook scripts, respecting the OMC_STATE_DIR environment variable.
 *
 * Delegates to getOmcRoot() from dist/lib/worktree-paths.js (the canonical
 * implementation) when CLAUDE_PLUGIN_ROOT is available. Falls back to inline
 * logic when dist is not built — this should never happen in production, but
 * provides a safe fallback during development or first-run scenarios.
 *
 * Inline fallback notes:
 *   - Uses directory path as hash source (not git remote URL). Matches
 *     canonical behavior for local-only repos; may differ for remote-backed
 *     repos when dist is missing — acceptable since dist is always present
 *     in production (CLAUDE_PLUGIN_ROOT is always set).
 */

import { join, basename } from 'path';
import { createHash } from 'crypto';
import { pathToFileURL } from 'url';
import { homedir } from 'os';
import { existsSync, realpathSync } from 'fs';

function normalizePathForCompare(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function isSharedAiRoot(directory) {
  const normalized = normalizePathForCompare(directory);
  const sharedAiRoot = normalizePathForCompare(join(homedir(), 'ai'));
  if (normalized === sharedAiRoot) {
    return true;
  }
  return basename(normalized) === 'ai' && existsSync(join(normalized, 'task'));
}

/**
 * Resolve the .omc root directory, respecting OMC_STATE_DIR.
 *
 * @param {string} directory - Worktree root directory
 * @returns {Promise<string>} Absolute path to the .omc root
 */
export async function resolveOmcStateRoot(directory) {
  const effectiveDirectory = isSharedAiRoot(directory) ? process.cwd() : directory;
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot) {
    try {
      const { getOmcRoot } = await import(
        pathToFileURL(join(pluginRoot, 'dist', 'lib', 'worktree-paths.js')).href
      );
      return getOmcRoot(effectiveDirectory);
    } catch {
      // dist not built or unavailable — fall through to inline fallback
    }
  }

  // Inline fallback: respects OMC_STATE_DIR with simplified project identifier
  const customDir = process.env.OMC_STATE_DIR;
  if (customDir) {
    const hash = createHash('sha256').update(effectiveDirectory).digest('hex').slice(0, 16);
    const dirName = basename(effectiveDirectory).replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(customDir, `${dirName}-${hash}`);
  }
  return join(effectiveDirectory, '.omc');
}
