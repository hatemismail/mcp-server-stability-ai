import { ResourceClient } from "./resourceClient.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
export class GcsResourceClient extends ResourceClient {
    gcsClient;
    tempDir;
    ipAddress;
    constructor(gcsClient) {
        super();
        this.gcsClient = gcsClient;
        this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stability-ai-mcp-server-gcs-resource-"));
    }
    getPrefix(context) {
        // SSE mode partitions objects by requestor IP. In stdio mode there
        // is no incoming HTTP request, so fall back to GCS_PATH_PREFIX (or
        // empty) instead of the literal string "undefined/".
        if (context?.requestorIpAddress) {
            return context.requestorIpAddress + "/";
        }
        const envPrefix = process.env.GCS_PATH_PREFIX;
        if (!envPrefix) {
            return "";
        }
        return envPrefix.endsWith("/") ? envPrefix : envPrefix + "/";
    }
    filenameToUri(filename, context) {
        return `https://storage.googleapis.com/${this.gcsClient.bucketName}/${this.getPrefix(context)}${filename}`;
    }
    uriToFilename(uri, context) {
        return uri.replace(`https://storage.googleapis.com/${this.gcsClient.bucketName}/${this.getPrefix(context)}`, "");
    }
    async listResources(context) {
        const files = await this.gcsClient.listFiles(this.getPrefix(context));
        return files.map((file) => {
            const uri = this.filenameToUri(file.name, context);
            const nameWithoutPrefix = file.name.replace(this.getPrefix(context), "");
            return {
                uri,
                name: nameWithoutPrefix,
                mimeType: this.getMimeType(nameWithoutPrefix),
            };
        });
    }
    async readResource(uri, context) {
        try {
            const filename = this.uriToFilename(uri, context);
            const tempFilePath = path.join(this.tempDir, filename);
            await this.gcsClient.downloadFile(this.getPrefix(context) + filename, tempFilePath);
            const content = await fs.promises.readFile(tempFilePath);
            const base64Content = content.toString("base64");
            // Clean up temp file
            fs.unlinkSync(tempFilePath);
            return {
                uri,
                name: filename,
                blob: base64Content,
                mimeType: this.getMimeType(filename),
            };
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to read resource: ${error.message}`);
            }
            throw new Error("Failed to read resource: Unknown error");
        }
    }
    async createResource(uri, base64image, context) {
        const filename = this.uriToFilename(uri, context);
        if (!filename) {
            throw new Error("Invalid file path");
        }
        const [name, ext] = filename.split(".");
        const randomString = Math.random().toString(36).substring(2, 7);
        const finalFilename = `${name}-${randomString}.${ext}`;
        // Write to temp file first
        const tempFilePath = path.join(this.tempDir, finalFilename);
        fs.writeFileSync(tempFilePath, base64image, "base64");
        // Upload to GCS
        await this.gcsClient.uploadFile(tempFilePath, {
            destination: this.getPrefix(context) + finalFilename,
            contentType: this.getMimeType(finalFilename),
        });
        // Clean up temp file
        fs.unlinkSync(tempFilePath);
        const fullUri = this.filenameToUri(finalFilename, context);
        return {
            uri: fullUri,
            name: finalFilename,
            mimeType: this.getMimeType(finalFilename),
            text: `Image ${finalFilename} successfully created at URI ${fullUri}.`,
        };
    }
    async resourceToFile(uri, context) {
        const filename = this.uriToFilename(uri, context);
        if (!filename) {
            throw new Error("Invalid file path");
        }
        const tempFilePath = path.join(this.tempDir, filename);
        await this.gcsClient.downloadFile(this.getPrefix(context) + filename, tempFilePath);
        return tempFilePath;
    }
}
