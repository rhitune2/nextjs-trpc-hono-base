import { protectedProcedure, publicProcedure, router } from "@/lib/api/trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { logs, logStats } from "@/db/schema/logs";
import { eq, desc, and, gte, lte, like, sql, inArray } from "drizzle-orm";
import type { Context } from "hono";
import { apiLogger } from "@/lib/logger";

// Import schemas from global types
import {
	getLogsSchema,
	getLogStatsSchema,
	deleteOldLogsSchema,
	getUserSessionsSchema,
} from "../types/logs";

// Export types for use in other files
export * from "../types/logs";

export const logsRouter = router({
	// Get logs with filtering
	getLogs: protectedProcedure
		.input(getLogsSchema)
		.query(async ({ input, ctx }) => {
			try {
				const conditions = [];

				// Build filter conditions
				if (input.level) {
					conditions.push(eq(logs.level, input.level));
				}

				if (input.source) {
					conditions.push(eq(logs.source, input.source));
				}

				if (input.userId) {
					conditions.push(eq(logs.userId, input.userId));
				}

				if (input.sessionId) {
					conditions.push(eq(logs.sessionId, input.sessionId));
				}

				if (input.event) {
					conditions.push(eq(logs.event, input.event));
				}

				if (input.search) {
					conditions.push(like(logs.message, `%${input.search}%`));
				}

				if (input.startDate) {
					const date = new Date(input.startDate);
					conditions.push(gte(logs.createdAt, date));
				}

				if (input.endDate) {
					const date = new Date(input.endDate);
					conditions.push(lte(logs.createdAt, date));
				}

				// Query logs
				const [logResults, countResult] = await Promise.all([
					db
						.select()
						.from(logs)
						.where(conditions.length > 0 ? and(...conditions) : undefined)
						.orderBy(desc(logs.createdAt))
						.limit(input.limit)
						.offset(input.offset),

					db
						.select({ count: sql<number>`count(*)` })
						.from(logs)
						.where(conditions.length > 0 ? and(...conditions) : undefined),
				]);

				return {
					logs: logResults,
					total: countResult[0]?.count || 0,
					limit: input.limit,
					offset: input.offset,
					hasMore: input.offset + logResults.length < (countResult[0]?.count || 0),
				};
			} catch (error) {
				console.error("Error fetching logs:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch logs",
				});
			}
		}),

	// Get log statistics
	getStats: protectedProcedure
		.input(getLogStatsSchema)
		.query(async ({ input }) => {
			try {
				const conditions = [];

				if (input.startDate) {
					const date = new Date(input.startDate);
					conditions.push(gte(logs.createdAt, date));
				}

				if (input.endDate) {
					const date = new Date(input.endDate);
					conditions.push(lte(logs.createdAt, date));
				}

				// Get overall counts
				const levelCounts = await db
					.select({
						level: logs.level,
						count: sql<number>`count(*)`,
					})
					.from(logs)
					.where(conditions.length > 0 ? and(...conditions) : undefined)
					.groupBy(logs.level);

				const sourceCounts = await db
					.select({
						source: logs.source,
						count: sql<number>`count(*)`,
					})
					.from(logs)
					.where(conditions.length > 0 ? and(...conditions) : undefined)
					.groupBy(logs.source);

				// Get time series data
				let timeGrouping;
				switch (input.groupBy) {
					case "hour":
						timeGrouping = sql`DATE_FORMAT(${logs.createdAt}, '%Y-%m-%d %H:00:00')`;
						break;
					case "week":
						timeGrouping = sql`DATE(DATE_SUB(${logs.createdAt}, INTERVAL WEEKDAY(${logs.createdAt}) DAY))`;
						break;
					case "month":
						timeGrouping = sql`DATE_FORMAT(${logs.createdAt}, '%Y-%m-01')`;
						break;
					default: // day
						timeGrouping = sql`DATE(${logs.createdAt})`;
				}

				const timeSeries = await db
					.select({
						time: timeGrouping,
						total: sql<number>`count(*)`,
						errors: sql<number>`sum(case when ${logs.level} = 'error' then 1 else 0 end)`,
						warnings: sql<number>`sum(case when ${logs.level} = 'warn' then 1 else 0 end)`,
					})
					.from(logs)
					.where(conditions.length > 0 ? and(...conditions) : undefined)
					.groupBy(timeGrouping)
					.orderBy(timeGrouping);

				// Get top events
				const topEvents = await db
					.select({
						event: logs.event,
						count: sql<number>`count(*)`,
					})
					.from(logs)
					.where(
						conditions.length > 0
							? and(...conditions, sql`${logs.event} IS NOT NULL`)
							: sql`${logs.event} IS NOT NULL`
					)
					.groupBy(logs.event)
					.orderBy(desc(sql`count(*)`))
					.limit(10);

				// Get recent errors
				const recentErrors = await db
					.select({
						id: logs.id,
						message: logs.message,
						errorMessage: logs.errorMessage,
						createdAt: logs.createdAt,
						source: logs.source,
					})
					.from(logs)
					.where(
						conditions.length > 0
							? and(...conditions, eq(logs.level, "error"))
							: eq(logs.level, "error")
					)
					.orderBy(desc(logs.createdAt))
					.limit(10);

				return {
					levelCounts,
					sourceCounts,
					timeSeries,
					topEvents,
					recentErrors,
				};
			} catch (error) {
				console.error("Error fetching log stats:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch log statistics",
				});
			}
		}),

	// Get specific log by ID
	getLogById: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			try {
				const log = await db
					.select()
					.from(logs)
					.where(eq(logs.id, input.id))
					.limit(1);

				if (!log[0]) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Log not found",
					});
				}

				return log[0];
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch log",
				});
			}
		}),

	// Delete old logs
	deleteOldLogs: protectedProcedure
		.input(deleteOldLogsSchema)
		.mutation(async ({ input, ctx }) => {
			try {
				// TODO: Check for admin permissions
				// if (!ctx.session.user.isAdmin) {
				//   throw new TRPCError({
				//     code: "FORBIDDEN",
				//     message: "Only admins can delete logs",
				//   });
				// }

				const cutoffDate = new Date();
				cutoffDate.setDate(cutoffDate.getDate() - input.olderThanDays);

				const conditions = [lte(logs.createdAt, cutoffDate)];

				if (input.level) {
					conditions.push(eq(logs.level, input.level));
				}

				if (input.source) {
					conditions.push(eq(logs.source, input.source));
				}

				// Get count of logs to be deleted
				const countResult = await db
					.select({ count: sql<number>`count(*)` })
					.from(logs)
					.where(and(...conditions));

				const count = countResult[0]?.count || 0;

				// Delete the logs
				if (count > 0) {
					await db.delete(logs).where(and(...conditions));
				}

				return {
					deletedCount: count,
					message: `Deleted ${count} logs older than ${input.olderThanDays} days`,
				};
			} catch (error) {
				console.error("Error deleting old logs:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete old logs",
				});
			}
		}),

	// Get distinct events
	getEvents: protectedProcedure.query(async () => {
		try {
			const events = await db
				.selectDistinct({
					event: logs.event,
				})
				.from(logs)
				.where(sql`${logs.event} IS NOT NULL`)
				.orderBy(logs.event);

			return events.map(e => e.event).filter(Boolean);
		} catch (error) {
			console.error("Error fetching events:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch events",
			});
		}
	}),

	// Get user sessions
	getUserSessions: protectedProcedure
		.input(getUserSessionsSchema)
		.query(async ({ input }) => {
			try {
				const sessions = await db
					.selectDistinct({
						sessionId: logs.sessionId,
						firstLog: sql<Date>`MIN(${logs.createdAt})`,
						lastLog: sql<Date>`MAX(${logs.createdAt})`,
						logCount: sql<number>`COUNT(*)`,
					})
					.from(logs)
					.where(
						and(
							eq(logs.userId, input.userId),
							sql`${logs.sessionId} IS NOT NULL`
						)
					)
					.groupBy(logs.sessionId)
					.orderBy(desc(sql`MAX(${logs.createdAt})`));

				return sessions;
			} catch (error) {
				console.error("Error fetching user sessions:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch user sessions",
				});
			}
		}),
});

