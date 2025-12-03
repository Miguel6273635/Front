import { runMigrations } from './migrations';
export async function initOffline(){ await runMigrations(); }
