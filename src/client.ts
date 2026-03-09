import { getCurrentApiKey } from "./auth/context.js";

const BASE_URL = "https://enrichlayer.com";
const TIMEOUT_MS = 30_000;

export async function makeRequest(
  path: string,
  params: Record<string, string | undefined>,
): Promise<unknown> {
  const apiKey = getCurrentApiKey() || process.env.ENRICH_LAYER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ENRICH_LAYER_API_KEY environment variable is not set. " +
        "Get your API key at https://enrichlayer.com/dashboard?utm_source=mcp&utm_medium=integration&utm_campaign=dashboard",
    );
  }

  // Build query string, skipping empty values
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      qs.set(key, value);
    }
  }

  const url = `${BASE_URL}${path}${qs.toString() ? `?${qs.toString()}` : ""}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const body = await response.text();

    if (!response.ok) {
      let detail = body;
      try {
        const parsed = JSON.parse(body);
        detail = parsed.message || parsed.error || body;
      } catch {
        // use raw body
      }
      throw new Error(
        `Enrich Layer API error ${response.status}: ${detail}`,
      );
    }

    return JSON.parse(body);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Enrich Layer API request timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
