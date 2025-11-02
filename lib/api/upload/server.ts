import sharp from "sharp";
import { nanoid } from "nanoid";
import { logger } from "@/lib/logger";
import crypto from "crypto";

// Re-export common utilities from client version
export {
	FILE_SIZE_LIMITS,
	ALLOWED_MIME_TYPES,
	getAllowedTypes,
	isValidFileType,
	isValidFileSize,
	sanitizeFilename,
	generateUniqueFilename,
	getExtensionFromMimeType,
	formatFileSize,
	getFileCategory,
	parseContentDisposition,
} from "./client";

/**
 * Process image - resize and optimize (Server-only)
 */
export async function processImage(
	buffer: Buffer,
	options?: {
		width?: number;
		height?: number;
		quality?: number;
		format?: keyof sharp.FormatEnum;
		fit?: keyof sharp.FitEnum;
	},
): Promise<Buffer> {
	try {
		let sharpInstance = sharp(buffer);

		// Get metadata
		const metadata = await sharpInstance.metadata();

		// Resize if dimensions provided
		if (options?.width || options?.height) {
			sharpInstance = sharpInstance.resize({
				width: options.width,
				height: options.height,
				fit: options.fit || "inside",
				withoutEnlargement: true,
			});
		}

		// Convert format if specified
		if (options?.format) {
			sharpInstance = sharpInstance.toFormat(options.format, {
				quality: options.quality || 85,
			});
		} else if (metadata.format === "jpeg" || metadata.format === "jpg") {
			sharpInstance = sharpInstance.jpeg({ quality: options?.quality || 85 });
		} else if (metadata.format === "png") {
			sharpInstance = sharpInstance.png({
				quality: options?.quality || 85,
				compressionLevel: 9,
			});
		} else if (metadata.format === "webp") {
			sharpInstance = sharpInstance.webp({ quality: options?.quality || 85 });
		}

		return await sharpInstance.toBuffer();
	} catch (error) {
		logger.error({ message: "Error processing image", error });
		throw error;
	}
}

/**
 * Generate thumbnail (Server-only)
 */
export async function generateThumbnail(
	buffer: Buffer,
	width: number = 200,
	height: number = 200,
): Promise<Buffer> {
	try {
		return await sharp(buffer)
			.resize({
				width,
				height,
				fit: "cover",
				position: "center",
			})
			.jpeg({ quality: 80 })
			.toBuffer();
	} catch (error) {
		logger.error({ message: "Error generating thumbnail", error });
		throw error;
	}
}

/**
 * Extract image metadata (Server-only)
 */
export async function extractImageMetadata(buffer: Buffer): Promise<{
	width?: number;
	height?: number;
	format?: string;
	size?: number;
	density?: number;
	hasAlpha?: boolean;
	orientation?: number;
	[key: string]: any;
}> {
	try {
		const metadata = await sharp(buffer).metadata();
		return {
			width: metadata.width,
			height: metadata.height,
			format: metadata.format,
			size: metadata.size,
			density: metadata.density,
			hasAlpha: metadata.hasAlpha,
			orientation: metadata.orientation,
			space: metadata.space,
			channels: metadata.channels,
			depth: metadata.depth,
			isProgressive: metadata.isProgressive,
		};
	} catch (error) {
		logger.error({ message: "Error extracting image metadata", error });
		return {};
	}
}

/**
 * Add watermark to image (Server-only)
 */
