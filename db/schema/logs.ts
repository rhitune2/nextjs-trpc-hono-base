import {
	mysqlTable,
	varchar,
	text,
	timestamp,
	int,
	json,
	index,
	mysqlEnum,
} from "drizzle-orm/mysql-core";

export const logs = mysqlTable(
	"logs",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`),

		// Log level
		level: mysqlEnum("level", ["trace", "debug", "info", "warn", "error", "fatal"])
			.notNull()
			.default("info"),

		// Main message
		message: text("message").notNull(),

		// Source of log (client/server)
		source: mysqlEnum("source", ["client", "server", "api", "worker"])
			.notNull()
			.default("server"),

		// Event type for categorization
		event: varchar("event", { length: 255 }),

		// User information
		userId: varchar("user_id", { length: 255 }),
		sessionId: varchar("session_id", { length: 255 }),

		// Request information
		ipAddress: varchar("ip_address", { length: 45 }), // Supports IPv6
		userAgent: text("user_agent"),
		requestId: varchar("request_id", { length: 255 }),
		method: varchar("method", { length: 10 }),
		path: text("path"),
		statusCode: int("status_code"),

		// Error details
		errorMessage: text("error_message"),
		errorStack: text("error_stack"),
		errorCode: varchar("error_code", { length: 100 }),

		// Performance metrics
		duration: int("duration"), // milliseconds

		// Additional data
		context: json("context"), // JSON field for flexible data
		metadata: json("metadata"), // Additional metadata

		// Timestamps
		clientTimestamp: timestamp("client_timestamp"), // When client sent the log
		serverTimestamp: timestamp("server_timestamp").defaultNow(), // When server received
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => ({
		// Indexes for fast queries
		levelIdx: index("idx_level").on(table.level),
		sourceIdx: index("idx_source").on(table.source),
		userIdIdx: index("idx_user_id").on(table.userId),
		sessionIdIdx: index("idx_session_id").on(table.sessionId),
		createdAtIdx: index("idx_created_at").on(table.createdAt),
		eventIdx: index("idx_event").on(table.event),
		// Composite indexes
		userLevelIdx: index("idx_user_level").on(table.userId, table.level),
		sourceLevelIdx: index("idx_source_level").on(table.source, table.level),
		sessionSourceIdx: index("idx_session_source").on(table.sessionId, table.source),
	})
);

// Types
export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;

// Log statistics table for aggregated data
export const logStats = mysqlTable(
	"log_stats",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => `stat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`),

		// Time window
		windowStart: timestamp("window_start").notNull(),
		windowEnd: timestamp("window_end").notNull(),

		// Aggregated counts
		totalLogs: int("total_logs").notNull().default(0),
		errorCount: int("error_count").notNull().default(0),
		warnCount: int("warn_count").notNull().default(0),
		infoCount: int("info_count").notNull().default(0),
		debugCount: int("debug_count").notNull().default(0),

		// Source breakdown
		clientLogs: int("client_logs").notNull().default(0),
		serverLogs: int("server_logs").notNull().default(0),

		// Performance metrics
		avgDuration: int("avg_duration"),
		maxDuration: int("max_duration"),
		minDuration: int("min_duration"),

		// Unique counts
		uniqueUsers: int("unique_users"),
		uniqueSessions: int("unique_sessions"),
		uniqueIps: int("unique_ips"),

		// Top events
		topEvents: json("top_events"), // Array of {event: string, count: number}
		topErrors: json("top_errors"), // Array of {error: string, count: number}

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
	},
	(table) => ({
		windowIdx: index("idx_window").on(table.windowStart, table.windowEnd),
		createdAtIdx: index("idx_created_at").on(table.createdAt),
	})
);

export type LogStats = typeof logStats.$inferSelect;
export type NewLogStats = typeof logStats.$inferInsert;

// Log retention policies
export const logRetentionPolicies = mysqlTable(
	"log_retention_policies",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => `policy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`),

		name: varchar("name", { length: 255 }).notNull(),
		description: text("description"),

		// Retention rules
		level: mysqlEnum("level", ["trace", "debug", "info", "warn", "error", "fatal"]),
		source: mysqlEnum("source", ["client", "server", "api", "worker"]),
		retentionDays: int("retention_days").notNull(),

		// Status
		isActive: int("is_active").notNull().default(1),
		lastExecuted: timestamp("last_executed"),
		deletedCount: int("deleted_count").default(0),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
	},
	(table) => ({
		activeIdx: index("idx_active").on(table.isActive),
		levelIdx: index("idx_level").on(table.level),
		sourceIdx: index("idx_source").on(table.source),
	})
);

export type LogRetentionPolicy = typeof logRetentionPolicies.$inferSelect;
export type NewLogRetentionPolicy = typeof logRetentionPolicies.$inferInsert;

// Export all schemas
export const logSchema = {
	logs,
	logStats,
	logRetentionPolicies,
};