const OFF_API_BASE = "https://world.openfoodfacts.org/api/v0";

export interface OffNutriments {
  energyKcal100g: number | null;
  protein100g: number | null;
  fat100g: number | null;
  carbs100g: number | null;
  fiber100g: number | null;
}

export interface OffProduct {
  barcode: string;
  productName: string;
  brand: string | null;
  quantity: string | null;
  imageUrl: string | null;
  nutriments: OffNutriments;
}

export interface OffLookupResult {
  product: OffProduct;
  missingFields: string[];
}

export type OffErrorCode = "network" | "timeout" | "http" | "not_found";

export class OffError extends Error {
  code: OffErrorCode;
  constructor(code: OffErrorCode, message: string) {
    super(message);
    this.name = "OffError";
    this.code = code;
  }
}

async function requestBarcode(barcode: string): Promise<Record<string, unknown>> {
  const url =
    `${OFF_API_BASE}/product/${encodeURIComponent(barcode)}.json` +
    `?fields=product_name,brands,quantity,image_url,nutriments`;

  let lastError: OffError | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (response.status === 404) {
          throw new OffError("not_found", "No nutrition information found for this barcode.");
        }
        if (!response.ok) {
          throw new OffError("http", `Product information lookup failed (${response.status})`);
        }
        const payload = (await response.json()) as {
          status?: number;
          product?: Record<string, unknown> | null;
        };
        if (payload.status === 0 || !payload.product) {
          throw new OffError("not_found", "No nutrition information found for this barcode.");
        }
        return payload.product ?? {};
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      if (error instanceof OffError) {
        lastError = error;
        if (error.code !== "timeout" && error.code !== "network") {
          throw error;
        }
      } else if (error instanceof Error && error.name === "AbortError") {
        lastError = new OffError("timeout", "The product lookup timed out");
      } else {
        lastError = new OffError("network", "The product database is unreachable right now");
      }
    }
  }
  throw lastError ?? new OffError("network", "The product database is unreachable right now");
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function lookupProductByBarcode(barcode: string): Promise<OffLookupResult> {
  const product = await requestBarcode(barcode);
  const nutriments = (product.nutriments ?? {}) as Record<string, unknown>;

  const energyKcal100g =
    num(nutriments["energy-kcal_100g"]) ?? num(nutriments["energy-kcal"]);
  if (energyKcal100g === null) {
    throw new OffError("http", "This product has no energy information available.");
  }

  const offNutriments: OffNutriments = {
    energyKcal100g,
    protein100g: num(nutriments["proteins_100g"]) ?? 0,
    fat100g: num(nutriments["fat_100g"]) ?? 0,
    carbs100g: num(nutriments["carbohydrates_100g"]) ?? 0,
    fiber100g: num(nutriments["fiber_100g"]),
  };

  const missingFields = ["energy_kcal"]
    .concat(
      (["protein", "fat", "carbs"] as const).filter(
        (key) => offNutriments[`${key}100g`] === null || offNutriments[`${key}100g`] === 0,
      ),
    )
    .filter((field) => field !== "energy_kcal");

  const productName =
    typeof product.product_name === "string" && product.product_name.trim() !== ""
      ? product.product_name.trim()
      : typeof product.generic_name === "string" && product.generic_name.trim() !== ""
        ? product.generic_name.trim()
        : `Product ${barcode}`;

  const brand =
    typeof product.brands === "string" && product.brands.trim() !== ""
      ? product.brands.trim()
      : null;

  return {
    product: {
      barcode,
      productName,
      brand,
      quantity:
        typeof product.quantity === "string" && product.quantity.trim() !== ""
          ? product.quantity.trim()
          : null,
      imageUrl:
        typeof product.image_url === "string" && product.image_url.trim() !== ""
          ? product.image_url.trim()
          : null,
      nutriments: offNutriments,
    },
    missingFields,
  };
}

export function validBarcode(barcode: string): boolean {
  const digits = barcode.replace(/\D/g, "");
  if (digits.length !== 8 && digits.length !== 13) return false;
  const check = Number.parseInt(digits[digits.length - 1], 10);
  const body = digits.slice(0, -1).split("").reverse();
  let total = 0;
  for (let i = 0; i < body.length; i += 1) {
    const digit = Number.parseInt(body[i], 10);
    total += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (total % 10)) % 10 === check;
}