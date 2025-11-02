import { saveLogToDatabase, formatLogForDatabase } from "./db";

// Log levels
export const LogLevels = {
	TRACE: "trace",
	DEBUG: "debug",
	INFO: "info",
	WARN: "warn",
	ERROR: "error",
	FATAL: "fatal",
} as const;

export type LogLevel = (typeof LogLevels)[keyof typeof LogLevels];

// Logger configuration
interface LoggerConfig {
	enabled: boolean;
	level: LogLevel;
	saveToDatabase: boolean;
}

// Default configuration
const defaultConfig: LoggerConfig = {
	enabled: true,
	level: process.env.NODE_ENV === "development" ? LogLevels.DEBUG : LogLevels.INFO,
	saveToDatabase: process.env.NODE_ENV === "production",
};

class ServerLogger {
	private config: LoggerConfig;
	private metadata: Record<string, any> = {};

	constructor(config: Partial<LoggerConfig> = {}) {
		this.config = { ...defaultConfig, ...config };
		this.initializeMetadata();
	}

	private initializeMetadata() {
		this.metadata = {
			environment: process.env.NODE_ENV || "development",
			serverTimestamp: new Date().toISOString(),
		};
	}

	private shouldLog(level: LogLevel): boolean {
		if (!this.config.enabled) return false;

		const levels = Object.values(LogLevels);
		const currentLevelIndex = levels.indexOf(this.config.level);
		const messageLevelIndex = levels.indexOf(level);

		return messageLevelIndex >= currentLevelIndex;
	}

	private formatMessage(level: LogLevel, message: string, data?: any): any {
		const formatted: any = {
			level,
			message: typeof message === "object" ? JSON.stringify(message) : message,
			timestamp: new Date().toISOString(),
			context: { ...this.metadata },
		};

		if (data) {
			if (typeof data === "object") {
				// If data has a message property, merge it
				if (data.message) {
					formatted.message = data.message;
					const { message: _, ...rest } = data;
					formatted.data = rest;
				} else {
					formatted.data = data;
				}

				// Handle error objects
				if (data.error || data instanceof Error) {
					const error = data.error || data;
					formatted.error = error instanceof Error
						? {
								name: error.name,
								message: error.message,
								stack: error.stack,
							}
						: error;
				}
			} else {
				formatted.data = { value: data };
			}
		}

		return formatted;
	}

	private log(level: LogLevel, message: string, data?: any) {
		if (!this.shouldLog(level)) return;

		const formatted = this.formatMessage(level, message, data);

		// Console output in development
		if (process.env.NODE_ENV === "development") {
			const consoleMethod =
				level === "error" || level === "fatal"
					? "error"
					: level === "warn"
						? "warn"
						: "log";
			console[consoleMethod](`[${level.toUpperCase()}]`, formatted.message, formatted.data || "");
		}

		// Save to database if enabled
		if (this.config.saveToDatabase) {
			const logData = formatLogForDatabase(
				level,
				formatted.message,
				formatted.data || formatted,
				"server"
			);
			saveLogToDatabase(logData).catch((error) => {
				// Silently fail logging errors in production
				if (process.env.NODE_ENV === "development") {
					console.error("Failed to save log to database:", error);
				}
			});
		}
	}

	// Public logging methods
	trace(message: string | { message: string; [key: string]: any }, data?: any) {
		if (typeof message === "object") {
			const { message: msg, ...rest } = message;
			this.log(LogLevels.TRACE, msg, { ...rest, ...data });
		} else {
			this.log(LogLevels.TRACE, message, data);
		}
	}

	debug(message: string | { message: string; [key: string]: any }, data?: any) {
		if (typeof message === "object") {
			const { message: msg, ...rest } = message;
			this.log(LogLevels.DEBUG, msg, { ...rest, ...data });
		} else {
			this.log(LogLevels.DEBUG, message, data);
		}
	}

	info(message: string | { message: string; [key: string]: any }, data?: any) {
		if (typeof message === "object") {
			const { message: msg, ...rest } = message;
			this.log(LogLevels.INFO, msg, { ...rest, ...data });
		} else {
			this.log(LogLevels.INFO, message, data);
		}
	}

	warn(message: string | { message: string; [key: string]: any }, data?: any) {
		if (typeof message === "object") {
			const { message: msg, ...rest } = message;
			this.log(LogLevels.WARN, msg, { ...rest, ...data });
		} else {
			this.log(LogLevels.WARN, message, data);
		}
	}

	error(message: string | { message: string; [key: string]: any }, error?: any, data?: any) {
		if (typeof message === "object") {
			const { message: msg, ...rest } = message;
			this.log(LogLevels.ERROR, msg, { ...rest, error, ...data });
		} else {
			this.log(LogLevels.ERROR, message, { error, ...data });
		}
	}

	fatal(message: string, data?: any) {
		this.log(LogLevels.FATAL, message, data);
	}

	// Create child logger with additional context
	child(context: Record<string, any>): ServerLogger {
		const childLogger = new ServerLogger(this.config);
		childLogger.metadata = { ...this.metadata, ...context };
		return childLogger;
	}

	// Update configuration
	updateConfig(config: Partial<LoggerConfig>) {
		this.config = { ...this.config, ...config };
	}
}

// Create and export singleton instance
export const serverLogger = new ServerLogger();
export const logger = serverLogger; // Alias for easier imports
export default serverLogger;

