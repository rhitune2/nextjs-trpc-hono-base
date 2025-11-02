import { db } from "@/db";
import { logs, type NewLog } from "@/db/schema/logs";
import { nanoid } from "nanoid";

// Queue for batching log writes
let logQueue: NewLog[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// Configuration
const BATCH_SIZE = 50; // Maximum logs to write at once
const FLUSH_INTERVAL = 5000; // Flush every 5 seconds

/**
 * Add log to database queue
 */
export async function saveLogToDatabase(logData: Partial<NewLog>) {
	try {
		// Generate unique ID if not provided
		if (!logData.id) {
			logData.id = `log_${nanoid()}`;
		}

		// Add to queue
		logQueue.push(logData as NewLog);

		// Check if we should flush immediately
		if (logQueue.length >= BATCH_SIZE) {
			await flushLogs();
		} else if (!flushTimer) {
			// Set up timer to flush periodically
			flushTimer = setTimeout(async () => {
				await flushLogs();
			}, FLUSH_INTERVAL);
		}
	} catch (error) {
		// Don't throw errors from logging to avoid breaking the app
		console.error("Failed to queue log:", error);
	}
}

/**
 * Flush logs to database
 */
async function flushLogs() {
	if (logQueue.length === 0) {
		return;
	}

	const logsToWrite = [...logQueue];
	logQueue = [];

	// Clear timer
	if (flushTimer) {
		clearTimeout(flushTimer);
		flushTimer = null;
	}

	try {
		// Batch insert logs
		await db.insert(logs).values(logsToWrite);

		if (process.env.NODE_ENV === "development") {
			console.log(`Flushed ${logsToWrite.length} logs to database`);
		}
	} catch (error) {
		console.error("Failed to write logs to database:", error);

		// If database write fails, try to save critical logs individually
		const criticalLogs = logsToWrite.filter(log => log.level === "error" || log.level === "fatal");

		for (const log of criticalLogs) {
			try {
				await db.insert(logs).values(log);
			} catch (innerError) {
				console.error("Failed to write critical log:", innerError);
			}
		}
	}
}

/**
 * Force flush all pending logs
 */
export async function forceFlushLogs() {
	await flushLogs();
}

/**
 * Format log data for database
 */
export function formatLogForDatabase(
	level: string,
	message: string,
	data?: any,
	source: "client" | "server" | "api" | "worker" = "server"
): Partial<NewLog> {
	const logEntry: Partial<NewLog> = {
		id: `log_${nanoid()}`,
		level: level as any,
		message: typeof message === "object" ? JSON.stringify(message) : message,
		source,
		serverTimestamp: new Date(),
		createdAt: new Date(),
	};

	// Extract specific fields from data
	if (data && typeof data === "object") {
		// Error handling
		if (data.error || data instanceof Error) {
			const error = data.error || data;
			logEntry.errorMessage = error.message || String(error);
			logEntry.errorStack = error.stack;
			logEntry.errorCode = error.code;
		}

		// User and session info
		if (data.userId) logEntry.userId = data.userId;
		if (data.sessionId) logEntry.sessionId = data.sessionId;
		if (data.ipAddress) logEntry.ipAddress = data.ipAddress;
		if (data.userAgent) logEntry.userAgent = data.userAgent;
		if (data.requestId) logEntry.requestId = data.requestId;

		// Request info
		if (data.method) logEntry.method = data.method;
		if (data.path) logEntry.path = data.path;
		if (data.statusCode) logEntry.statusCode = data.statusCode;

		// Event and performance
		if (data.event) logEntry.event = data.event;
		if (data.duration) logEntry.duration = data.duration;

		// Client timestamp
		if (data.clientTimestamp) {
			logEntry.clientTimestamp = new Date(data.clientTimestamp);
		}

		// Context and metadata
		const {
			error, userId, sessionId, ipAddress, userAgent,
			requestId, method, path, statusCode, event,
			duration, clientTimestamp, ...rest
		} = data;

		if (Object.keys(rest).length > 0) {
			logEntry.context = rest;
		}

		if (data.metadata) {
			logEntry.metadata = data.metadata;
		}
	}

	return logEntry;
}

// Graceful shutdown - flush logs on exit
if (typeof process !== "undefined") {
	process.on("exit", () => {
		flushLogs();
	});

	process.on("SIGINT", async () => {
		await flushLogs();
		process.exit(0);
	});

	process.on("SIGTERM", async () => {
		await flushLogs();
		process.exit(0);
	});
}

// Export functions for creating specific log types
export const logToDb = {
	trace: (message: string, data?: any) =>
		saveLogToDatabase(formatLogForDatabase("trace", message, data)),

	debug: (message: string, data?: any) =>
		saveLogToDatabase(formatLogForDatabase("debug", message, data)),

	info: (message: string, data?: any) =>
		saveLogToDatabase(formatLogForDatabase("info", message, data)),

	warn: (message: string, data?: any) =>
		saveLogToDatabase(formatLogForDatabase("warn", message, data)),

	error: (message: string, data?: any) =>
		saveLogToDatabase(formatLogForDatabase("error", message, data)),

	fatal: (message: string, data?: any) =>
		saveLogToDatabase(formatLogForDatabase("fatal", message, data)),
};

/**
 * Get logs from database with filtering
 */
export async function getLogsFromDatabase(filters?: {
	level?: string;
	source?: string;
	userId?: string;
	sessionId?: string;
	startDate?: Date;
	endDate?: Date;
	limit?: number;
	offset?: number;
}) {
	// This will be implemented in a separate query builder
	// For now, just return a placeholder
	return {
		logs: [],
		total: 0,
	};
}