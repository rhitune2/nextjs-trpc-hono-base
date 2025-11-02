import {
	mysqlTable,
	varchar,
	text,
	timestamp,
	int,
	json,
	index,
	boolean,
	decimal,
} from "drizzle-orm/mysql-core";
import { user } from "./auth";

// File uploads table
export const files = mysqlTable(
	"files",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		originalName: varchar("original_name", { length: 255 }).notNull(),
		fileName: varchar("file_name", { length: 255 }).notNull(),
		mimeType: varchar("mime_type", { length: 100 }).notNull(),
		size: int("size").notNull(), // in bytes
		url: text("url").notNull(),
		thumbnailUrl: text("thumbnail_url"),
		path: varchar("path", { length: 255 }), // folder structure in MinIO

		// User relation
		userId: varchar("user_id", { length: 36 }).references(() => user.id, {
			onDelete: "set null",
		}),

		// File metadata
		metadata: json("metadata").$type<{
			width?: number;
			height?: number;
			duration?: number;
			encoding?: string;
			[key: string]: any;
		}>(),

		// Status and visibility
		status: varchar("status", { length: 20 })
			.notNull()
			.default("active")
			.$type<"active" | "deleted" | "archived">(),
		isPublic: boolean("is_public").notNull().default(true),

		// Processing status
		processingStatus: varchar("processing_status", { length: 20 })
			.$type<"pending" | "processing" | "completed" | "failed">()
			.default("completed"),
		processingError: text("processing_error"),

		// Timestamps
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => ({
		userIdx: index("user_idx").on(table.userId),
		statusIdx: index("status_idx").on(table.status),
		createdAtIdx: index("created_at_idx").on(table.createdAt),
		fileNameIdx: index("file_name_idx").on(table.fileName),
		mimeTypeIdx: index("mime_type_idx").on(table.mimeType),
	}),
);

// File categories/folders
export const fileCategories = mysqlTable(
	"file_categories",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		name: varchar("name", { length: 100 }).notNull(),
		slug: varchar("slug", { length: 100 }).notNull().unique(),
		description: text("description"),
		parentId: varchar("parent_id", { length: 36 }),
		userId: varchar("user_id", { length: 36 }).references(() => user.id, {
			onDelete: "cascade",
		}),
		isPublic: boolean("is_public").notNull().default(false),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
	},
	(table) => ({
		slugIdx: index("slug_idx").on(table.slug),
		userIdx: index("user_idx").on(table.userId),
		parentIdx: index("parent_idx").on(table.parentId),
	}),
);

