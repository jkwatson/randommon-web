import { loadMonsterDB } from './monsters.js';

let _db = null;
let _pending = null;

export async function ensureDB() {
  if (_db) return _db;
  if (!_pending) _pending = loadMonsterDB().then(db => { _db = db; return db; });
  return _pending;
}

export function getDB() { return _db; }
