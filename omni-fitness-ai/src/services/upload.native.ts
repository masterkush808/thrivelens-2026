/**
 * Multipart upload transport - NATIVE.
 *
 * Uses expo-file-system's UploadTask, which streams the file from disk so a
 * large photo never has to be read into JS memory.
 */
import * as FileSystem from "expo-file-system/legacy";

export interface MultipartField {
  name: string;
  value: string;
}

export interface MultipartUploadOptions {
  /** Path to a local file, e.g. `file:///...jpg`. */
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

export async function multipartUpload(
  url: string,
  options: MultipartUploadOptions,
): Promise<MultipartUploadResult> {
  const parameters: Record<string, string> = {};
  for (const field of options.fields ?? []) {
    parameters[field.name] = field.value;
  }

  const task = FileSystem.createUploadTask(url, options.uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: options.fileFieldName,
    mimeType: options.mimeType,
    ...(options.headers ? { headers: options.headers } : {}),
    ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      void task.cancelAsync();
      resolve(null);
    }, options.timeoutMs);
  });

  const result = await Promise.race([task.uploadAsync(), timeout]);
  if (timer) {
    clearTimeout(timer);
  }
  if (!result) {
    throw new Error("upload-timeout");
  }
  return { status: result.status, body: result.body };
}
