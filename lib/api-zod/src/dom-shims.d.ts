// Orval emits File/Blob for multipart OpenAPI fields. These declarations let
// the generated Zod package typecheck in Node without enabling the full DOM lib.
declare class Blob {
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  slice(start?: number, end?: number, contentType?: string): Blob;
  text(): Promise<string>;
}

declare class File extends Blob {
  readonly lastModified: number;
  readonly name: string;
}
