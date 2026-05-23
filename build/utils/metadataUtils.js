import * as fs from "fs";
import * as path from "path";
/**
 * Persist a JSON sidecar describing the generation request alongside the
 * generated file. Gated on the existing SAVE_METADATA env (see src/index.ts).
 * On error, gated on SAVE_METADATA_FAILED. No-op when either env is "false".
 *
 * Restored from the upstream rename: generateImage{Core,Ultra,SD35}.ts
 * import { saveMetadata } from "../utils/metadataUtils.js" but the module
 * was missing from main when SD-Ultra landed. This restores it as a small
 * stable utility so the build succeeds and metadata behaviour matches
 * what the index env defaults already advertise.
 */
export function saveMetadata(imageFilePath, requestParams, response, error) {
    const isError = error !== undefined;
    const flag = isError ? process.env.SAVE_METADATA_FAILED : process.env.SAVE_METADATA;
    if (flag === "false") {
        return;
    }
    const dir = path.dirname(imageFilePath);
    const base = path.basename(imageFilePath, path.extname(imageFilePath));
    const sidecar = path.join(dir, `${base}.metadata.json`);
    const payload = {
        imageFilePath,
        requestParams,
        timestamp: new Date().toISOString(),
    };
    if (response !== undefined) {
        payload.response = response;
    }
    if (error !== undefined) {
        payload.error = error instanceof Error
            ? { message: error.message, stack: error.stack }
            : String(error);
    }
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(sidecar, JSON.stringify(payload, null, 2));
    }
    catch (writeErr) {
        // Never let metadata sidecar failures break the request flow.
        console.error(`[metadataUtils] failed to write ${sidecar}:`, writeErr);
    }
}
