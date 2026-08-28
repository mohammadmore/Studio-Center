/**
 * Base interface for all database repositories.
 * This ensures that if you switch from Firebase to PostgreSQL/MongoDB,
 * the application logic won't need to change. You just swap the repository implementation.
 */
export interface IRepository<T> {
  getById(id: string): Promise<T | null>;
  getAll(): Promise<T[]>;
  create(data: Omit<T, "id">, id?: string): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  find(query: any): Promise<T[]>;
}
