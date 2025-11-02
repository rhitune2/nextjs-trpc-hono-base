// Server-side logger exports
export { logger, serverLogger, LogLevels, type LogLevel } from "./server";
export type { default as ServerLogger } from "./server";

// Database logger exports
export {
	saveLogToDatabase,
	formatLogForDatabase,
	forceFlushLogs,
	getLogsFromDatabase,
	logToDb,
} from "./db";

// Re-export for backward compatibility
import { logger } from "./server";
export { logger as default };

// API Logger - specialized logger for API endpoints
export const apiLogger = logger.child({ source: "api" });

// tRPC Logger - specialized logger for tRPC
export const trpcLogger = logger.child({ source: "trpc" });

// Structured Logger class for advanced logging
export class StructuredLogger {
	private source: string;
	private context: Record<string, any>;

	constructor(source: string, context: Record<string, any> = {}) {
		this.source = source;
		this.context = context;
	}

	logEvent(level: "trace" | "debug" | "info" | "warn" | "error" | "fatal", event: string, data?: any) {
		logger[level]({
			event,
			source: this.source,
			...this.context,
			...data,
		});
	}

	logPerformance(operation: string, duration: number, data?: any) {
		logger.debug({
			event: "performance",
			source: this.source,
			operation,
			duration,
			...this.context,
			...data,
		});
	}

	logError(event: string, error: Error | any, data?: any) {
		logger.error({
			event,
			source: this.source,
			error: error instanceof Error
				? {
						name: error.name,
						message: error.message,
						stack: error.stack,
					}
				: error,
			...this.context,
			...data,
		});
	}
}

// Hono middleware for logging
import type { Context, Next } from "hono";

export function loggerMiddleware() {
	return async (c: Context, next: Next) => {
		const start = Date.now();
		const method = c.req.method;
		const path = c.req.path;

		// Log request
		logger.debug({
			event: "request.start",
			method,
			path,
			ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
			userAgent: c.req.header("user-agent") || "unknown",
		});

		await next();

		const duration = Date.now() - start;
		const status = c.res.status;

		// Log response
		const logLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
		logger[logLevel]({
			event: "request.complete",
			method,
			path,
			status,
			duration,
			ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
		});
	};
}

export function performanceMiddleware() {
	return async (c: Context, next: Next) => {
		const start = Date.now();
		await next();
		const duration = Date.now() - start;

		if (duration > 1000) {
			logger.warn({
				event: "slow.request",
				path: c.req.path,
				method: c.req.method,
				duration,
				threshold: 1000,
			});
		}
	};
}

export function errorLoggingMiddleware() {
	return async (c: Context, next: Next) => {
		try {
			await next();
		} catch (error) {
			logger.error({
				event: "request.error",
				path: c.req.path,
				method: c.req.method,
				error: error instanceof Error
					? {
							name: error.name,
							message: error.message,
							stack: error.stack,
						}
					: error,
				ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
			});

			throw error;
		}
	};
}

