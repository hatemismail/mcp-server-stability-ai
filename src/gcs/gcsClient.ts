import { Storage, File } from "@google-cloud/storage";

// GCS SDK errors are objects whose default toString is "[object Object]".
// This unwraps the useful fields (message, code, errors[]) so the surfaced
// error is actionable instead of opaque.
function formatError(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (err && typeof err === "object") {
		const e = err as { message?: string; code?: string | number; errors?: unknown };
		if (e.message) return `${e.message}${e.code ? ` (code=${e.code})` : ""}`;
		try { return JSON.stringify(err); } catch { return String(err); }
	}
	return String(err);
}

// Example .env file:
// GCS_PROJECT_ID=your-project-id
// GCS_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
// GCS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYourKeyHere\n-----END PRIVATE KEY-----\n
interface GcsClientConfig {
	privateKey?: string;
	clientEmail?: string;
	projectId?: string;
	bucketName?: string;
}

interface UploadOptions {
	contentType?: string;
	destination?: string;
}

export class GcsClient {
	private readonly storage: Storage;
	bucketName: string;

	constructor(config?: GcsClientConfig) {
		this.bucketName = config?.bucketName as string;
		const credentials =
			config?.privateKey && config?.clientEmail
				? {
						type: "service_account",
						private_key: config.privateKey.replace(/\\n/g, "\n"),
						client_email: config.clientEmail,
						project_id: config.projectId,
					}
				: undefined;

		this.storage = new Storage({
			credentials,
			projectId: config?.projectId,
		});

		// Initialize bucket
		this.initializeBucket().catch((error) => {
			console.error("Warning: Bucket initialization error:", error.message);
		});
	}

	private async initializeBucket(): Promise<void> {
		try {
			const [exists] = await this.storage.bucket(this.bucketName).exists();
			if (!exists) {
				await this.storage.createBucket(this.bucketName);
				console.log(`Bucket ${this.bucketName} created successfully.`);
			} else {
				console.log(`Bucket ${this.bucketName} already exists.`);
			}
		} catch (error) {
			throw new Error(`Failed to initialize bucket: ${formatError(error)}`);
		}
	}

	async uploadFile(filePath: string, options?: UploadOptions): Promise<File> {
		try {
			const bucket = this.storage.bucket(this.bucketName);
			const destination = options?.destination || filePath.split("/").pop();

			// `public: true` triggers a per-object ACL update via makePublic()
			// after upload. That call fails on buckets that have Uniform
			// Bucket-Level Access enabled (GCP's recommended default). Gated
			// behind GCS_MAKE_PUBLIC so UBLA buckets work out of the box;
			// users on Fine-grained ACL buckets can opt in. For UBLA buckets
			// configure public read at the bucket level (allUsers viewer).
			const makePublic = process.env.GCS_MAKE_PUBLIC === "true";

			const [file] = await bucket.upload(filePath, {
				destination,
				contentType: options?.contentType,
				public: makePublic,
			});

			return file;
		} catch (error) {
			throw new Error(`Failed to upload file: ${formatError(error)}`);
		}
	}

	async downloadFile(fileName: string, destinationPath: string): Promise<void> {
		try {
			const bucket = this.storage.bucket(this.bucketName);
			const file = bucket.file(fileName);

			await file.download({
				destination: destinationPath,
			});
		} catch (error) {
			throw new Error(`Failed to download file: ${formatError(error)}`);
		}
	}

	async listFiles(prefix?: string): Promise<File[]> {
		try {
			const bucket = this.storage.bucket(this.bucketName);
			const [files] = await bucket.getFiles({ prefix });
			return files;
		} catch (error) {
			throw new Error(`Failed to list files: ${formatError(error)}`);
		}
	}
}
