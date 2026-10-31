import catalog from './data/tweaks.json'
import type { Backup, OptimizerAPI, SystemInfo } from './types'

const KEY = 'maximo-fps-demo-v1'
interface DemoData { active: string[]; backups: Backup[]; snapshots: Record<string, string[]> }
function read(): DemoData {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null') as DemoData | null
    if (saved && Array.isArray(saved.active) && Array.isArray(saved.backups) && saved.snapshots && typeof saved.snapshots === 'object') return saved
  } catch { /* A damaged or unavailable local store must not prevent startup. */ }
  return { active: [], backups: [], snapshots: {} }
}
function write(data: DemoData) { localStorage.setItem(KEY, JSON.stringify(data)) }
export const demoInfo: SystemInfo = {
  mode: 'demo', platform: 'browser', cpu: { name: 'Intel Core i5-9400F', cores: 6, usage: 14 },
  gpu: { name: 'AMD Radeon RX 560', memoryGB: 4, usage: 8 },
  ram: { totalGB: 16, usedGB: 5.2, type: 'DDR4' },
  storage: { totalGB: 1600, freeGB: 964, drives: [{ name: 'Disco local (C:)', totalGB: 512, freeGB: 286, type: 'SSD' }, { name: 'Biblioteca (D:)', totalGB: 1088, freeGB: 678, type: 'HDD' }] },
  os: 'Windows 11 · perfil de ejemplo', updatedAt: '', admin: false,
}
export const demoAPI: OptimizerAPI = {
  async getSystemInfo() { return { ...demoInfo, updatedAt: new Date().toISOString() } },
  async getTweakStates() { const data = read(); return Object.fromEntries(catalog.map(t => [t.id, data.active.includes(t.id)])) },
  async listBackups() { return read().backups },
  async applyTweaks(ids) {
    const valid = new Set(catalog.map(t => t.id))
    if (!ids.length || ids.some(id => !valid.has(id))) throw new Error('La selección no es válida.')
    const data = read()
    const id = crypto.randomUUID()
    const results = ids.map(id => ({ id, success: true, message: 'Simulado. No se modificó Windows.' }))
    data.snapshots[id] = [...data.active]
    data.active = [...new Set([...data.active, ...ids])]
    data.backups.unshift({ id, createdAt: new Date().toISOString(), tweakIds: ids, status: 'applied', results })
    write(data)
    return { success: true, backupId: id, results, message: `${ids.length} ajustes simulados. Tu equipo no ha sido modificado.` }
  },
  async restoreBackup(id) {
    const data = read()
    const backup = data.backups.find(b => b.id === id)
    if (!backup || !data.snapshots[id] || backup.status === 'restored') throw new Error('Esta copia ya no está disponible.')
    const latest = data.backups.find(b => b.status !== 'restored')
    if (latest?.id !== id) throw new Error('Restaura primero la copia más reciente para conservar el orden de los cambios.')
    data.active = data.snapshots[id]
    backup.status = 'restored'
    write(data)
    return { success: true, results: backup.tweakIds.map(id => ({ id, success: true, message: 'Estado de demostración restaurado.' })), message: 'Simulación restaurada al estado anterior.' }
  },
  windowControl() {},
}

export function formatStorage(gb: number) { return gb >= 1000 ? `${(gb / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} TB` : `${Math.round(gb)} GB` }
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'No se pudo completar la operación. Inténtalo de nuevo.' }
