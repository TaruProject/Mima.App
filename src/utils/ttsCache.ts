import { voices } from '../constants/voices';

const ALLOWED_VOICE_IDS = new Set(voices.map((v) => v.id));
const DB_NAME = 'mima_tts_cache';
const STORE_NAME = 'audio_blobs';
const DB_VERSION = 1;
const MAX_STORAGE_BYTES = 50 * 1024 * 1024;

interface CacheEntry {
  hash: string;
  voice_id: string;
  blob: Blob;
  created_at: number;
  size_bytes: number;
  last_accessed: number;
}

interface MemoryEntry {
  blob: Blob;
  lastAccessed: number;
  sizeBytes: number;
}

const memoryCache = new Map<string, MemoryEntry>();
let memoryCacheBytes = 0;
const MAX_MEMORY_BYTES = 10 * 1024 * 1024;
let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
          store.createIndex('last_accessed', 'last_accessed', { unique: false });
          store.createIndex('voice_id', 'voice_id', { unique: false });
        }
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        dbInstance.onclose = () => {
          dbInstance = null;
          dbInitPromise = null;
        };
        resolve(dbInstance);
      };

      request.onerror = () => {
        dbInitPromise = null;
        reject(request.error);
      };
    } catch (e) {
      dbInitPromise = null;
      reject(e);
    }
  });

  return dbInitPromise;
}

export async function computeCacheHash(text: string, voiceId: string): Promise<string> {
  const normalized = text.trim().toLowerCase();
  const data = new TextEncoder().encode(normalized + voiceId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isValidVoiceId(voiceId: string): boolean {
  return ALLOWED_VOICE_IDS.has(voiceId);
}

function evictMemoryCache(): void {
  if (memoryCacheBytes <= MAX_MEMORY_BYTES) return;

  const entries = Array.from(memoryCache.entries()).sort(
    (a, b) => a[1].lastAccessed - b[1].lastAccessed
  );

  while (memoryCacheBytes > MAX_MEMORY_BYTES * 0.8 && entries.length > 0) {
    const [key, entry] = entries.shift()!;
    memoryCache.delete(key);
    memoryCacheBytes -= entry.sizeBytes;
  }
}

async function evictIndexedDBIfNeeded(db: IDBDatabase, incomingBytes: number): Promise<void> {
  const totalSize = (await getStorageSize(db)) + incomingBytes;
  if (totalSize <= MAX_STORAGE_BYTES) return;

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('last_accessed');
    const request = index.openCursor();

    let freed = 0;
    const target = totalSize - MAX_STORAGE_BYTES * 0.8;

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && freed < target) {
        const entry = cursor.value as CacheEntry;
        freed += entry.size_bytes;
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getStorageSize(db: IDBDatabase): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result as CacheEntry[];
      const total = entries.reduce((sum, e) => sum + e.size_bytes, 0);
      resolve(total);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getCachedBlob(hash: string): Promise<Blob | null> {
  const memEntry = memoryCache.get(hash);
  if (memEntry) {
    memEntry.lastAccessed = Date.now();
    console.log(`TTS_CACHE_HIT(memory) hash=${hash}`);
    return memEntry.blob;
  }

  try {
    const db = await openDB();
    const entry = await new Promise<CacheEntry | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(hash);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (entry) {
      entry.last_accessed = Date.now();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry);

      memoryCache.set(hash, {
        blob: entry.blob,
        lastAccessed: Date.now(),
        sizeBytes: entry.size_bytes,
      });
      memoryCacheBytes += entry.size_bytes;
      evictMemoryCache();

      console.log(`TTS_CACHE_HIT(idb) hash=${hash}`);
      return entry.blob;
    }
  } catch (e) {
    console.warn('TTS cache IDB read failed, falling back:', e);
  }

  console.log(`TTS_CACHE_MISS hash=${hash}`);
  return null;
}

export async function setCachedBlob(hash: string, voiceId: string, blob: Blob): Promise<void> {
  if (!isValidVoiceId(voiceId)) {
    console.warn(`TTS_CACHE_SKIP: invalid voice_id=${voiceId}`);
    return;
  }

  const sizeBytes = blob.size;
  const now = Date.now();

  memoryCache.set(hash, { blob, lastAccessed: now, sizeBytes });
  memoryCacheBytes += sizeBytes;
  evictMemoryCache();

  try {
    const db = await openDB();
    await evictIndexedDBIfNeeded(db, sizeBytes);

    const entry: CacheEntry = {
      hash,
      voice_id: voiceId,
      blob,
      created_at: now,
      size_bytes: sizeBytes,
      last_accessed: now,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('TTS cache IDB write failed, memory-only:', e);
  }
}

export async function invalidateCacheForVoice(voiceId: string): Promise<void> {
  for (const [key, entry] of memoryCache.entries()) {
    void entry;
    memoryCache.delete(key);
  }
  memoryCacheBytes = 0;

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('TTS cache invalidation failed:', e);
  }
}

export function isOptimizationEnabled(): boolean {
  try {
    const value = localStorage.getItem('mima_tts_optimization');
    return value !== 'legacy';
  } catch {
    return true;
  }
}
