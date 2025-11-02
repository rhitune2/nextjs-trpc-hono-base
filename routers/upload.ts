import { protectedProcedure, publicProcedure, router } from "@/lib/api/trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { files, fileAccessLogs, fileSharingLinks } from "@/db/schema/files";
import { eq, desc, and, like, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
	uploadFile,
	deleteFile,
	getPresignedUrl,
	uploadFileWithPath,
	getFile,
	listFiles,
} from "@/lib/services/storage/minio";
import {
	processUploadedFile,
	isValidFileType,
	isValidFileSize,
	generateUniqueFilename,
	formatFileSize,
	getFileCategory,
} from "@/lib/api/upload";
import { cache, invalidateCache } from "@/lib/services/redis";
import { logger, apiLogger } from "@/lib/logger";
import type { Context } from "hono";
import { auth } from "@/lib/auth";

// Import schemas from global types
import {
	uploadFileSchema,
	getFilesSchema,
	deleteFileSchema,
	getFileByIdSchema,
	createShareLinkSchema,
	getPresignedUrlSchema,
	updateFileSchema,
} from "../types/upload";

// Export types for use in other files
export * from "../types/upload";

export const uploadRouter = router({
	// Upload file (protected - requires authentication)
	upload: protectedProcedure
		.input(uploadFileSchema)
		.mutation(async ({ input, ctx }) => {
			try {
				// Validate file type
				if (!isValidFileType(input.mimeType)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `File type ${input.mimeType} is not allowed`,
					});
				}

				// Validate file size
				if (!isValidFileSize(input.size, input.mimeType)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "File size exceeds the maximum allowed size",
					});
				}

				// Convert base64 to buffer
				const buffer = Buffer.from(input.fileData, "base64");

				// Process the file (generate thumbnail if image, extract metadata, etc.)
				const processed = await processUploadedFile(
					buffer,
					input.fileName,
					input.mimeType,
					{
						generateThumbnail: input.mimeType.startsWith("image/"),
						maxWidth: 2000,
						maxHeight: 2000,
						quality: 85,
					},
				);

				// Upload to MinIO
				const uploadResult = input.path
					? await uploadFileWithPath(
							processed.buffer,
							input.path,
							input.fileName,
							input.mimeType,
							{
								userId: ctx.session.user.id,
								...input.metadata,
							},
						)
					: await uploadFile(
							processed.buffer,
							input.fileName,
							input.mimeType,
							{
								userId: ctx.session.user.id,
								...input.metadata,
							},
						);

				// Upload thumbnail if exists
				let thumbnailUrl: string | null = null;
				if (processed.thumbnailBuffer) {
					const thumbnailResult = await uploadFile(
						processed.thumbnailBuffer,
						`thumb_${processed.metadata.fileName}`,
						"image/jpeg",
						{
							isThumb: "true",
							parentFile: uploadResult.fileName,
						},
					);
					thumbnailUrl = thumbnailResult.url;
				}

				// Save to database
				const fileId = nanoid();
				await db.insert(files).values({
					id: fileId,
					originalName: input.fileName,
					fileName: uploadResult.fileName,
					mimeType: input.mimeType,
					size: uploadResult.size,
					url: uploadResult.url,
					thumbnailUrl,
					path: input.path,
					userId: ctx.session.user.id,
					metadata: processed.metadata,
					isPublic: input.isPublic,
					status: "active",
					processingStatus: "completed",
				});

				// Log access
				await db.insert(fileAccessLogs).values({
					id: nanoid(),
					fileId,
					userId: ctx.session.user.id,
					action: "view",
					ipAddress: ctx.session.user.email, // You might want to get real IP
				});

				// Invalidate cache
				await invalidateCache(`files:user:${ctx.session.user.id}:*`);

				logger.info({
					event: "file.uploaded",
					message: `File uploaded: ${input.fileName}`,
					fileId,
					userId: ctx.session.user.id,
					fileName: input.fileName,
					size: uploadResult.size,
				});

				return {
					id: fileId,
					url: uploadResult.url,
					thumbnailUrl,
					fileName: uploadResult.fileName,
					originalName: input.fileName,
					size: uploadResult.size,
					mimeType: input.mimeType,
					message: "File uploaded successfully",
				};
			} catch (error) {
				logger.error({ message: "Upload error", error });
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error ? error.message : "Failed to upload file",
				});
			}
		}),

	// Get user's files
	getUserFiles: protectedProcedure
		.input(getFilesSchema)
		.query(async ({ input, ctx }) => {
			try {
				const cacheKey = `files:user:${ctx.session.user.id}:${JSON.stringify(input)}`;

				return await cache(
					cacheKey,
					async () => {
						const conditions = [
							eq(files.userId, ctx.session.user.id),
							eq(files.status, "active"),
						];

						if (input.search) {
							conditions.push(like(files.originalName, `%${input.search}%`));
						}

						if (input.category) {
							conditions.push(like(files.mimeType, `${input.category}/%`));
						}

						const sortColumn =
							input.sortBy === "size"
								? files.size
								: input.sortBy === "name"
									? files.originalName
									: files.createdAt;
						const orderBy = input.sortOrder === "desc" ? desc(sortColumn) : sortColumn;

						const userFiles = await db
							.select()
							.from(files)
							.where(and(...conditions))
							.orderBy(orderBy)
							.limit(input.limit)
							.offset(input.offset);

						// Get total count
						const countResult = await db
							.select({ count: sql<number>`count(*)` })
							.from(files)
							.where(and(...conditions));

						const total = countResult[0]?.count || 0;

						return {
							files: userFiles.map((file) => ({
								...file,
								formattedSize: formatFileSize(file.size),
								category: getFileCategory(file.mimeType),
							})),
							pagination: {
								total,
								limit: input.limit,
								offset: input.offset,
								hasMore: input.offset + input.limit < total,
							},
						};
					},
					300, // Cache for 5 minutes
				);
			} catch (error) {
				logger.error({ message: "Get user files error", error });
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch files",
				});
			}
		}),

	// Get public files
	getPublicFiles: publicProcedure.input(getFilesSchema).query(async ({ input }) => {
		try {
			const cacheKey = `files:public:${JSON.stringify(input)}`;

			return await cache(
				cacheKey,
				async () => {
					const conditions = [
						eq(files.isPublic, true),
						eq(files.status, "active"),
					];

					if (input.search) {
						conditions.push(like(files.originalName, `%${input.search}%`));
					}

					if (input.category) {
						conditions.push(like(files.mimeType, `${input.category}/%`));
					}

					const sortColumn =
						input.sortBy === "size"
							? files.size
							: input.sortBy === "name"
								? files.originalName
								: files.createdAt;
					const orderBy = input.sortOrder === "desc" ? desc(sortColumn) : sortColumn;

					const publicFiles = await db
						.select({
							id: files.id,
							originalName: files.originalName,
							fileName: files.fileName,
							mimeType: files.mimeType,
							size: files.size,
							url: files.url,
							thumbnailUrl: files.thumbnailUrl,
							createdAt: files.createdAt,
						})
						.from(files)
						.where(and(...conditions))
						.orderBy(orderBy)
						.limit(input.limit)
						.offset(input.offset);

					const countResult = await db
						.select({ count: sql<number>`count(*)` })
						.from(files)
						.where(and(...conditions));

					const total = countResult[0]?.count || 0;

					return {
						files: publicFiles.map((file) => ({
							...file,
							formattedSize: formatFileSize(file.size),
							category: getFileCategory(file.mimeType),
						})),
						pagination: {
							total,
							limit: input.limit,
							offset: input.offset,
							hasMore: input.offset + input.limit < total,
						},
					};
				},
				600, // Cache for 10 minutes
			);
		} catch (error) {
			logger.error({ message: "Get public files error", error });
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch public files",
			});
		}
	}),

	// Get file by ID
	getFileById: protectedProcedure
		.input(getFileByIdSchema)
		.query(async ({ input, ctx }) => {
			try {
				const file = await db
					.select()
					.from(files)
					.where(
						and(
							eq(files.id, input.id),
							eq(files.userId, ctx.session.user.id),
							eq(files.status, "active"),
						),
					)
					.limit(1);

				if (!file[0]) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "File not found",
					});
				}

				// Log access
				await db.insert(fileAccessLogs).values({
					id: nanoid(),
					fileId: input.id,
					userId: ctx.session.user.id,
					action: "view",
				});

				return {
					...file[0],
					formattedSize: formatFileSize(file[0].size),
					category: getFileCategory(file[0].mimeType),
				};
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				logger.error({ message: "Get file by ID error", error });
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch file",
				});
			}
		}),

	// Delete file
	deleteFile: protectedProcedure
		.input(deleteFileSchema)
		.mutation(async ({ input, ctx }) => {
			try {
				// Check if file exists and belongs to user
				const file = await db
					.select()
					.from(files)
					.where(
						and(
							eq(files.id, input.id),
							eq(files.userId, ctx.session.user.id),
							eq(files.status, "active"),
						),
					)
					.limit(1);

				if (!file[0]) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "File not found",
					});
				}

				// Delete from MinIO
				await deleteFile(file[0].fileName);

				// Delete thumbnail if exists
				if (file[0].thumbnailUrl) {
					const thumbnailFileName = `thumb_${file[0].fileName}`;
					try {
						await deleteFile(thumbnailFileName);
					} catch (error) {
						logger.warn(`Failed to delete thumbnail: ${thumbnailFileName}`);
					}
				}

				// Soft delete in database
				await db
					.update(files)
					.set({
						status: "deleted",
						deletedAt: new Date(),
					})
					.where(eq(files.id, input.id));

				// Log deletion
				await db.insert(fileAccessLogs).values({
					id: nanoid(),
					fileId: input.id,
					userId: ctx.session.user.id,
					action: "delete",
				});

				// Invalidate cache
				await invalidateCache(`files:user:${ctx.session.user.id}:*`);

				logger.info({
					event: "file.deleted",
					message: `File deleted: ${file[0].fileName}`,
					fileId: input.id,
					userId: ctx.session.user.id,
					fileName: file[0].fileName,
				});

				return {
					message: "File deleted successfully",
				};
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				logger.error({ message: "Delete file error", error });
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete file",
				});
			}
		}),

	// Create sharing link
	createShareLink: protectedProcedure
		.input(createShareLinkSchema)
		.mutation(async ({ input, ctx }) => {
			try {
				// Check if file exists and belongs to user
				const file = await db
					.select()
					.from(files)
					.where(
						and(
							eq(files.id, input.fileId),
							eq(files.userId, ctx.session.user.id),
							eq(files.status, "active"),
						),
					)
					.limit(1);

				if (!file[0]) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "File not found",
					});
				}

				// Create share link
				const token = nanoid(32);
				const linkId = nanoid();

				const expiresAt = input.expiresInHours
					? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000)
					: null;

				// Hash password if provided
				let hashedPassword: string | null = null;
				if (input.password) {
					const bcrypt = await import("bcryptjs");
					hashedPassword = await bcrypt.hash(input.password, 10);
				}

				await db.insert(fileSharingLinks).values({
					id: linkId,
					fileId: input.fileId,
					token,
					password: hashedPassword,
					maxDownloads: input.maxDownloads,
					expiresAt,
					createdBy: ctx.session.user.id,
				});

				const shareUrl = `${process.env.NEXT_PUBLIC_SERVER_URL}/share/${token}`;

				logger.info({
					event: "share_link.created",
					message: `Share link created for file: ${input.fileId}`,
					linkId,
					fileId: input.fileId,
					userId: ctx.session.user.id,
					expiresAt,
				});

				return {
					id: linkId,
					token,
					url: shareUrl,
					expiresAt,
					maxDownloads: input.maxDownloads,
					message: "Share link created successfully",
				};
			} catch (error) {
				logger.error({ message: "Create share link error", error });
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create share link",
				});
			}
		}),

	// Get presigned URL for direct upload
	getPresignedUploadUrl: protectedProcedure
		.input(getPresignedUrlSchema)
		.mutation(async ({ input, ctx }) => {
			try {
				// Check if file exists and belongs to user
				const file = await db
					.select()
					.from(files)
					.where(
						and(
							eq(files.id, input.fileId),
							eq(files.userId, ctx.session.user.id),
							eq(files.status, "active"),
						),
					)
					.limit(1);

				if (!file[0]) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "File not found",
					});
				}

				// Generate presigned URL
				const url = await getPresignedUrl(
					file[0].fileName,
					input.expiresInSeconds,
				);

				// Log access
				await db.insert(fileAccessLogs).values({
					id: nanoid(),
					fileId: input.fileId,
					userId: ctx.session.user.id,
					action: "download",
				});

				return {
					url,
					expiresInSeconds: input.expiresInSeconds,
					message: "Presigned URL generated successfully",
				};
			} catch (error) {
				logger.error({ message: "Get presigned URL error", error });
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to generate presigned URL",
				});
			}
		}),

	// Update file metadata
	updateFile: protectedProcedure
		.input(updateFileSchema)
		.mutation(async ({ input, ctx }) => {
			try {
				// Check if file exists and belongs to user
				const file = await db
					.select()
					.from(files)
					.where(
						and(
							eq(files.id, input.id),
							eq(files.userId, ctx.session.user.id),
							eq(files.status, "active"),
						),
					)
					.limit(1);

				if (!file[0]) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "File not found",
					});
				}

				// Update file
				await db
					.update(files)
					.set({
						originalName: input.originalName || file[0].originalName,
						isPublic: input.isPublic ?? file[0].isPublic,
						metadata: input.metadata
							? { ...file[0].metadata, ...input.metadata }
							: file[0].metadata,
						updatedAt: new Date(),
					})
					.where(eq(files.id, input.id));

				// Invalidate cache
				await invalidateCache(`files:user:${ctx.session.user.id}:*`);

				logger.info({
					event: "file.updated",
					message: `File updated: ${input.id}`,
					fileId: input.id,
					userId: ctx.session.user.id,
					updates: Object.keys(input).filter((k) => k !== "id"),
				});

				return {
					message: "File updated successfully",
				};
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				logger.error({ message: "Update file error", error });
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update file",
				});
			}
		}),

	// Get file statistics
	getStats: protectedProcedure.query(async ({ ctx }) => {
		try {
			const cacheKey = `stats:user:${ctx.session.user.id}`;

			return await cache(
				cacheKey,
				async () => {
					const stats = await db
						.select({
							totalFiles: sql<number>`count(*)`,
							totalSize: sql<number>`sum(${files.size})`,
						})
						.from(files)
						.where(
							and(
								eq(files.userId, ctx.session.user.id),
								eq(files.status, "active"),
							),
						);

					const categoryStats = await db
						.select({
							category: sql<string>`
								CASE
									WHEN ${files.mimeType} LIKE 'image/%' THEN 'image'
									WHEN ${files.mimeType} LIKE 'video/%' THEN 'video'
									WHEN ${files.mimeType} LIKE 'application/pdf' THEN 'pdf'
									ELSE 'other'
								END
							`,
							count: sql<number>`count(*)`,
						})
						.from(files)
						.where(
							and(
								eq(files.userId, ctx.session.user.id),
								eq(files.status, "active"),
							),
						)
						.groupBy(sql`category`);

					return {
						totalFiles: stats[0]?.totalFiles || 0,
						totalSize: stats[0]?.totalSize || 0,
						formattedTotalSize: formatFileSize(stats[0]?.totalSize || 0),
						categoryBreakdown: categoryStats,
					};
				},
				3600, // Cache for 1 hour
			);
		} catch (error) {
			logger.error({ message: "Get stats error", error });
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch statistics",
			});
			}
		}),
});

