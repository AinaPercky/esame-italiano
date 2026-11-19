export type WrittenExamLocalDraft = {
  attemptId: string;
  answers: Record<string, unknown>;
  currentIndex: number;
  updatedAt: string;
};

const DATABASE_NAME = 'perckylingua-written-exams';
const STORE_NAME = 'attempt-drafts';
const DATABASE_VERSION = 1;

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('Le stockage local sécurisé n’est pas disponible dans ce navigateur.'));
    return;
  }
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'attemptId' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Ouverture du stockage local impossible.'));
  request.onblocked = () => reject(new Error('Le stockage local est bloqué par un autre onglet.'));
});

export const saveWrittenExamDraft = async (
  attemptId: string,
  answers: Record<string, unknown>,
  currentIndex: number
): Promise<void> => {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        attemptId,
        answers,
        currentIndex,
        updatedAt: new Date().toISOString()
      } satisfies WrittenExamLocalDraft);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Écriture locale impossible.'));
      transaction.onabort = () => reject(transaction.error || new Error('Écriture locale annulée.'));
    });
  } finally {
    database.close();
  }
};

export const loadWrittenExamDraft = async (attemptId: string): Promise<WrittenExamLocalDraft | null> => {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(attemptId);
      request.onsuccess = () => resolve((request.result as WrittenExamLocalDraft | undefined) || null);
      request.onerror = () => reject(request.error || new Error('Lecture du brouillon local impossible.'));
    });
  } finally {
    database.close();
  }
};

export const deleteWrittenExamDraft = async (attemptId: string): Promise<void> => {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(attemptId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Suppression du brouillon local impossible.'));
      transaction.onabort = () => reject(transaction.error || new Error('Suppression locale annulée.'));
    });
  } finally {
    database.close();
  }
};
