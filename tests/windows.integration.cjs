// Windows-only integration. Never applies the shipped tweak catalogue.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { WindowsAdapter } = require('../electron/windows-adapter.cjs');
const { OptimizerEngine } = require('../electron/engine.cjs');

test('Windows: real HKCU snapshot, write, read and restore in an isolated UUID fixture', { skip: process.platform !== 'win32' }, async () => {
  const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maximo-fps-integration-'));
  const catalog = [{ id: 'integration-fixture', operation: { kind: 'registry', hive: 'HKCU', path: `Software\\MaximoFPSTest\\${randomUUID()}`, name: 'FixtureValue', value: 1, type: 'DWord' } }];
  const adapter = new WindowsAdapter();
  const engine = new OptimizerEngine({ adapter, catalog, backupDir });
  let backupId;
  try {
    const before = await adapter.inspectOperations(catalog);
    assert.equal(before['integration-fixture'].exists, false);
    const applied = await engine.applyTweaks(['integration-fixture']);
    backupId = applied.backupId;
    assert.equal(applied.success, true, JSON.stringify(applied));
    assert.equal((await engine.getTweakStates())['integration-fixture'], true);
    const restored = await engine.restoreBackup(backupId);
    assert.equal(restored.success, true, JSON.stringify(restored));
    assert.equal((await adapter.inspectOperations(catalog))['integration-fixture'].exists, false);
    backupId = undefined;
  } finally {
    if (backupId) await engine.restoreBackup(backupId);
    await fs.rm(backupDir, { recursive: true, force: true });
  }
});
