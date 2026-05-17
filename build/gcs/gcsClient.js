import { Storage } from "@google-cloud/storage";
export class GcsClient {
    storage;
    bucketName;
    constructor(config) {
        this.bucketName = config?.bucketName;
        const credentials = config?.privateKey && config?.clientEmail
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
    async initializeBucket() {
        try {
            const [exists] = await this.storage.bucket(this.bucketName).exists();
            if (!exists) {
                await this.storage.createBucket(this.bucketName);
                console.log(`Bucket ${this.bucketName} created successfully.`);
            }
            else {
                console.log(`Bucket ${this.bucketName} already exists.`);
            }
        }
        catch (error) {
            throw new Error(`Failed to initialize bucket: ${error}`);
        }
    }
    async uploadFile(filePath, options) {
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const destination = options?.destination || filePath.split("/").pop();
            const [file] = await bucket.upload(filePath, {
                destination,
                contentType: options?.contentType,
                public: true,
            });
            return file;
        }
        catch (error) {
            throw new Error(`Failed to upload file: ${error}`);
        }
    }
    async downloadFile(fileName, destinationPath) {
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const file = bucket.file(fileName);
            await file.download({
                destination: destinationPath,
            });
        }
        catch (error) {
            throw new Error(`Failed to download file: ${error}`);
        }
    }
    async listFiles(prefix) {
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const [files] = await bucket.getFiles({ prefix });
            return files;
        }
        catch (error) {
            throw new Error(`Failed to list files: ${error}`);
        }
    }
}
