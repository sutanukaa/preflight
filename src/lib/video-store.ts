// Client-side IndexedDB store for zero-latency, full-fidelity meeting recordings
// Overcomes Vercel 4.5MB serverless body limit & ephemeral filesystem issues

const DB_NAME = "clarity_meetings_db";
const STORE_NAME = "recordings";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save meeting recording blob to browser IndexedDB
 */
export async function saveRecordingBlob(meetingId: string, blob: Blob): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(blob, meetingId);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to save recording to IndexedDB:", err);
    return false;
  }
}

/**
 * Retrieve meeting recording blob from browser IndexedDB
 */
export async function getRecordingBlob(meetingId: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(meetingId);

      req.onsuccess = () => {
        if (req.result instanceof Blob) {
          resolve(req.result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
