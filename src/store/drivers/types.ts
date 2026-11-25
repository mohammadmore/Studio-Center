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
  /** Moves a finished file into the store without loading it into memory. */
  putFile?(kind: BlobKind, name: string, srcPath: string, mime: string): Promise<void>;
  /** Path on disk for stores that keep files locally (lets big files be streamed). */
  localPath?(kind: BlobKind, name: string): string | null;
}

export interface StorageDriver {
  readonly name: string;
  readonly blobs: BlobStore;
  /** Returns null when nothing has ever been stored. Throws when stored data can't be read. */
  load(): Promise<Snapshot | null>;
  save(data: Snapshot): Promise<void>;
  /**
   * A cheap token that changes whenever the stored data changes (another process may have
   * written it). Drivers that can be shared by several processes implement it.
   */
  version?(): Promise<string | null>;
  close?(): Promise<void>;
}
