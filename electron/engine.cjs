const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const BACKUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SERVICE_ALLOWLIST = new Set(['DiagTrack', 'MapsBroker', 'WSearch', 'RetailDemo', 'Fax', 'WMPNetworkSvc', 'PhoneSvc', 'RemoteRegistry', 'TrkWks']);
const POWER_ALLOWLIST = new Set(['8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', '381b4222-f694-41f0-9685-ff5bb260df2e']);
const CONTROL_PANEL_ALLOWLIST = new Set(['Control Panel\\Desktop\\WindowMetrics\\MinAnimate', 'Control Panel\\Desktop\\MenuShowDelay', 'Control Panel\\Mouse\\MouseSpeed', 'Control Panel\\Keyboard\\KeyboardDelay']);

function validateCatalog(catalog) {
  if (!Array.isArray(catalog) || catalog.length > 200) throw new Error('Catálogo inválido.');
  const ids = new Set();
  const targets = new Set();
  for (const tweak of catalog) {
    if (!ID.test(tweak.id) || ids.has(tweak.id)) throw new Error('ID de ajuste inválido o duplicado.');
    ids.add(tweak.id);
    const op = tweak.operation;
    if (!op || typeof op !== 'object') throw new Error(`Operación inválida: ${tweak.id}`);
    let target;
    if (op.kind === 'registry') {
      if (!['HKCU', 'HKLM'].includes(op.hive) || !['DWord', 'String'].includes(op.type)
        || typeof op.path !== 'string' || !(op.path.startsWith('Software\\') || (op.hive === 'HKCU' && CONTROL_PANEL_ALLOWLIST.has(`${op.path}\\${op.name}`))) || /[\r\n\0]/.test(op.path)
        || typeof op.name !== 'string' || !op.name || /[\r\n\0]/.test(op.name)
        || (op.type === 'DWord' && (!Number.isInteger(op.value) || op.value < 0 || op.value > 4294967295))
        || (op.type === 'String' && typeof op.value !== 'string')) throw new Error(`Registro inválido: ${tweak.id}`);
      if (/Windows Defender|WindowsFirewall|WindowsUpdate|Security Center|Policies\\System/i.test(`${op.path}\\${op.name}`)) {
        throw new Error('Este catálogo no puede desactivar controles de seguridad.');
      }
      target = `${op.hive}\\${op.path}\\${op.name}`.toLowerCase();
    } else if (op.kind === 'service') {
      if (!SERVICE_ALLOWLIST.has(op.name) || !['Disabled', 'Manual'].includes(op.startType)) throw new Error(`Servicio no permitido: ${tweak.id}`);
      target = `service:${op.name.toLowerCase()}`;
    } else if (op.kind === 'power') {
      if (!POWER_ALLOWLIST.has(op.scheme)) throw new Error(`Plan de energía no permitido: ${tweak.id}`);
      target = 'power:active';
    } else throw new Error(`Operación no soportada: ${tweak.id}`);
    if (targets.has(target)) throw new Error(`Destino duplicado: ${tweak.id}`);
    targets.add(target);
  }
  return catalog;
}

function publicBackup(backup) {
  return { id: backup.id, createdAt: backup.createdAt, tweakIds: backup.tweakIds, status: backup.status, results: backup.results };
}

class OptimizerEngine {
  constructor({ catalog, adapter, backupDir, platform = process.platform }) {
    this.catalog = validateCatalog(catalog);
    this.byId = new Map(catalog.map(tweak => [tweak.id, tweak]));
    this.adapter = adapter;
    this.backupDir = backupDir;
    this.platform = platform;
    this.busy = false;
  }

