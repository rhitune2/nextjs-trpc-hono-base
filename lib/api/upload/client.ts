import { nanoid } from "nanoid";

// File size limits
export const FILE_SIZE_LIMITS = {
	image: 10 * 1024 * 1024, // 10MB
	video: 100 * 1024 * 1024, // 100MB
	document: 50 * 1024 * 1024, // 50MB
	default: parseInt(process.env.MAX_FILE_SIZE || "52428800"), // 50MB
};

// Allowed MIME types
export const ALLOWED_MIME_TYPES = {
	image: [
		"image/jpeg",
		"image/jpg",
		"image/png",
		"image/webp",
		"image/gif",
		"image/svg+xml",
		"image/avif",
	],
	video: ["video/mp4", "video/webm", "video/ogg", "video/quicktime"],
	document: [
		"application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"text/plain",
		"text/csv",
	],
	archive: [
		"application/zip",
		"application/x-rar-compressed",
		"application/x-7z-compressed",
		"application/x-tar",
		"application/gzip",
	],
};

// Get allowed types from environment or use defaults
export function getAllowedTypes(): string[] {
	if (process.env.ALLOWED_FILE_TYPES) {
		return process.env.ALLOWED_FILE_TYPES.split(",");
	}
	return [
		...ALLOWED_MIME_TYPES.image,
		...ALLOWED_MIME_TYPES.document,
		"application/zip",
	];
}

/**
 * Validate file type
 */
export function isValidFileType(
	mimeType: string,
	allowedTypes?: string[],
): boolean {
	const allowed = allowedTypes || getAllowedTypes();
	return allowed.includes(mimeType.toLowerCase());
}

/**
 * Validate file size
 */
export function isValidFileSize(
	size: number,
	mimeType: string,
	maxSize?: number,
): boolean {
	if (maxSize) {
		return size <= maxSize;
	}

	// Check by type
	if (ALLOWED_MIME_TYPES.image.includes(mimeType)) {
		return size <= FILE_SIZE_LIMITS.image;
	}
	if (ALLOWED_MIME_TYPES.video.includes(mimeType)) {
		return size <= FILE_SIZE_LIMITS.video;
	}
	if (ALLOWED_MIME_TYPES.document.includes(mimeType)) {
		return size <= FILE_SIZE_LIMITS.document;
	}

	return size <= FILE_SIZE_LIMITS.default;
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename: string): string {
	// Remove special characters and spaces
	return filename
		.replace(/[^a-zA-Z0-9.-]/g, "_")
		.replace(/_{2,}/g, "_")
		.replace(/^_|_$/g, "")
		.toLowerCase();
}

/**
 * Generate unique filename
 */
export function generateUniqueFilename(originalName: string): string {
	const ext = originalName.split(".").pop()?.toLowerCase() || "";
	const name = nanoid();
	return ext ? `${name}.${ext}` : name;
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
	const mimeToExt: Record<string, string> = {
		"image/jpeg": "jpg",
		"image/jpg": "jpg",
		"image/png": "png",
		"image/webp": "webp",
		"image/gif": "gif",
		"image/svg+xml": "svg",
		"image/avif": "avif",
		"video/mp4": "mp4",
		"video/webm": "webm",
		"video/ogg": "ogg",
		"video/quicktime": "mov",
		"application/pdf": "pdf",
		"application/msword": "doc",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
			"docx",
		"application/vnd.ms-excel": "xls",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
			"xlsx",
		"text/plain": "txt",
		"text/csv": "csv",
		"application/zip": "zip",
		"application/x-rar-compressed": "rar",
		"application/x-7z-compressed": "7z",
		"application/x-tar": "tar",
		"application/gzip": "gz",
	};

	return mimeToExt[mimeType] || "";
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = bytes;
	let unitIndex = 0;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Get file category from MIME type
 */
export function getFileCategory(mimeType: string): string {
	if (ALLOWED_MIME_TYPES.image.includes(mimeType)) return "image";
	if (ALLOWED_MIME_TYPES.video.includes(mimeType)) return "video";
	if (ALLOWED_MIME_TYPES.document.includes(mimeType)) return "document";
	if (ALLOWED_MIME_TYPES.archive.includes(mimeType)) return "archive";
	return "other";
}

/**
 * Parse content disposition header
 */
export function parseContentDisposition(header: string): {
	name?: string;
	filename?: string;
} {
	const parts = header.split(";").map((part) => part.trim());
	const result: { name?: string; filename?: string } = {};

	for (const part of parts) {
		if (part.startsWith("name=")) {
			result.name = part.slice(6, -1); // Remove quotes
		} else if (part.startsWith("filename=")) {
			result.filename = part.slice(10, -1); // Remove quotes
		}
	}

	return result;
}

/**
 * Calculate file hash (for duplicate detection) - Client side version
 */
export async function calculateFileHash(
	file: File,
	algorithm: "SHA-1" | "SHA-256" = "SHA-256",
): Promise<string> {
	const buffer = await file.arrayBuffer();
	const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return hashHex;
}

