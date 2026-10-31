const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { OptimizerEngine, validateCatalog } = require('../electron/engine.cjs');
const { WindowsAdapter, validateSnapshot, executePowerShell } = require('../electron/windows-adapter.cjs');

const first = { id: 'game-mode', operation: { kind: 'registry', hive: 'HKCU', path: 'Software\\Microsoft\\GameBar', name: 'AutoGameModeEnabled', value: 1, type: 'DWord' } };
const second = { id: 'background-recording', operation: { kind: 'registry', hive: 'HKCU', path: 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', name: 'AppCaptureEnabled', value: 0, type: 'DWord' } };
const absent = { available: true, kind: 'registry', exists: false, keyExisted: true, type: null, value: null };

async function fixture(t, adapter = {}, platform = 'win32') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'maximo-fps-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const defaults = {
    inspectOperations: async tweaks => Object.fromEntries(tweaks.map(item => [item.id, { ...absent }])),
    applyOperations: async tweaks => tweaks.map(item => ({ id: item.id, success: true, message: 'Applied.' })),
    restoreSnapshots: async tweaks => tweaks.map(item => ({ id: item.id, success: true, message: 'Restored.' })),
  };
  const engine = new OptimizerEngine({ catalog: [first, second], backupDir: directory, adapter: { ...defaults, ...adapter }, platform });
  return { engine, directory };
}

test('catalog refuses unknown operations, duplicate destinations and security services', () => {
  assert.throws(() => validateCatalog([{ id: 'shell', operation: { kind: 'command', command: 'anything' } }]));
  assert.throws(() => validateCatalog([first, { ...first, id: 'duplicate-target' }]));
  assert.throws(() => validateCatalog([{ id: 'bad', operation: { kind: 'service', name: 'WinDefend', startType: 'Disabled' } }]));
  assert.throws(() => validateCatalog([{ id: 'bad', operation: { kind: 'registry', hive: 'HKLM', path: 'Software\\Policies\\Microsoft\\Windows Defender', name: 'DisableAntiSpyware', type: 'DWord', value: 1 } }]));
  assert.throws(() => validateCatalog([{ ...first, operation: { ...first.operation, value: -1 } }]));
  assert.doesNotThrow(() => validateCatalog([{ id: 'animation', operation: { kind: 'registry', hive: 'HKCU', path: 'Control Panel\\Desktop\\WindowMetrics', name: 'MinAnimate', type: 'String', value: '0' } }]));
});

test('non-Windows returns unavailable states and never applies or restores', async t => {
  const { engine } = await fixture(t, {
    applyOperations: async () => assert.fail('Must not execute on Linux.'),
    restoreSnapshots: async () => assert.fail('Must not restore on Linux.'),
  }, 'linux');
  assert.equal((await engine.applyTweaks([first.id])).success, false);
  assert.equal((await engine.restoreBackup('anything')).success, false);
  assert.deepEqual(await engine.getTweakStates(), { 'game-mode': null, 'background-recording': null });
});

test('only valid unique catalog IDs can be applied', async t => {
  const { engine } = await fixture(t);
  await assert.rejects(engine.applyTweaks(['game-mode', 'game-mode']));
  await assert.rejects(engine.applyTweaks(['not-in-catalog']));
  await assert.rejects(engine.applyTweaks([]));
  await assert.rejects(engine.applyTweaks('game-mode'));
  await assert.rejects(engine.restoreBackup('../../malicious'));
});

test('original state exists on disk before any mutation, and restore removes previously absent value', async t => {
  let directory;
  let restoredEntries;
  const fixtureResult = await fixture(t, {
    applyOperations: async tweaks => {
      const files = await fs.readdir(directory);
      assert.equal(files.length, 1);
      const backup = JSON.parse(await fs.readFile(path.join(directory, files[0]), 'utf8'));
      assert.equal(backup.status, 'partial');
      assert.deepEqual(backup.snapshots[first.id], absent);
      return tweaks.map(item => ({ id: item.id, success: true, message: 'Applied.' }));
    },
    restoreSnapshots: async entries => {
      restoredEntries = entries;
      return entries.map(item => ({ id: item.id, success: true, message: 'Restored.' }));
    },
  });
  directory = fixtureResult.directory;
  const applied = await fixtureResult.engine.applyTweaks([first.id]);
  assert.equal(applied.success, true);
  const publicBackups = await fixtureResult.engine.listBackups();
  assert.equal(publicBackups[0].status, 'applied');
  assert.equal(publicBackups[0].snapshots, undefined, 'Do not expose original registry contents to renderer.');
  const restored = await fixtureResult.engine.restoreBackup(applied.backupId);
  assert.equal(restored.success, true);
  assert.equal(restoredEntries[0].snapshot.exists, false);
  assert.equal((await fixtureResult.engine.listBackups())[0].status, 'restored');
});

