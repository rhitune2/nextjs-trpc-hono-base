/**
 * Upload API Types
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

export interface UploadResult {
	fileName: string;
	url: string;
	size: number;
}