/**
 * Handle direct file upload endpoint (Hono handler)
 * This endpoint receives file uploads via FormData
 */
export async function handleDirectUpload(c: Context) {
	const childLogger = apiLogger;

	try {
		// Get form data
		const formData = await c.req.formData();
		const file = formData.get("file") as File;

		if (!file) {
			return c.json({ error: "No file provided" }, 400);
		}

		// Convert File to Buffer
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Process the file
		const processed = await processUploadedFile(
			buffer,
			file.name,
			file.type,
			{
				generateThumbnail: file.type.startsWith("image/"),
				maxWidth: 2000,
				maxHeight: 2000,
				quality: 85,
			}
		);

		// Upload to MinIO
		const uploadResult = await uploadFile(
			processed.buffer,
			file.name,
			file.type,
		);

		// Save to database if user is authenticated
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (session?.user) {
			const fileId = nanoid();
			await db.insert(files).values({
				id: fileId,
				originalName: file.name,
				fileName: uploadResult.fileName,
				mimeType: file.type,
				size: uploadResult.size,
				url: uploadResult.url,
				userId: session.user.id,
				metadata: processed.metadata,
				isPublic: true,
				status: "active",
				processingStatus: "completed",
			});

			childLogger.info({
				event: "direct.upload.success",
				message: `Direct upload successful: ${file.name}`,
				fileId,
				userId: session.user.id,
				fileName: file.name,
				size: uploadResult.size,
			});

			return c.json({
				id: fileId,
				url: uploadResult.url,
				fileName: uploadResult.fileName,
				size: uploadResult.size,
			});
		}

		// Anonymous upload
		childLogger.info({
			event: "direct.upload.anonymous",
			message: `Anonymous upload successful: ${file.name}`,
			fileName: file.name,
			size: uploadResult.size,
		});

		return c.json({
			url: uploadResult.url,
			fileName: uploadResult.fileName,
			size: uploadResult.size,
		});
	} catch (error) {
		childLogger.error({
			event: "direct.upload.error",
			message: `Direct upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			error: error instanceof Error ? error.message : "Unknown error",
		});

		return c.json(
			{ error: "Failed to upload file" },
			500
		);
	}
}