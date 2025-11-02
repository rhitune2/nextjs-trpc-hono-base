import { z } from "zod";

/**
 * Logs Router Types
 * 
 * Contains all schemas, response types, and inferred types for logs router
 */

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const getLogsSchema = z.object({
	level: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).optional(),
	source: z.enum(["client", "server", "api", "worker"]).optional(),
	userId: z.string().optional(),
	sessionId: z.string().optional(),
	event: z.string().optional(),
	search: z.string().optional(),
	startDate: z.string().or(z.date()).optional(),
	endDate: z.string().or(z.date()).optional(),
	limit: z.number().min(1).max(1000).default(100),
	offset: z.number().min(0).default(0),
});

export const getLogStatsSchema = z.object({
	startDate: z.string().or(z.date()).optional(),
	endDate: z.string().or(z.date()).optional(),
	groupBy: z.enum(["hour", "day", "week", "month"]).default("day"),
});

export const deleteOldLogsSchema = z.object({
	olderThanDays: z.number().min(1).max(365),
	level: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).optional(),
	source: z.enum(["client", "server", "api", "worker"]).optional(),
});

export const getUserSessionsSchema = z.object({
	userId: z.string(),
});

// ============================================================================
// INFERRED INPUT TYPES
// ============================================================================

export type GetLogsInput = z.infer<typeof getLogsSchema>;
export type GetLogStatsInput = z.infer<typeof getLogStatsSchema>;
export type DeleteOldLogsInput = z.infer<typeof deleteOldLogsSchema>;
export type GetUserSessionsInput = z.infer<typeof getUserSessionsSchema>;

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface LogItem {
	id: string;
	level: string;
	source: string;
	message: string;
	event: string | null;
	userId: string | null;
	sessionId: string | null;
	metadata: Record<string, any> | null;
	errorMessage: string | null;
	createdAt: Date;
}

export interface GetLogsResponse {
	logs: LogItem[];
	total: number;
	limit: number;
	offset: number;
	hasMore: boolean;
}

export interface LogStatsResponse {
	levelCounts: Array<{
		level: string;
		count: number;
	}>;
	sourceCounts: Array<{
		source: string;
		count: number;
	}>;
	timeSeries: Array<{
		time: string | Date;
		total: number;
		errors: number;
		warnings: number;
	}>;
	topEvents: Array<{
		event: string;
		count: number;
	}>;
	recentErrors: Array<{
		id: string;
		message: string;
		errorMessage: string | null;
		createdAt: Date;
		source: string;
	}>;
}

export interface GetLogByIdResponse extends LogItem {
	// All fields from LogItem
}

export interface DeleteOldLogsResponse {
	deletedCount: number;
	message: string;
}

export interface GetEventsResponse {
	events: string[];
}

export interface UserSession {
	sessionId: string;
	firstLog: Date;
	lastLog: Date;
	logCount: number;
}

export interface GetUserSessionsResponse {
	sessions: UserSession[];
}

export interface HandleClientLogsResponse {
	success: boolean;
	processed?: number;
	error?: string;
}

