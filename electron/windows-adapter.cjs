const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

function executePowerShell(script, payload = null, { timeout = 120000, execute = execFile } = {}) {
  const executable = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const preamble = "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; [Console]::InputEncoding = New-Object System.Text.UTF8Encoding; $inputData = ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd());\n";
  const encoded = Buffer.from(preamble + script, 'utf16le').toString('base64');
  if (encoded.length > 31000) return Promise.reject(new Error('El comando supera el límite seguro de Windows.'));
  return new Promise((resolve, reject) => {
    const child = execute(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8', shell: false,
    }, (error, stdout, stderr) => {
      if (error) return reject(new Error(error.killed ? 'Windows tardó demasiado en responder; revisa el respaldo antes de reintentar.' : String(stderr || error.message).slice(0, 1500)));
      try { resolve(JSON.parse(String(stdout).replace(/^\uFEFF/, '').trim())); }
      catch { reject(new Error('Windows devolvió una respuesta que no se pudo interpretar.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(payload));
  });
}

function validateSnapshot(snapshot, operation) {
  if (!snapshot?.available || snapshot.kind !== operation.kind) throw new Error('Estado original incompatible.');
  if (operation.kind === 'registry') {
    if (typeof snapshot.exists !== 'boolean' || typeof snapshot.keyExisted !== 'boolean') throw new Error('Respaldo de registro inválido.');
    if (!snapshot.exists) return;
    const allowed = ['DWord', 'QWord', 'String', 'ExpandString', 'MultiString', 'Binary', 'None'];
    if (!allowed.includes(snapshot.type)) throw new Error('Tipo de registro no compatible.');
    if (snapshot.type === 'DWord' && (!Number.isInteger(snapshot.value) || snapshot.value < 0 || snapshot.value > 4294967295)) throw new Error('DWORD original inválido.');
    if (snapshot.type === 'QWord' && (typeof snapshot.value !== 'string' || !/^-?\d{1,19}$/.test(snapshot.value))) throw new Error('QWORD original inválido.');
    if (['String', 'ExpandString'].includes(snapshot.type) && typeof snapshot.value !== 'string') throw new Error('Cadena original inválida.');
    if (snapshot.type === 'MultiString' && (!Array.isArray(snapshot.value) || snapshot.value.some(v => typeof v !== 'string'))) throw new Error('MultiString original inválido.');
    if (['Binary', 'None'].includes(snapshot.type) && (!Array.isArray(snapshot.value) || snapshot.value.some(v => !Number.isInteger(v) || v < 0 || v > 255))) throw new Error('Valor binario original inválido.');
  } else if (operation.kind === 'service') {
    if (!['Automatic', 'Manual', 'Disabled'].includes(snapshot.startType) || typeof snapshot.delayedAuto !== 'boolean') throw new Error('Respaldo del servicio inválido.');
  } else if (typeof snapshot.scheme !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(snapshot.scheme)) throw new Error('Plan original inválido.');
}

class WindowsAdapter {
  constructor({ run = executePowerShell } = {}) { this.run = run; }

  async script(name) { return fs.readFile(path.join(__dirname, 'powershell', `${name}.ps1`), 'utf8'); }

  async inspectOperations(tweaks) {
    const snapshots = await this.run(await this.script('inspect'), tweaks.map(t => ({ id: t.id, operation: t.operation })));
    if (!snapshots || typeof snapshots !== 'object' || Array.isArray(snapshots)) throw new Error('Windows no devolvió estados válidos.');
    for (const tweak of tweaks) {
      if (!snapshots[tweak.id]?.available) continue;
      try { validateSnapshot(snapshots[tweak.id], tweak.operation); }
      catch (error) { snapshots[tweak.id] = { available: false, message: error.message }; }
    }
    return snapshots;
  }

  async applyOperations(tweaks) {
    return this.run(await this.script('apply'), tweaks.map(t => ({ id: t.id, operation: t.operation })));
  }

  async restoreSnapshots(entries) {
    for (const entry of entries) validateSnapshot(entry.snapshot, entry.operation);
    return this.run(await this.script('restore'), entries.map(t => ({ id: t.id, operation: t.operation, snapshot: t.snapshot })));
  }

  async getSystemInfo() { return this.run(await this.script('hardware'), null, { timeout: 30000 }); }
}

module.exports = { WindowsAdapter, executePowerShell, validateSnapshot };
