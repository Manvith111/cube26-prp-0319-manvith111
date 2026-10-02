// AI orchestrator: run a vision prompt against the configured credentials,
// failing over from one key/provider to the next.
//
// Order of attempts = the enabled credentials as configured. A key that is
// quota-limited, invalid, or erroring is skipped and the next one is tried
// immediately (so multiple keys/providers work "simultaneously" as a pool).
// Only if EVERY credential is quota-limited do we wait once (honoring the
// server's suggested delay) and retry the whole pool — a transient per-minute
// spike then recovers without surfacing an error.

import { getEnabledCredentials } from "../settings";
import { getProvider } from "./registry";
import { AiError, type AiCallResult, type PhotoInput } from "./types";

export { AiError } from "./types";
export type { AiCallResult, PhotoInput, ProviderId, AiCredential } from "./types";
export { PROVIDERS, providerMetas, isProviderId, PROVIDER_IDS } from "./registry";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const MAX_QUOTA_WAIT_MS = 15_000; // cap a single wait so we stay within route timeouts

function kindOf(e: unknown): AiError["kind"] {
  return e instanceof AiError ? e.kind : "other";
}
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class NoCredentialsError extends Error {
  constructor() {
    super("No AI provider is configured. Add a key on the Settings page.");
    this.name = "NoCredentialsError";
  }
}

/**
 * Call the first credential that succeeds. Throws NoCredentialsError when none
 * are configured, the content-block error when a provider refuses the content
 * (that would repeat everywhere), or the last error after the pool is exhausted.
 */
export async function callAi(
  system: string,
  userText: string,
  photos: PhotoInput[],
): Promise<AiCallResult> {
  const creds = getEnabledCredentials();
  if (creds.length === 0) throw new NoCredentialsError();

  let lastError: unknown = new Error("AI call failed.");

  for (let pass = 0; pass < 2; pass++) {
    let quotaWait: number | undefined;

    for (const cred of creds) {
      try {
        const text = await getProvider(cred.provider).generate(cred, system, userText, photos);
        return { text, provider: cred.provider, model: cred.model, credentialId: cred.id };
      } catch (e) {
        lastError = e;
        const kind = kindOf(e);
        if (kind === "blocked") throw e; // same outcome on every provider
        if (kind === "quota" && e instanceof AiError && e.retryAfterMs) {
          quotaWait = Math.max(quotaWait ?? 0, e.retryAfterMs);
        }
        // auth / other / quota: move on to the next credential.
      }
    }

    // One backoff retry only if the whole pool was quota-limited.
    if (pass === 0 && quotaWait !== undefined) {
      await sleep(Math.min(quotaWait + 250, MAX_QUOTA_WAIT_MS));
      continue;
    }
    break;
  }

  throw new Error(messageOf(lastError));
}