// File to category relation (many-to-many)
export const fileCategoryRelations = mysqlTable(
	"file_category_relations",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		fileId: varchar("file_id", { length: 36 })
			.notNull()
			.references(() => files.id, { onDelete: "cascade" }),
		categoryId: varchar("category_id", { length: 36 })
			.notNull()
			.references(() => fileCategories.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => ({
		fileIdx: index("file_idx").on(table.fileId),
		categoryIdx: index("category_idx").on(table.categoryId),
		uniqueRelation: index("unique_file_category").on(
			table.fileId,
			table.categoryId,
		),
	}),
);

// File access logs
export const fileAccessLogs = mysqlTable(
	"file_access_logs",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		fileId: varchar("file_id", { length: 36 })
			.notNull()
			.references(() => files.id, { onDelete: "cascade" }),
		userId: varchar("user_id", { length: 36 }).references(() => user.id, {
			onDelete: "set null",
		}),
		action: varchar("action", { length: 20 })
			.notNull()
			.$type<"view" | "download" | "share" | "delete">(),
		ipAddress: varchar("ip_address", { length: 45 }),
		userAgent: text("user_agent"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => ({
		fileIdx: index("file_idx").on(table.fileId),
		userIdx: index("user_idx").on(table.userId),
		actionIdx: index("action_idx").on(table.action),
		createdAtIdx: index("created_at_idx").on(table.createdAt),
	}),
);

// File sharing links
export const fileSharingLinks = mysqlTable(
	"file_sharing_links",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		fileId: varchar("file_id", { length: 36 })
			.notNull()
			.references(() => files.id, { onDelete: "cascade" }),
		token: varchar("token", { length: 100 }).notNull().unique(),
		password: varchar("password", { length: 255 }), // hashed password if protected
		maxDownloads: int("max_downloads"),
		downloadCount: int("download_count").notNull().default(0),
		expiresAt: timestamp("expires_at"),
		createdBy: varchar("created_by", { length: 36 }).references(
			() => user.id,
			{ onDelete: "set null" },
		),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		lastAccessedAt: timestamp("last_accessed_at"),
	},
	(table) => ({
		tokenIdx: index("token_idx").on(table.token),
		fileIdx: index("file_idx").on(table.fileId),
		expiresIdx: index("expires_idx").on(table.expiresAt),
	}),
);

// Upload sessions for multipart uploads
export const uploadSessions = mysqlTable(
	"upload_sessions",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		userId: varchar("user_id", { length: 36 }).references(() => user.id, {
			onDelete: "cascade",
		}),
		fileName: varchar("file_name", { length: 255 }).notNull(),
		mimeType: varchar("mime_type", { length: 100 }).notNull(),
		totalSize: int("total_size").notNull(),
		uploadedSize: int("uploaded_size").notNull().default(0),
		chunkSize: int("chunk_size").notNull(),
		totalChunks: int("total_chunks").notNull(),
		uploadedChunks: int("uploaded_chunks").notNull().default(0),
		status: varchar("status", { length: 20 })
			.notNull()
			.default("pending")
			.$type<"pending" | "uploading" | "completed" | "failed" | "cancelled">(),
		metadata: json("metadata"),
		expiresAt: timestamp("expires_at").notNull(),
		completedAt: timestamp("completed_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
	},
	(table) => ({
		userIdx: index("user_idx").on(table.userId),
		statusIdx: index("status_idx").on(table.status),
		expiresIdx: index("expires_idx").on(table.expiresAt),
	}),
);

// File versions for version control
export const fileVersions = mysqlTable(
	"file_versions",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		fileId: varchar("file_id", { length: 36 })
			.notNull()
			.references(() => files.id, { onDelete: "cascade" }),
		versionNumber: int("version_number").notNull(),
		fileName: varchar("file_name", { length: 255 }).notNull(),
		size: int("size").notNull(),
		url: text("url").notNull(),
		changeDescription: text("change_description"),
		createdBy: varchar("created_by", { length: 36 }).references(
			() => user.id,
			{ onDelete: "set null" },
		),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => ({
		fileIdx: index("file_idx").on(table.fileId),
		versionIdx: index("version_idx").on(table.fileId, table.versionNumber),
	}),
);

// File processing queue
export const fileProcessingQueue = mysqlTable(
	"file_processing_queue",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		fileId: varchar("file_id", { length: 36 })
			.notNull()
			.references(() => files.id, { onDelete: "cascade" }),
		processingType: varchar("processing_type", { length: 50 })
			.notNull()
			.$type<
				| "thumbnail"
				| "compress"
				| "resize"
				| "watermark"
				| "virus_scan"
				| "ocr"
				| "metadata_extraction"
			>(),
		priority: int("priority").notNull().default(5), // 1-10, 1 is highest
		status: varchar("status", { length: 20 })
			.notNull()
			.default("pending")
			.$type<"pending" | "processing" | "completed" | "failed" | "cancelled">(),
		attempts: int("attempts").notNull().default(0),
		maxAttempts: int("max_attempts").notNull().default(3),
		processingData: json("processing_data"),
		result: json("result"),
		error: text("error"),
		startedAt: timestamp("started_at"),
		completedAt: timestamp("completed_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
	},
	(table) => ({
		fileIdx: index("file_idx").on(table.fileId),
		statusIdx: index("status_idx").on(table.status),
		priorityIdx: index("priority_idx").on(table.priority),
		typeIdx: index("type_idx").on(table.processingType),
	}),
);

// File metadata search index
export const fileSearchIndex = mysqlTable(
	"file_search_index",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		fileId: varchar("file_id", { length: 36 })
			.notNull()
			.references(() => files.id, { onDelete: "cascade" }),
		content: text("content"), // extracted text content for search
		tags: text("tags"), // comma-separated tags
		customMetadata: json("custom_metadata"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
	},
	(table) => ({
		fileIdx: index("file_idx").on(table.fileId),
		fullTextIdx: index("fulltext_idx").on(table.content, table.tags),
	}),
);