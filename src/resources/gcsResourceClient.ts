import { Resource } from "@modelcontextprotocol/sdk/types.js";
import { ResourceClient, ResourceContext } from "./resourceClient.js";
import { GcsClient } from "../gcs/gcsClient.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomBytes } from "crypto";
import { URL } from "url";

export class GcsResourceClient extends ResourceClient {
	private readonly tempDir: string;
	private ipAddress?: string;

	constructor(private readonly gcsClient: GcsClient) {
		super();
		this.tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "stability-ai-mcp-server-gcs-resource-")
		);
	}

	getPrefix(context?: ResourceContext): string {
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

	filenameToUri(filename: string, context?: ResourceContext): string {
		return `https://storage.googleapis.com/${this.gcsClient.bucketName}/${this.getPrefix(context)}${filename}`;
	}

	uriToFilename(uri: string, context?: ResourceContext): string {
		return uri.replace(
			`https://storage.googleapis.com/${this.gcsClient.bucketName}/${this.getPrefix(context)}`,
			""
		);
	}

	async listResources(context?: ResourceContext): Promise<Resource[]> {
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

	async readResource(
		uri: string,
		context?: ResourceContext
	): Promise<Resource> {
		try {
			const filename = this.uriToFilename(uri, context);
			const tempFilePath = path.join(this.tempDir, filename);

			await this.gcsClient.downloadFile(
				this.getPrefix(context) + filename,
				tempFilePath
			);
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
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to read resource: ${error.message}`);
			}
			throw new Error("Failed to read resource: Unknown error");
		}
	}

	async createResource(
		uri: string,
		base64image: string,
		context?: ResourceContext
	): Promise<Resource> {
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

	async resourceToFile(
		uri: string,
		context?: ResourceContext
	): Promise<string> {
		// INPUT-only path: any HTTP(S) URL that is NOT a GCS object URL for
		// our own bucket is downloaded directly via fetch. This is the only
		// way an MCP client can hand the server an externally-hosted image
		// (a presigned bucket URL from another S3 store, a CDN URL, a
		// public image host, etc.) without first mirroring it to GCS.
		//
		// IMPORTANT: this is INPUT-only. createResource (output) is
		// untouched and continues to upload processed images back into
		// GCS, preserving the existing list-resources flow that surfaces
		// them with `https://storage.googleapis.com/<bucket>/<prefix>/...`
		// URIs.
		const ourBucketPrefix = `https://storage.googleapis.com/${this.gcsClient.bucketName}/`;
		const isOurGcsUrl = uri.startsWith(ourBucketPrefix);
		if (!isOurGcsUrl && /^https?:\/\//i.test(uri)) {
			return this.downloadHttpUri(uri);
		}

		// EXISTING: GCS object lookup for pre-staged bucket resources
		// (those returned by listResources or created by createResource).
		const filename = this.uriToFilename(uri, context);
		if (!filename) {
			throw new Error("Invalid file path");
		}

		const tempFilePath = path.join(this.tempDir, filename);
		await this.gcsClient.downloadFile(
			this.getPrefix(context) + filename,
			tempFilePath
		);

		return tempFilePath;
	}

	/**
	 * Download an arbitrary HTTP(S) URL to a temp file and return the
	 * local path. Used by resourceToFile() when the input URI isn't a
	 * GCS object URL for this server's bucket — covers presigned URLs
	 * from any S3-compatible store, CDN URLs, public image hosts, etc.
	 */
	private async downloadHttpUri(uri: string): Promise<string> {
		const res = await fetch(uri);
		if (!res.ok) {
			throw new Error(
				`Failed to download ${uri}: HTTP ${res.status} ${res.statusText}`
			);
		}
		const buf = Buffer.from(await res.arrayBuffer());
		// Derive a sensible extension from the URL path so stability.ai's
		// REST layer has a hint; default .bin if the URL has no extension
		// (e.g. presigned URLs whose path encodes the object key only).
		let ext = ".bin";
		try {
			const p = new URL(uri).pathname;
			const idx = p.lastIndexOf(".");
			if (idx >= 0) {
				ext = p.slice(idx).split(/[?#]/)[0];
			}
		} catch {
			/* fall back to .bin */
		}
		const filename = `external-${randomBytes(8).toString("hex")}${ext}`;
		const tempFilePath = path.join(this.tempDir, filename);
		fs.writeFileSync(tempFilePath, buf);
		return tempFilePath;
	}
}