  async getTweakStates() {
    if (this.platform !== 'win32') return Object.fromEntries(this.catalog.map(t => [t.id, null]));
    const snapshots = await this.adapter.inspectOperations(this.catalog);
    return Object.fromEntries(this.catalog.map(tweak => {
      const snapshot = snapshots[tweak.id];
      if (!snapshot?.available) return [tweak.id, null];
      const op = tweak.operation;
      if (op.kind === 'registry') return [tweak.id, snapshot.exists && snapshot.type === op.type && snapshot.value === op.value];
      if (op.kind === 'service') return [tweak.id, snapshot.startType === op.startType];
      return [tweak.id, String(snapshot.scheme).toLowerCase() === op.scheme.toLowerCase()];
    }));
  }

  async writeBackup(backup) {
    await fs.mkdir(this.backupDir, { recursive: true, mode: 0o700 });
    const target = path.join(this.backupDir, `${backup.id}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(backup, null, 2));
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporary, target);
    } catch (error) {
      await handle?.close().catch(() => {});
      await fs.unlink(temporary).catch(() => {});
      throw error;
    }
  }

  async readBackup(id) {
    if (typeof id !== 'string' || !BACKUP_ID.test(id)) throw new Error('Identificador de respaldo inválido.');
    const backup = JSON.parse(await fs.readFile(path.join(this.backupDir, `${id}.json`), 'utf8'));
    if (backup.version !== 1 || backup.id !== id || !Array.isArray(backup.tweakIds) || !backup.tweakIds.length || !backup.snapshots || !backup.operations
      || new Set(backup.tweakIds).size !== backup.tweakIds.length
      || !backup.tweakIds.every(tweakId => this.byId.has(tweakId) && backup.snapshots[tweakId]?.available === true
        && isDeepStrictEqual(backup.operations[tweakId], this.byId.get(tweakId).operation))
      || typeof backup.createdAt !== 'string' || Number.isNaN(Date.parse(backup.createdAt))
      || !['applied', 'partial', 'restored', 'failed'].includes(backup.status)
      || !Array.isArray(backup.results) || backup.results.some(result => !backup.tweakIds.includes(result.id) || typeof result.success !== 'boolean' || typeof result.message !== 'string')
      || !Array.isArray(backup.restoredIds) || new Set(backup.restoredIds).size !== backup.restoredIds.length
      || backup.restoredIds.some(tweakId => !backup.tweakIds.includes(tweakId))) throw new Error('Respaldo incompatible o dañado; no se modificó el sistema.');
    return backup;
  }

  async listBackups() {
    let files;
    try { files = await fs.readdir(this.backupDir); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const backups = [];
    for (const filename of files) {
      if (!filename.endsWith('.json') || !BACKUP_ID.test(filename.slice(0, -5))) continue;
      try { backups.push(publicBackup(await this.readBackup(filename.slice(0, -5)))); }
      catch { /* Incomplete or unrelated files are not executable restore points. */ }
    }
    return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async applyTweaks(ids) {
    if (this.platform !== 'win32') return { success: false, results: [], message: 'Los ajustes reales solo están disponibles en la aplicación para Windows.' };
    if (this.busy) throw new Error('Ya hay una operación en curso.');
    if (!Array.isArray(ids) || !ids.length || ids.length > this.catalog.length || new Set(ids).size !== ids.length || ids.some(id => !this.byId.has(id))) {
      throw new Error('Selecciona ajustes válidos y sin duplicados.');
    }
    this.busy = true;
    let backup;
    try {
      const tweaks = ids.map(id => this.byId.get(id));
      const snapshots = await this.adapter.inspectOperations(tweaks);
      const unavailable = tweaks.filter(t => !snapshots[t.id]?.available);
      if (unavailable.length) return { success: false, results: unavailable.map(t => ({ id: t.id, success: false, message: snapshots[t.id]?.message || 'No se pudo respaldar el estado original.' })), message: 'No se aplicaron cambios: todos los ajustes necesitan un respaldo válido.' };
      const newest = (await this.listBackups())[0];
      // Preserve transaction order even within one millisecond or after a clock adjustment.
      const createdAt = new Date(Math.max(Date.now(), newest ? Date.parse(newest.createdAt) + 1 : 0)).toISOString();
      backup = { version: 1, id: randomUUID(), createdAt, tweakIds: ids, operations: Object.fromEntries(tweaks.map(t => [t.id, t.operation])), snapshots, status: 'partial', results: ids.map(id => ({ id, success: false, message: 'Aplicación pendiente; estado original respaldado.' })), restoredIds: [] };
      // Persist and fsync original values before the first OS mutation.
      await this.writeBackup(backup);
      let results;
      try { results = await this.adapter.applyOperations(tweaks); }
      catch (error) { results = ids.map(id => ({ id, success: false, message: `No se pudo confirmar el resultado: ${error.message}. Puedes restaurar el respaldo.` })); }
      backup.results = this.normalizeResults(ids, results);
      const count = backup.results.filter(result => result.success).length;
      // A failed verification or a timeout can follow a successful OS write.
      // Keep every incomplete attempt recoverable rather than claiming no changes occurred.
      backup.status = count === ids.length ? 'applied' : 'partial';
      try { await this.writeBackup(backup); }
      catch { return { success: false, backupId: backup.id, results: backup.results, message: 'El respaldo original está guardado, pero no se pudo actualizar su estado. Revisa y restaura desde Historial si hace falta.' }; }
      return { success: count === ids.length, backupId: backup.id, results: backup.results, message: count === ids.length ? `${count} ajustes aplicados. Algunos necesitan reiniciar Windows.` : `${count} de ${ids.length} ajustes confirmados. Puede haber cambios sin confirmar; el respaldo permite restaurar el estado anterior.` };
    } finally { this.busy = false; }
  }

  normalizeResults(ids, results) {
    return ids.map(id => {
      const result = Array.isArray(results) && results.find(item => item.id === id);
      return { id, success: result?.success === true, message: typeof result?.message === 'string' ? result.message : 'El sistema no confirmó el resultado. Restaura el respaldo si es necesario.' };
    });
  }

  async restoreBackup(id) {
    if (this.platform !== 'win32') return { success: false, results: [], message: 'La restauración real solo está disponible en Windows.' };
    if (this.busy) throw new Error('Ya hay una operación en curso.');
    this.busy = true;
    try {
      const backup = await this.readBackup(id);
      if (backup.status === 'restored') return { success: true, backupId: id, results: [], message: 'Este respaldo ya fue restaurado.' };
      const latestPending = (await this.listBackups()).find(item => item.status !== 'restored');
      if (!latestPending || latestPending.id !== id) throw new Error('Restaura primero el respaldo más reciente para conservar el orden de los cambios.');
      const restoredIds = new Set(backup.restoredIds || []);
      const ids = backup.tweakIds.filter(tweakId => !restoredIds.has(tweakId)).reverse();
      const entries = ids.map(tweakId => ({ ...this.byId.get(tweakId), snapshot: backup.snapshots[tweakId] }));
      if (entries.some(entry => !entry.snapshot?.available)) throw new Error('El respaldo está incompleto; no se restauró ningún ajuste.');
      let result;
      try { result = await this.adapter.restoreSnapshots(entries); }
      catch (error) { result = ids.map(tweakId => ({ id: tweakId, success: false, message: error.message })); }
      const results = this.normalizeResults(ids, result);
      results.filter(item => item.success).forEach(item => restoredIds.add(item.id));
      backup.restoredIds = [...restoredIds];
      backup.restoreResults = results;
      backup.status = restoredIds.size === backup.tweakIds.length ? 'restored' : 'partial';
      await this.writeBackup(backup);
      return { success: backup.status === 'restored', backupId: id, results, message: backup.status === 'restored' ? 'Estado anterior restaurado. Reinicia Windows para completar los cambios que lo requieran.' : 'Restauración parcial. Revisa los permisos y vuelve a intentarlo.' };
    } finally { this.busy = false; }
  }
}

module.exports = { OptimizerEngine, validateCatalog, publicBackup };
