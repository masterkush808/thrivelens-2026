/**
 * Type surface for the platform-split multipart upload transport.
 *
 * Metro resolves `./upload` to `upload.native.ts` (expo-file-system UploadTask)
 * or `upload.web.ts` (fetch + FormData). TypeScript needs this declaration to
 * resolve the extensionless import.
 *
 * Types-only; never bundled.
 */
export interface MultipartField {
  name: string;
  value: string;
}

export interface MultipartUploadOptions {
  /** Local file path on native, blob:/data: URL on web. */
  uri: string;
  fileFieldName: string;
  mimeType: string;
  headers?: Record<string, string>;
  fields?: MultipartField[];
  timeoutMs: number;
}

export interface MultipartUploadResult {
  status: number;
  body: string;
}

/** Rejects with `Error("upload-timeout")` if the timeout elapses first. */
export declare function multipartUpload(
  url: string,
  options: MultipartUploadOptions,
): Promise<MultipartUploadResult>;

export declare const isWebRuntime: boolean;