test('failure to capture any original state prevents every mutation', async t => {
  const { engine } = await fixture(t, {
    inspectOperations: async () => ({ [first.id]: absent, [second.id]: { available: false, message: 'Access denied.' } }),
    applyOperations: async () => assert.fail('No mutation without a complete backup.'),
  });
  const result = await engine.applyTweaks([first.id, second.id]);
  assert.equal(result.success, false);
  assert.equal(result.results[0].id, second.id);
  assert.deepEqual(await engine.listBackups(), []);
});

test('failed initial persistence is fail-closed and clears operation lock', async t => {
  const { engine } = await fixture(t, { applyOperations: async () => assert.fail('No mutation before durable backup.') });
  engine.writeBackup = async () => { throw new Error('Disk full.'); };
  await assert.rejects(engine.applyTweaks([first.id]), /Disk full/);
  assert.equal(engine.busy, false);
});

test('uncertain native execution retains restorable original values', async t => {
  const { engine } = await fixture(t, { applyOperations: async () => { throw new Error('PowerShell timed out.'); } });
  const result = await engine.applyTweaks([first.id]);
  assert.equal(result.success, false);
  const backup = (await engine.listBackups())[0];
  assert.equal(backup.id, result.backupId);
  assert.equal(backup.status, 'partial', 'Unknown mutations must remain visible as recoverable history.');
  assert.equal((await engine.restoreBackup(result.backupId)).success, true);
});

test('failed verification after a write remains recoverable even with zero confirmed successes', async t => {
  let changed = false;
  const { engine } = await fixture(t, {
    applyOperations: async () => {
      changed = true;
      return [{ id: first.id, success: false, message: 'Verification failed after the OS write.' }];
    },
    restoreSnapshots: async entries => {
      changed = false;
      return entries.map(item => ({ id: item.id, success: true, message: 'Restored.' }));
    },
  });
  const result = await engine.applyTweaks([first.id]);
  assert.equal(changed, true);
  assert.equal(result.success, false);
  assert.equal((await engine.listBackups())[0].status, 'partial');
  assert.equal((await engine.restoreBackup(result.backupId)).success, true);
  assert.equal(changed, false);
});

test('backend enforces newest-first restoration across restarts and equal clock readings', async t => {
  t.mock.method(Date, 'now', () => 1800000000000);
  let value = 0;
  const restoreCalls = [];
  const adapter = {
    inspectOperations: async tweaks => Object.fromEntries(tweaks.map(item => [item.id, { ...absent, exists: true, type: 'DWord', value }])),
    applyOperations: async tweaks => {
      value = 1;
      return tweaks.map(item => ({ id: item.id, success: true, message: 'Applied.' }));
    },
    restoreSnapshots: async entries => {
      restoreCalls.push(entries[0].snapshot.value);
      value = entries[0].snapshot.value;
      return entries.map(item => ({ id: item.id, success: true, message: 'Restored.' }));
    },
  };
  const { engine, directory } = await fixture(t, adapter);
  const older = await engine.applyTweaks([first.id]);
  const newer = await engine.applyTweaks([first.id]);
  const restarted = new OptimizerEngine({ catalog: [first, second], backupDir: directory, adapter, platform: 'win32' });
  const backups = await restarted.listBackups();
  assert.deepEqual(backups.map(item => item.id), [newer.backupId, older.backupId]);
  assert.ok(Date.parse(backups[0].createdAt) > Date.parse(backups[1].createdAt));
  await assert.rejects(restarted.restoreBackup(older.backupId), /más reciente/);
  assert.equal(value, 1);
  assert.deepEqual(restoreCalls, []);
  assert.equal((await restarted.restoreBackup(newer.backupId)).success, true);
  assert.equal(value, 1);
  assert.equal((await restarted.restoreBackup(older.backupId)).success, true);
  assert.equal(value, 0);
  assert.deepEqual(restoreCalls, [1, 0]);
});

test('partial restore can be retried without repeating successful restores', async t => {
  const calls = [];
  const { engine } = await fixture(t, {
    restoreSnapshots: async entries => {
      calls.push(entries.map(entry => entry.id));
      return entries.map(entry => ({ id: entry.id, success: calls.length > 1 || entry.id === second.id, message: 'Result.' }));
    },
  });
  const applied = await engine.applyTweaks([first.id, second.id]);
  assert.equal((await engine.restoreBackup(applied.backupId)).success, false);
  assert.equal((await engine.restoreBackup(applied.backupId)).success, true);
  assert.deepEqual(calls, [[second.id, first.id], [first.id]]);
});

