import { FilesystemResourceClient } from "./filesystemResourceClient.js";
import { GcsResourceClient } from "./gcsResourceClient.js";
import { GcsClient } from "../gcs/gcsClient.js";
let instance = null;
export function initializeResourceClient(config) {
    if (instance) {
        throw new Error("ResourceClient has already been initialized");
    }
    if (config.type === "filesystem") {
        instance = new FilesystemResourceClient(config.imageStorageDirectory);
    }
    else {
        const gcsClient = new GcsClient(config.gcsConfig);
        instance = new GcsResourceClient(gcsClient);
    }
}
export function getResourceClient() {
    if (!instance) {
        throw new Error("ResourceClient has not been initialized");
    }
    return instance;
}
