/**
 * On-device fallback classifier - WEB STUB.
 *
 * Metro resolves this file for web builds, so @tensorflow/tfjs is never pulled
 * into the browser bundle.
 *
 * Why this must stay a stub: @tensorflow/tfjs's threaded WASM worker backend
 * evaluates `new SharedArrayBuffer(...)` while its module graph initialises.
 * Browsers only expose SharedArrayBuffer to cross-origin-isolated documents
 * (which require COOP/COEP response headers), so on ordinary hosting it is
 * undefined. That raised an *uncaught* ReferenceError during module
 * evaluation, which killed the React tree before it rendered - the installed
 * PWA showed a black screen on every screen, not only the scanner.
 *
 * Web photo analysis uses the ZeroGPU Space (EXPO_PUBLIC_ZEROGPU_URL) instead.
 */
import type { AnalyzeResult } from "@/services/inference";

export const LOCAL_MODEL_REVISION = "none/web";

export interface LocalClassifier {
  runner(uri: string): Promise<AnalyzeResult>;
}

/** Always unavailable on web; callers fall through to their own error path. */
export async function classifyLocally(_uri: string): Promise<AnalyzeResult | null> {
  return null;
}
