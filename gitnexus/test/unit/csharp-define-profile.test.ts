import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { loadCSharpDefineProfileFromCsproj } from '../../src/core/tree-sitter/csharp-define-profile.js';

async function withTempCsproj(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-csproj-'));
  const csprojPath = path.join(dir, 'Assembly-CSharp.csproj');
  await fs.writeFile(csprojPath, content, 'utf-8');
  return csprojPath;
}

describe('loadCSharpDefineProfileFromCsproj', () => {
  it('splits DefineConstants by semicolon and trims symbols', async () => {
    const csproj = await withTempCsproj(`
      <Project Sdk="Microsoft.NET.Sdk">
        <PropertyGroup>
          <DefineConstants> TRACE ; DEBUG;UNITY_EDITOR </DefineConstants>
        </PropertyGroup>
      </Project>
    `);

    const profile = await loadCSharpDefineProfileFromCsproj(csproj);
    expect([...profile.symbols].sort()).toEqual(['DEBUG', 'TRACE', 'UNITY_EDITOR']);
    expect(profile.rawDefineConstants).toEqual(['TRACE ; DEBUG;UNITY_EDITOR']);
  });

  it('merges DefineConstants from multiple PropertyGroup blocks', async () => {
    const csproj = await withTempCsproj(`
      <Project Sdk="Microsoft.NET.Sdk">
        <PropertyGroup>
          <DefineConstants>TRACE;DEBUG</DefineConstants>
        </PropertyGroup>
        <PropertyGroup Condition="'$(Configuration)' == 'Release'">
          <DefineConstants>RELEASE;UNITY_STANDALONE_WIN</DefineConstants>
        </PropertyGroup>
      </Project>
    `);

    const profile = await loadCSharpDefineProfileFromCsproj(csproj);
    expect([...profile.symbols].sort()).toEqual(['DEBUG', 'RELEASE', 'TRACE', 'UNITY_STANDALONE_WIN']);
    expect(profile.rawDefineConstants).toEqual(['TRACE;DEBUG', 'RELEASE;UNITY_STANDALONE_WIN']);
  });

  it('returns an empty symbol set when DefineConstants is absent', async () => {
    const csproj = await withTempCsproj(`
      <Project Sdk="Microsoft.NET.Sdk">
        <PropertyGroup>
          <TargetFramework>netstandard2.1</TargetFramework>
        </PropertyGroup>
      </Project>
    `);

    const profile = await loadCSharpDefineProfileFromCsproj(csproj);
    expect(profile.symbols.size).toBe(0);
    expect(profile.rawDefineConstants).toEqual([]);
  });

  it('throws a readable error when csproj does not exist', async () => {
    const missing = path.join(os.tmpdir(), 'gitnexus-missing', 'Assembly-CSharp.csproj');
    await expect(loadCSharpDefineProfileFromCsproj(missing)).rejects.toThrow(missing);
  });
});
