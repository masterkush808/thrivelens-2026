/**
 * Multipart upload transport - WEB.
 *
 * expo-file-system has no web implementation: its legacy UploadTask calls
 * `ExponentFileSystem.uploadTaskStartAsync`, which does not exist in the web
 * shim, so every upload threw
 *
 *   UnavailabilityError: The method or property expo-file-system.uploadTaskStartAsync
 *   is not available on web, are you sure you've linked all the native
 *   dependencies properly?
 *
 * The browser equivalent is fetch() with a FormData body. expo-image-picker on
 * web returns blob: URIs, so the blob can be attached directly.
 */
import { Platform } from "react-native";

import type {
  MultipartUploadOptions,
  MultipartUploadResult,
} from "./upload";

export async function multipartUpload(
  url: string,
  options: MultipartUploadOptions,
): Promise<MultipartUploadResult> {
  const blob = await resolveBlob(options.uri, options.mimeType);

  const form = new FormData();
  for (const field of options.fields ?? []) {
    form.append(field.name, field.value);
  }
  form.append(
    options.fileFieldName,
    blob,
    // Preserve a filename: the Space reads the extension to decide the decoder.
    filenameFor(options.uri, options.mimeType),
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      // Content-Type must be left unset so the browser adds the multipart
      // boundary itself.
      headers: options.headers ?? {},
      body: form,
      signal: controller.signal,
    });
    const body = await response.text();
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("upload-timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** Best-effort filename; Gradio only inspects the extension. */
function filenameFor(uri: string, mimeType: string): string {
  const withoutQuery = uri.split("?")[0] ?? uri;
  const match = /\.([a-z0-9]{2,5})$/i.exec(withoutQuery);
  if (match) {
    return `upload.${match[1].toLowerCase()}`;
  }
  return `upload.${EXTENSION_BY_MIME[mimeType] ?? "jpg"}`;
}

async function resolveBlob(uri: string, mimeType: string): Promise<Blob> {
  // react-native-web and native both hand out blob:/data: URIs for picked
  // images. fetch() understands both, which keeps this a single code path.
  if (uri.startsWith("blob:") || uri.startsWith("data:")) {
    const response = await fetch(uri);
    const blob = await response.blob();
    return blob.type ? blob : new Blob([blob], { type: mimeType });
  }

  // A remote URL: hand it to fetch and let the browser stream it.
  const response = await fetch(uri);
  const blob = await response.blob();
  return blob.type ? blob : new Blob([blob], { type: mimeType });
}

/** True when the runtime is a browser. Useful for platform guards in callers. */
export const isWebRuntime = Platform.OS === "web";