export async function addWatermark(
	imageBuffer: Buffer,
	watermarkBuffer: Buffer,
	position: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" = "bottom-right",
	opacity: number = 0.7,
): Promise<Buffer> {
	try {
		const image = sharp(imageBuffer);
		const watermark = sharp(watermarkBuffer);

		const imageMetadata = await image.metadata();
		const watermarkMetadata = await watermark.metadata();

		if (!imageMetadata.width || !imageMetadata.height) {
			throw new Error("Could not get image dimensions");
		}

		// Resize watermark to be 10% of the image width
		const watermarkWidth = Math.floor(imageMetadata.width * 0.1);
		const resizedWatermark = await watermark
			.resize(watermarkWidth)
			.toBuffer();

		// Calculate position
		let left = 0;
		let top = 0;
		const padding = 10;

		switch (position) {
			case "top-left":
				left = padding;
				top = padding;
				break;
			case "top-right":
				left = imageMetadata.width - watermarkWidth - padding;
				top = padding;
				break;
			case "bottom-left":
				left = padding;
				top = imageMetadata.height - (watermarkMetadata.height || 0) - padding;
				break;
			case "bottom-right":
				left = imageMetadata.width - watermarkWidth - padding;
				top = imageMetadata.height - (watermarkMetadata.height || 0) - padding;
				break;
			case "center":
				left = Math.floor((imageMetadata.width - watermarkWidth) / 2);
				top = Math.floor(
					(imageMetadata.height - (watermarkMetadata.height || 0)) / 2,
				);
				break;
		}

		return await image
			.composite([
				{
					input: resizedWatermark,
					left,
					top,
					blend: "over",
				},
			])
			.toBuffer();
	} catch (error) {
		logger.error({ message: "Error adding watermark", error });
		throw error;
	}
}

/**
 * Convert image format (Server-only)
 */
export async function convertImageFormat(
	buffer: Buffer,
	format: keyof sharp.FormatEnum,
	quality: number = 85,
): Promise<Buffer> {
	try {
		return await sharp(buffer).toFormat(format, { quality }).toBuffer();
	} catch (error) {
		logger.error({ message: "Error converting image format", error });
		throw error;
	}
}

/**
 * Validate and process uploaded file (Server-only)
 */
export interface ProcessedFile {
	buffer: Buffer;
	thumbnailBuffer?: Buffer;
	metadata: {
		originalName: string;
		fileName: string;
		mimeType: string;
		size: number;
		width?: number;
		height?: number;
		[key: string]: any;
	};
}

export async function processUploadedFile(
	buffer: Buffer,
	originalName: string,
	mimeType: string,
	options?: {
		generateThumbnail?: boolean;
		maxWidth?: number;
		maxHeight?: number;
		quality?: number;
		addWatermark?: Buffer;
	},
): Promise<ProcessedFile> {
	try {
		const { isValidFileType, isValidFileSize, generateUniqueFilename, ALLOWED_MIME_TYPES } = await import("./client");

		// Validate file type
		if (!isValidFileType(mimeType)) {
			throw new Error(`File type ${mimeType} is not allowed`);
		}

		// Validate file size
		if (!isValidFileSize(buffer.length, mimeType)) {
			throw new Error("File size exceeds the maximum allowed size");
		}

		// Generate unique filename
		const fileName = generateUniqueFilename(originalName);

		// Process based on file type
		let processedBuffer = buffer;
		let thumbnailBuffer: Buffer | undefined;
		let metadata: any = {
			originalName,
			fileName,
			mimeType,
			size: buffer.length,
		};

		if (ALLOWED_MIME_TYPES.image.includes(mimeType)) {
			// Process image
			if (options?.maxWidth || options?.maxHeight) {
				processedBuffer = await processImage(buffer, {
					width: options.maxWidth,
					height: options.maxHeight,
					quality: options.quality,
				});
			}

			// Add watermark if provided
			if (options?.addWatermark) {
				processedBuffer = await addWatermark(
					processedBuffer,
					options.addWatermark,
				);
			}

			// Generate thumbnail
			if (options?.generateThumbnail) {
				thumbnailBuffer = await generateThumbnail(processedBuffer);
			}

			// Extract metadata
			const imageMetadata = await extractImageMetadata(processedBuffer);
			metadata = { ...metadata, ...imageMetadata };
		}

		return {
			buffer: processedBuffer,
			thumbnailBuffer,
			metadata,
		};
	} catch (error) {
		logger.error({ message: "Error processing uploaded file", error });
		throw error;
	}
}

/**
 * Calculate file hash (Server version with Node.js crypto)
 */
export async function calculateFileHash(
	buffer: Buffer,
	algorithm: "md5" | "sha1" | "sha256" = "sha256",
): Promise<string> {
	return crypto.createHash(algorithm).update(buffer).digest("hex");
}

