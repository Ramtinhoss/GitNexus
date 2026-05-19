/**
 * Clean Command
 *
 * Removes the GitNexus index from the current repository.
 * Also unregisters the repo from the global registry.
 */

import fs from 'fs/promises';
import path from 'path';
import { findRepo, unregisterRepo, listRegisteredRepos } from '../storage/repo-manager.js';

/**
 * Selectively delete contents of a .gitnexus directory, preserving config files.
 * Preserves: meta.json, config.json, .gitnexusignore
 */
const selectiveClean = async (storagePath: string): Promise<void> => {
  const PRESERVE = new Set(['meta.json', 'config.json', '.gitnexusignore']);
  let entries: string[];
  try {
    entries = await fs.readdir(storagePath);
  } catch {
    // Directory doesn't exist, nothing to clean
    return;
  }
  for (const entry of entries) {
    if (PRESERVE.has(entry)) continue;
    await fs.rm(path.join(storagePath, entry), { recursive: true, force: true });
  }
};

export const cleanCommand = async (options?: { force?: boolean; all?: boolean }) => {
  // --all flag: clean all indexed repos
  if (options?.all) {
    if (!options?.force) {
      const entries = await listRegisteredRepos();
      if (entries.length === 0) {
        console.log('No indexed repositories found.');
        return;
      }
      console.log(`This will clean GitNexus indexes for ${entries.length} repo(s):`);
      for (const entry of entries) {
        console.log(`  - ${entry.name} (${entry.path})`);
      }
      console.log('\nRun with --force to confirm.');
      return;
    }

    const entries = await listRegisteredRepos();
    for (const entry of entries) {
      try {
        await selectiveClean(entry.storagePath);
        await unregisterRepo(entry.path);
        console.log(`Cleaned: ${entry.name} (${entry.storagePath})`);
      } catch (err) {
        console.error(`Failed to clean ${entry.name}:`, err);
      }
    }
    return;
  }

  // Default: clean current repo
  const cwd = process.cwd();
  const repo = await findRepo(cwd);

  if (!repo) {
    console.log('No indexed repository found in this directory.');
    return;
  }

  const repoName = repo.repoPath.split(/[/\\]/).pop() || repo.repoPath;

  if (!options?.force) {
    console.log(`This will clean the GitNexus index for: ${repoName}`);
    console.log(`   Path: ${repo.storagePath}`);
    console.log('\nRun with --force to confirm.');
    return;
  }

  try {
    await selectiveClean(repo.storagePath);
    await unregisterRepo(repo.repoPath);
    console.log(`Cleaned: ${repo.storagePath}`);
  } catch (err) {
    console.error('Failed to clean:', err);
  }
};
