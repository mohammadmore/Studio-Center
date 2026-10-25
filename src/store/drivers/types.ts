import type { Snapshot } from "../state.js";

export type BlobKind = "uploads" | "fonts";

export interface StoredBlob {
  buffer: Buffer;
  mime: string;
}

export interface BlobStore {
  put(kind: BlobKind, name: string, buffer: Buffer, mime: string): Promise<void>;
  get(kind: BlobKind, name: string): Promise<StoredBlob | null>;
  delete(kind: BlobKind, name: string): Promise<void>;
  list(kind: BlobKind): Promise<string[]>;
}

export interface StorageDriver {
  readonly name: string;
  readonly blobs: BlobStore;
  /** Returns null when nothing has ever been stored. Throws when stored data can't be read. */
  load(): Promise<Snapshot | null>;
  save(data: Snapshot): Promise<void>;
  close?(): Promise<void>;
}
