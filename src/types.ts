export type Category = 'gaming' | 'system' | 'privacy' | 'network' | 'visual' | 'cleanup'
export interface Tweak {
  id: string; title: string; description: string; category: Category;
  impact: 'recommended' | 'optional' | 'advanced'; risk: 'low' | 'medium';
  requiresAdmin: boolean; requiresRestart: boolean; benefit: string; caveat: string;
  operation: { kind: 'registry'; hive: 'HKCU' | 'HKLM'; path: string; name: string; value: number | string; type: 'DWord' | 'String' } | { kind: 'service'; name: string; startType: 'Disabled' | 'Manual' } | { kind: 'power'; scheme: string };
}
export interface SystemInfo {
  mode: 'native' | 'demo'; platform: string;
  cpu: { name: string; cores: number; usage: number | null };
  gpu: { name: string; memoryGB: number | null; usage: number | null };
  ram: { totalGB: number; usedGB: number; type: string };
  storage: { totalGB: number; freeGB: number; drives: { name: string; totalGB: number; freeGB: number; type: string }[] };
  os: string; updatedAt: string; admin: boolean;
}
export interface ItemResult { id: string; success: boolean; message: string }
export interface Backup { id: string; createdAt: string; tweakIds: string[]; status: 'applied' | 'partial' | 'restored' | 'failed'; results: ItemResult[] }
export interface OperationResult { success: boolean; backupId?: string; results: ItemResult[]; message: string }
export interface OptimizerAPI {
  getSystemInfo(): Promise<SystemInfo>;
  getTweakStates(): Promise<Record<string, boolean | null>>;
  applyTweaks(ids: string[]): Promise<OperationResult>;
  listBackups(): Promise<Backup[]>;
  restoreBackup(id: string): Promise<OperationResult>;
  windowControl(action: 'minimize' | 'maximize' | 'close'): void;
}
declare global { interface Window { optimizer?: OptimizerAPI } }
