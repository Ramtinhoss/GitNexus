import test from 'node:test';
import assert from 'node:assert/strict';
import { unityUiTraceCommand } from './tool.js';

test('unity-ui-trace command forwards params and prints result', async () => {
  const calls: Array<{ method: string; params: any }> = [];
  let printed: any = null;

  await unityUiTraceCommand(
    'EliteBossScreenController',
    { goal: 'selector_bindings', selectorMode: 'strict', repo: 'mini-unity-ui' },
    {
      backend: {
        async callTool(method: string, params: any) {
          calls.push({ method, params });
          return { goal: 'selector_bindings', results: [{ evidence_chain: [{ path: 'a', line: 1 }] }], diagnostics: [] };
        },
      },
      output: (value: any) => {
        printed = value;
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'unity_ui_trace');
  assert.equal(calls[0].params.target, 'EliteBossScreenController');
  assert.equal(calls[0].params.goal, 'selector_bindings');
  assert.equal(calls[0].params.selector_mode, 'strict');
  assert.equal(printed.goal, 'selector_bindings');
});
