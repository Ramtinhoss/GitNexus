import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { enforceSyncManifestConsistency } from './sync-manifest.js';

async function writeManifest(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

test('when explicit CLI values differ from manifest, TTY mode asks whether to update manifest', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-sync-manifest-'));
  const manifestPath = path.join(tmpDir, '.gitnexus', 'sync-manifest.txt');
  await writeManifest(
    manifestPath,
    ['Assets/', '@extensions=.cs,.meta', '@repoAlias=demo-repo', '@embeddings=false'].join('\n'),
  );

  let promptMessage = '';
  const result = await enforceSyncManifestConsistency({
    manifestPath,
    extensions: '.ts',
    policy: 'ask',
    stdinIsTTY: true,
    prompt: async (message) => {
      promptMessage = message;
      return 'keep';
    },
  });

  assert.equal(result.decision, 'keep');
  assert.match(promptMessage, /@extensions/i);
});

test('non-TTY without explicit policy exits with actionable error', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-sync-manifest-'));
  const manifestPath = path.join(tmpDir, '.gitnexus', 'sync-manifest.txt');
  await writeManifest(
    manifestPath,
    ['Assets/', '@extensions=.cs,.meta', '@repoAlias=demo-repo', '@embeddings=false'].join('\n'),
  );

  await assert.rejects(
    enforceSyncManifestConsistency({
      manifestPath,
      extensions: '.ts',
      stdinIsTTY: false,
    }),
    /--sync-manifest-policy/i,
  );
});

test('policy=update rewrites manifest with normalized directives', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-sync-manifest-'));
  const manifestPath = path.join(tmpDir, '.gitnexus', 'sync-manifest.txt');
  await writeManifest(
    manifestPath,
    ['Assets/', 'Packages/', '@extensions=.cs,.meta', '@repoAlias=demo-repo', '@embeddings=false'].join('\n'),
  );

  const result = await enforceSyncManifestConsistency({
    manifestPath,
    extensions: '.ts,.tsx',
    embeddings: true,
    policy: 'update',
  });

  const rewritten = await fs.readFile(manifestPath, 'utf-8');
  assert.equal(result.decision, 'update');
  assert.equal(
    rewritten,
    ['Assets', 'Packages', '@extensions=.ts,.tsx', '@repoAlias=demo-repo', '@embeddings=true', ''].join('\n'),
  );
});

test('rejects placeholder manifest path values', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-sync-manifest-placeholder-'));
  const manifestPath = path.join(tmpDir, '.gitnexus', 'sync-manifest-placeholder.txt');
  await writeManifest(
    manifestPath,
    ['Assets/', '@extensions=.cs,.meta', '@repoAlias=demo-repo', '@embeddings=false'].join('\n'),
  );

  await assert.rejects(
    enforceSyncManifestConsistency({
      manifestPath,
      extensions: '.ts',
      policy: 'keep',
    }),
    /placeholder manifest path/i,
  );
});

test('TTY prompt branch requires concrete stdin.isTTY evidence', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-sync-manifest-tty-evidence-'));
  const manifestPath = path.join(tmpDir, '.gitnexus', 'sync-manifest.txt');
  await writeManifest(
    manifestPath,
    ['Assets/', '@extensions=.cs,.meta', '@repoAlias=demo-repo', '@embeddings=false'].join('\n'),
  );

  await assert.rejects(
    enforceSyncManifestConsistency({
      manifestPath,
      extensions: '.ts',
      policy: 'ask',
      prompt: async () => 'keep',
    }),
    /stdin\.isTTY evidence/i,
  );
});

test('manifest rewrite requires non-empty diff entries', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-sync-manifest-noop-'));
  const manifestPath = path.join(tmpDir, '.gitnexus', 'sync-manifest.txt');
  await writeManifest(
    manifestPath,
    ['Assets/', '@extensions=.cs,.meta', '@repoAlias=demo-repo', '@embeddings=false'].join('\n'),
  );

  await assert.rejects(
    enforceSyncManifestConsistency({
      manifestPath,
      extensions: '.cs,.meta',
      repoAlias: 'demo-repo',
      embeddings: false,
      policy: 'update',
    }),
    /non-empty diff/i,
  );
});
