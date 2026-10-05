/**
 * Type surface for the platform-split on-device classifier.
 *
 * The implementation lives in `local-classifier.native.ts` (iOS/Android, real
 * TF.js MobileNetV2) and `local-classifier.web.ts` (browser stub). Metro picks
 * the correct file per platform; TypeScript needs this declaration to resolve
 * the extensionless `./local-classifier` import.
 *
 * This file is types-only and is never bundled.
 */
import type { AnalyzeResult } from "@/services/inference";

export declare const LOCAL_MODEL_REVISION: string;

export interface LocalClassifier {
  runner(uri: string): Promise<AnalyzeResult>;
}

/** Resolves to null when the on-device classifier is unavailable. */
export declare function classifyLocally(uri: string): Promise<AnalyzeResult | null>;
