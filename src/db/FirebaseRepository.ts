import { db } from "./index.js";
import { IRepository } from "./IRepository.js";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where } from "firebase/firestore";

/**
 * Firebase implementation of the generic Repository.
 */
export class FirebaseRepository<T extends { id?: string }> implements IRepository<T> {
  private collectionName: string;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
  }

  async getById(id: string): Promise<T | null> {
    const docRef = doc(db, this.collectionName, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() } as T;
  }

  async getAll(): Promise<T[]> {
    const q = collection(db, this.collectionName);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as T));
  }

  async create(data: Omit<T, "id">, id?: string): Promise<T> {
    const colRef = collection(db, this.collectionName);
    const docRef = id ? doc(colRef, id) : doc(colRef);
    
    // Add timestamps
    const now = new Date().toISOString();
    const payload = {
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(docRef, payload);
    return { id: docRef.id, ...payload } as unknown as T;
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const docRef = doc(db, this.collectionName, id);
    const payload = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    
    await updateDoc(docRef, payload);
    
    const updated = await getDoc(docRef);
    return { id: updated.id, ...updated.data() } as T;
  }

  async delete(id: string): Promise<boolean> {
    const docRef = doc(db, this.collectionName, id);
    await deleteDoc(docRef);
    return true;
  }

  async find(queryConditions: { field: string; operator: any; value: any }[]): Promise<T[]> {
    const colRef = collection(db, this.collectionName);
    let constraints = [];
    
    for (const condition of queryConditions) {
      constraints.push(where(condition.field, condition.operator, condition.value));
    }
    
    const q = query(colRef, ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap: any) => ({ id: docSnap.id, ...docSnap.data() } as T));
  }
}
