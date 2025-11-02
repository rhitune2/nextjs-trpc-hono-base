import * as Minio from "minio";
import { logger } from "@/lib/logger";
import { nanoid } from "nanoid";
import stream from "stream";

// MinIO client configuration
const minioClient = new Minio.Client({
	endPoint: process.env.MINIO_ENDPOINT || "localhost",
	port: parseInt(process.env.MINIO_PORT || "9000"),
	useSSL: process.env.MINIO_USE_SSL === "true",
	accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
	secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

// Default bucket name
export const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || "uploads";

// Initialize bucket
export async function initializeBucket(): Promise<void> {
	try {
		const bucketExists = await minioClient.bucketExists(BUCKET_NAME);

		if (!bucketExists) {
			await minioClient.makeBucket(BUCKET_NAME, "us-east-1");
			logger.info(`Bucket '${BUCKET_NAME}' created successfully`);

			// Set bucket policy to allow public read access
			const policy = {
				Version: "2012-10-17",
				Statement: [
					{
						Effect: "Allow",
						Principal: { AWS: ["*"] },
						Action: ["s3:GetObject"],
						Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`],
					},
				],
			};

			await minioClient.setBucketPolicy(
				BUCKET_NAME,
				JSON.stringify(policy),
			);
			logger.info(`Bucket policy set for '${BUCKET_NAME}'`);
		} else {
			logger.info(`Bucket '${BUCKET_NAME}' already exists`);
		}
	} catch (error) {
		logger.error({ message: "Error initializing MinIO bucket", error });
		throw error;
	}
}

/**
 * Upload file to MinIO
 */
export async function uploadFile(
	file: Buffer | stream.Readable,
	originalName: string,
	mimeType: string,
	metadata?: Record<string, string>,
): Promise<{
	fileName: string;
	url: string;
	size: number;
}> {
	try {
		// Generate unique filename
		const ext = originalName.split(".").pop() || "";
		const fileName = `${nanoid()}.${ext}`;

		// Upload metadata
		const metaData = {
			"Content-Type": mimeType,
			"X-Original-Name": originalName,
			...metadata,
		};

		// Upload file
		await minioClient.putObject(
			BUCKET_NAME,
			fileName,
			file,
			undefined,
			metaData,
		);

		// Get file stats
		const stat = await minioClient.statObject(BUCKET_NAME, fileName);

		// Generate public URL
		const url = getPublicUrl(fileName);

		logger.info(`File uploaded successfully: ${fileName}`);

		return {
			fileName,
			url,
			size: stat.size,
		};
	} catch (error) {
		logger.error({ message: "Error uploading file to MinIO", error });
		throw error;
	}
}

/**
 * Upload file with folder structure
 */
export async function uploadFileWithPath(
	file: Buffer | stream.Readable,
	path: string,
	originalName: string,
	mimeType: string,
	metadata?: Record<string, string>,
): Promise<{
	fileName: string;
	url: string;
	size: number;
}> {
	try {
		const ext = originalName.split(".").pop() || "";
		const fileName = `${path}/${nanoid()}.${ext}`;

		const metaData = {
			"Content-Type": mimeType,
			"X-Original-Name": originalName,
			...metadata,
		};

		await minioClient.putObject(
			BUCKET_NAME,
			fileName,
			file,
			undefined,
			metaData,
		);

		const stat = await minioClient.statObject(BUCKET_NAME, fileName);
		const url = getPublicUrl(fileName);

		logger.info(`File uploaded with path: ${fileName}`);

		return {
			fileName,
			url,
			size: stat.size,
		};
	} catch (error) {
		logger.error({ message: "Error uploading file with path to MinIO", error });
		throw error;
	}
}

/**
 * Get file from MinIO
 */
export async function getFile(fileName: string): Promise<stream.Readable> {
	try {
		const stream = await minioClient.getObject(BUCKET_NAME, fileName);
		logger.debug(`Retrieved file stream: ${fileName}`);
		return stream;
	} catch (error) {
		logger.error({ message: `Error getting file ${fileName} from MinIO`, error });
		throw error;
	}
}

/**
 * Delete file from MinIO
 */
export async function deleteFile(fileName: string): Promise<void> {
	try {
		await minioClient.removeObject(BUCKET_NAME, fileName);
		logger.info(`File deleted: ${fileName}`);
	} catch (error) {
		logger.error({ message: `Error deleting file ${fileName} from MinIO:`, error });
		throw error;
	}
}

/**
 * Delete multiple files
 */
export async function deleteFiles(fileNames: string[]): Promise<void> {
	try {
		await minioClient.removeObjects(BUCKET_NAME, fileNames);
		logger.info(`Deleted ${fileNames.length} files`);
	} catch (error) {
		logger.error({ message: "Error deleting files from MinIO:", error });
		throw error;
	}
}

/**
 * Check if file exists
 */
export async function fileExists(fileName: string): Promise<boolean> {
	try {
		await minioClient.statObject(BUCKET_NAME, fileName);
		return true;
	} catch (error: any) {
		if (error.code === "NotFound") {
			return false;
		}
		logger.error({ message: `Error checking file existence ${fileName}:`, error });
		throw error;
	}
}

/**
 * Get file metadata
 */
export async function getFileMetadata(fileName: string): Promise<{
	size: number;
	metaData: Record<string, string>;
	lastModified: Date;
	etag: string;
}> {
	try {
		const stat = await minioClient.statObject(BUCKET_NAME, fileName);
		return {
			size: stat.size,
			metaData: stat.metaData,
			lastModified: stat.lastModified,
			etag: stat.etag,
		};
	} catch (error) {
		logger.error({ message: `Error getting file metadata ${fileName}:`, error });
		throw error;
	}
}

/**
 * Generate presigned URL for temporary access
 */
export async function getPresignedUrl(
	fileName: string,
	expirySeconds: number = 3600,
): Promise<string> {
	try {
		const url = await minioClient.presignedGetObject(
			BUCKET_NAME,
			fileName,
			expirySeconds,
		);
		logger.debug(`Generated presigned URL for ${fileName}`);
		return url;
	} catch (error) {
		logger.error({ message: `Error generating presigned URL for ${fileName}:`, error });
		throw error;
	}
}

/**
 * Generate presigned URL for upload
 */
export async function getPresignedUploadUrl(
	fileName: string,
	expirySeconds: number = 3600,
): Promise<string> {
	try {
		const url = await minioClient.presignedPutObject(
			BUCKET_NAME,
			fileName,
			expirySeconds,
		);
		logger.debug(`Generated presigned upload URL for ${fileName}`);
		return url;
	} catch (error) {
		logger.error({
			message: `Error generating presigned upload URL for ${fileName}:`,
			error
		});
		throw error;
	}
}

/**
 * List files in a path
 */
export async function listFiles(
	prefix?: string,
	recursive: boolean = false,
): Promise<Minio.BucketItem[]> {
	try {
		const files: Minio.BucketItem[] = [];
		const stream = minioClient.listObjects(BUCKET_NAME, prefix, recursive);

		return new Promise((resolve, reject) => {
			stream.on("data", (obj) => {
				// Ensure obj has required properties before pushing
				if (obj.name) {
					files.push(obj as Minio.BucketItem);
				}
			});
			stream.on("error", (err) => {
				logger.error({ message: "Error listing files:", err });
				reject(err);
			});
			stream.on("end", () => {
				logger.debug(`Listed ${files.length} files with prefix: ${prefix}`);
				resolve(files);
			});
		});
	} catch (error) {
		logger.error({ message: "Error in listFiles:", error });
		throw error;
	}
}

/**
 * Copy file within MinIO
 */
export async function copyFile(
	source: string,
	destination: string,
): Promise<void> {
	try {
		await minioClient.copyObject(
			BUCKET_NAME,
			destination,
			`/${BUCKET_NAME}/${source}`,
		);
		logger.info(`File copied from ${source} to ${destination}`);
	} catch (error) {
		logger.error({ message: `Error copying file from ${source} to ${destination}:`, error });
		throw error;
	}
}

/**
 * Move file (copy and delete)
 */
export async function moveFile(
	source: string,
	destination: string,
): Promise<void> {
	try {
		await copyFile(source, destination);
		await deleteFile(source);
		logger.info(`File moved from ${source} to ${destination}`);
	} catch (error) {
		logger.error({ message: `Error moving file from ${source} to ${destination}:`, error });
		throw error;
	}
}

/**
 * Get public URL for a file
 */
export function getPublicUrl(fileName: string): string {
	const publicUrl = process.env.MINIO_PUBLIC_URL ||
		`http${process.env.MINIO_USE_SSL === "true" ? "s" : ""}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`;
	return `${publicUrl}/${BUCKET_NAME}/${fileName}`;
}

/**
 * Stream upload for large files
 */
export async function streamUpload(
	streamToUpload: stream.Readable,
	fileName: string,
	size: number,
	mimeType: string,
	metadata?: Record<string, string>,
): Promise<{
	fileName: string;
	url: string;
	etag: string;
}> {
	try {
		const metaData = {
			"Content-Type": mimeType,
			...metadata,
		};

		const uploadInfo = await minioClient.putObject(
			BUCKET_NAME,
			fileName,
			streamToUpload,
			size,
			metaData,
		);

		const url = getPublicUrl(fileName);

		logger.info(`Stream upload completed: ${fileName}`);

		return {
			fileName,
			url,
			etag: uploadInfo.etag,
		};
	} catch (error) {
		logger.error({ message: `Error in stream upload for ${fileName}:`, error });
		throw error;
	}
}

/**
 * Health check for MinIO connection
 */
export async function isMinioHealthy(): Promise<boolean> {
	try {
		await minioClient.listBuckets();
		return true;
	} catch (error) {
		logger.error({ message: "MinIO health check failed:", error });
		return false;
	}
}

// Initialize bucket on module load
initializeBucket().catch((error) => {
	logger.error({ message: "Failed to initialize MinIO bucket", error });
});

export default minioClient;

