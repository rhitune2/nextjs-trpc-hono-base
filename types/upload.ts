import { z } from "zod";

/**
 * Upload Router Types
 * 
 * Contains all schemas, response types, and inferred types for upload router
 */

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const uploadFileSchema = z.object({
	fileName: z.string().min(1).max(255),
	mimeType: z.string().min(1).max(100),
	size: z.number().positive(),
	fileData: z.string(), // Base64 encoded file data
	isPublic: z.boolean().optional().default(true),
	path: z.string().optional(),
	metadata: z.record(z.string(), z.any()).optional(),
});

export const getFilesSchema = z.object({
	limit: z.number().min(1).max(100).optional().default(20),
	offset: z.number().min(0).optional().default(0),
	search: z.string().optional(),
	category: z.string().optional(),
	sortBy: z.enum(["createdAt", "size", "name"]).optional().default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const deleteFileSchema = z.object({
	id: z.string().min(1),
});

export const getFileByIdSchema = z.object({
	id: z.string().min(1),
});

export const createShareLinkSchema = z.object({
	fileId: z.string().min(1),
	password: z.string().optional(),
	maxDownloads: z.number().positive().optional(),
	expiresInHours: z.number().positive().max(720).optional(), // Max 30 days
});

export const getPresignedUrlSchema = z.object({
	fileId: z.string().min(1),
	expiresInSeconds: z.number().positive().max(3600).optional().default(3600),
});

export const updateFileSchema = z.object({
	id: z.string().min(1),
	originalName: z.string().min(1).max(255).optional(),
	isPublic: z.boolean().optional(),
	metadata: z.record(z.string(), z.any()).optional(),
});

// ============================================================================
// INFERRED INPUT TYPES
// ============================================================================

export type UploadFileInput = z.infer<typeof uploadFileSchema>;
export type GetFilesInput = z.infer<typeof getFilesSchema>;
export type DeleteFileInput = z.infer<typeof deleteFileSchema>;
export type GetFileByIdInput = z.infer<typeof getFileByIdSchema>;
export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;
export type GetPresignedUrlInput = z.infer<typeof getPresignedUrlSchema>;
export type UpdateFileInput = z.infer<typeof updateFileSchema>;

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface UploadFileResponse {
	id: string;
	url: string;
	thumbnailUrl: string | null;
	fileName: string;
	originalName: string;
	size: number;
	mimeType: string;
	message: string;
}

export interface FileItem {
	id: string;
	originalName: string;
	fileName: string;
	mimeType: string;
	size: number;
	url: string;
	thumbnailUrl: string | null;
	createdAt: Date;
	formattedSize: string;
	category: string;
}

export interface GetFilesResponse {
	files: FileItem[];
	pagination: {
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	};
}

export interface GetFileByIdResponse extends FileItem {
	path: string | null;
	userId: string;
	isPublic: boolean;
	status: string;
	processingStatus: string;
	metadata: Record<string, any> | null;
}

export interface DeleteFileResponse {
	message: string;
}

export interface ShareLinkResponse {
	id: string;
	token: string;
	url: string;
	expiresAt: Date | null;
	maxDownloads: number | null;
	message: string;
}

export interface PresignedUrlResponse {
	url: string;
	expiresInSeconds: number;
	message: string;
}

export interface UpdateFileResponse {
	message: string;
}

export interface FileStatsResponse {
	totalFiles: number;
	totalSize: number;
	formattedTotalSize: string;
	categoryBreakdown: Array<{
		category: string;
		count: number;
	}>;
}

export interface DirectUploadResponse {
	id?: string;
	url: string;
	fileName: string;
	size: number;
}