/**
 * Handle client logs endpoint (Hono handler)
 * This endpoint receives logs from client-side applications
 */
export async function handleClientLogs(c: Context) {
	const childLogger = apiLogger;

	try {
		const body = await c.req.json();
		const { sessionId, logs, metadata } = body;

		// Import database logging functions
		const { saveLogToDatabase, formatLogForDatabase } = await import("@/lib/logger/db");

		// Get client IP and user agent
		const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
		const userAgent = c.req.header("user-agent") || "";

		// Process each log entry
		for (const log of logs) {
			// Create log object with client context
			const logData = {
				source: "client",
				sessionId,
				clientTimestamp: log.timestamp,
				level: log.level,
				message: log.message,
				data: log.data,
				error: log.error,
				context: log.context,
				performance: log.performance,
				metadata,
				ipAddress,
				userAgent,
			};

			// Save to database
			const dbLogData = formatLogForDatabase(
				log.level,
				log.message,
				{
					...logData,
					event: log.event,
					duration: log.performance?.duration,
				},
				"client"
			);

			// Fire and forget - don't await
			saveLogToDatabase(dbLogData).catch(err => {
				console.error("Failed to save client log to database:", err);
			});

			// Also log to console/file using pino
			switch (log.level) {
				case "error":
					childLogger.error(logData);
					break;
				case "warn":
					childLogger.warn(logData);
					break;
				case "info":
					childLogger.info(logData);
					break;
				case "debug":
					childLogger.debug(logData);
					break;
				case "trace":
					childLogger.trace(logData);
					break;
				default:
					childLogger.debug(logData);
			}
		}

		return c.json({ success: true, processed: logs.length });
	} catch (error) {
		childLogger.error({
			event: "client.logs.error",
			message: `Failed to process client logs: ${error instanceof Error ? error.message : "Unknown error"}`,
			error: error instanceof Error ? error.message : "Unknown error",
		});

		return c.json({ success: false, error: "Failed to process logs" }, 500);
	}
}