test('parallel mutations are rejected while a transaction is in progress', async t => {
  let release;
  let started;
  const latch = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const { engine } = await fixture(t, { applyOperations: async tweaks => { started(); await pending; return tweaks.map(item => ({ id: item.id, success: true })); } });
  const operation = engine.applyTweaks([first.id]);
  await latch;
  await assert.rejects(engine.applyTweaks([second.id]), /en curso/);
  await assert.rejects(engine.restoreBackup('anything'), /en curso/);
  release();
  assert.equal((await operation).success, true);
});

test('state comparison distinguishes missing values, types and unavailable targets', async t => {
  const { engine } = await fixture(t, { inspectOperations: async () => ({
    [first.id]: { ...absent, exists: true, type: 'DWord', value: 1 },
    [second.id]: { available: false },
  }) });
  assert.deepEqual(await engine.getTweakStates(), { 'game-mode': true, 'background-recording': null });
});

test('restoration validates original registry types and service state', () => {
  assert.doesNotThrow(() => validateSnapshot({ ...absent, exists: true, type: 'QWord', value: '9223372036854775807' }, first.operation));
  assert.throws(() => validateSnapshot({ ...absent, exists: true, type: 'QWord', value: 9223372036854775807 }, first.operation));
  assert.throws(() => validateSnapshot({ ...absent, exists: true, type: 'DWord', value: -1 }, first.operation));
  assert.throws(() => validateSnapshot({ ...absent, exists: true, type: 'Binary', value: [300] }, first.operation));
  assert.throws(() => validateSnapshot({ available: true, kind: 'service', startType: 'malicious', delayedAuto: false }, { kind: 'service' }));
  assert.throws(() => validateSnapshot({ ...absent, kind: 'power', scheme: '; arbitrary command' }, { kind: 'power' }));
});

test('PowerShell wrapper passes untrusted-looking values exclusively through JSON stdin', async () => {
  let received;
  const payload = { value: "'; Start-Process calc; #" };
  const result = await executePowerShell('ConvertTo-Json @{ success = $true }', payload, {
    execute: (file, args, options, callback) => {
      assert.ok(file.endsWith('powershell.exe'));
      assert.equal(options.shell, false);
      assert.equal(args.includes('-ExecutionPolicy'), false);
      assert.ok(!Buffer.from(args.at(-1), 'base64').toString('utf16le').includes('Start-Process'));
      const stdin = new EventEmitter();
      stdin.end = value => { received = JSON.parse(value); callback(null, '{"success":true}', ''); };
      return { stdin };
    },
  });
  assert.deepEqual(received, payload);
  assert.deepEqual(result, { success: true });
});

test('all packaged PowerShell scripts fit the Windows command-line limit', async () => {
  for (const name of ['inspect', 'apply', 'restore', 'hardware']) {
    const text = await fs.readFile(path.join(__dirname, '..', 'electron', 'powershell', `${name}.ps1`), 'utf8');
    assert.ok(Buffer.from(text, 'utf16le').toString('base64').length < 28000, name);
  }
});

test('changed catalog destinations cannot reuse old backup values', async t => {
  const { engine, directory } = await fixture(t);
  const result = await engine.applyTweaks([first.id]);
  const changed = new OptimizerEngine({
    catalog: [{ ...first, operation: { ...first.operation, path: 'Software\\ChangedDestination' } }, second],
    backupDir: directory,
    adapter: { restoreSnapshots: async () => assert.fail('Cannot restore into a changed destination.') },
    platform: 'win32',
  });
  await assert.rejects(changed.restoreBackup(result.backupId), /incompatible/);
});

test('malformed backup metadata cannot hide valid history entries', async t => {
  const { engine, directory } = await fixture(t);
  const result = await engine.applyTweaks([first.id]);
  const invalidId = 'f81366c3-0a67-4f39-9345-7a9bc652a28a';
  await fs.writeFile(path.join(directory, `${invalidId}.json`), JSON.stringify({ version: 1, id: invalidId, tweakIds: [first.id], snapshots: { [first.id]: absent } }));
  const backups = await engine.listBackups();
  assert.equal(backups.length, 1);
  assert.equal(backups[0].id, result.backupId);
});

test('adapter marks unsupported original registry values unavailable before mutation', async () => {
  const adapter = new WindowsAdapter({ run: async () => ({ [first.id]: { ...absent, exists: true, type: 'Binary', value: [null] } }) });
  const snapshots = await adapter.inspectOperations([first]);
  assert.equal(snapshots[first.id].available, false);
});
