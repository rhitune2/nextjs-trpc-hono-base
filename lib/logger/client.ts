"use client";

import { nanoid } from "nanoid";

// Log levels
export const LogLevels = {
	TRACE: "trace",
	DEBUG: "debug",
	INFO: "info",
	WARN: "warn",
	ERROR: "error",
} as const;

export type LogLevel = (typeof LogLevels)[keyof typeof LogLevels];

// Log entry interface
export interface LogEntry {
	level: LogLevel;
	message: string;
	timestamp: string;
	data?: Record<string, any>;
	error?: any;
	context?: Record<string, any>;
	performance?: {
		operation: string;
		duration: number;
	};
}

// Logger configuration
interface LoggerConfig {
	enabled: boolean;
	level: LogLevel;
	sendToServer: boolean;
	batchSize: number;
	batchInterval: number;
	endpoint: string;
	sessionId: string;
}

// Default configuration
const defaultConfig: LoggerConfig = {
	enabled: true,
	level: process.env.NODE_ENV === "development" ? LogLevels.DEBUG : LogLevels.INFO,
	sendToServer: process.env.NODE_ENV === "production",
	batchSize: 10,
	batchInterval: 5000, // 5 seconds
	endpoint: "/api/logs",
	sessionId: nanoid(),
};

class ClientLogger {
	private config: LoggerConfig;
	private logBuffer: LogEntry[] = [];
	private batchTimer: NodeJS.Timeout | null = null;
	private metadata: Record<string, any> = {};

	constructor(config: Partial<LoggerConfig> = {}) {
		this.config = { ...defaultConfig, ...config };
		this.initializeMetadata();

		// Start batch timer if sending to server
		if (this.config.sendToServer) {
			this.startBatchTimer();
		}

		// Listen for page unload to send remaining logs
		if (typeof window !== "undefined") {
			window.addEventListener("beforeunload", () => {
				this.flush();
			});
		}
	}

	private initializeMetadata() {
		if (typeof window !== "undefined") {
			this.metadata = {
				userAgent: navigator.userAgent,
				platform: navigator.platform,
				language: navigator.language,
				screenResolution: `${screen.width}x${screen.height}`,
				viewport: `${window.innerWidth}x${window.innerHeight}`,
				url: window.location.href,
			};
		}
	}

	private shouldLog(level: LogLevel): boolean {
		if (!this.config.enabled) return false;

		const levels = Object.values(LogLevels);
		const currentLevelIndex = levels.indexOf(this.config.level);
		const messageLevelIndex = levels.indexOf(level);

		return messageLevelIndex >= currentLevelIndex;
	}

	private formatMessage(level: LogLevel, message: string, data?: any): LogEntry {
		return {
			level,
			message,
			timestamp: new Date().toISOString(),
			data,
			context: this.metadata,
		};
	}

	private log(level: LogLevel, message: string, data?: any) {
		if (!this.shouldLog(level)) return;

		const entry = this.formatMessage(level, message, data);

		// Console output in development
		if (process.env.NODE_ENV === "development") {
			const consoleMethod = level === "error" ? "error" : level === "warn" ? "warn" : "log";
			console[consoleMethod](`[${level.toUpperCase()}]`, message, data || "");
		}

		// Add to buffer for server sending
		if (this.config.sendToServer) {
			this.logBuffer.push(entry);

			// Send immediately if buffer is full
			if (this.logBuffer.length >= this.config.batchSize) {
				this.flush();
			}
		}
	}

	private startBatchTimer() {
		if (this.batchTimer) return;

		this.batchTimer = setInterval(() => {
			if (this.logBuffer.length > 0) {
				this.flush();
			}
		}, this.config.batchInterval);
	}

	private async flush() {
		if (this.logBuffer.length === 0) return;

		const logs = [...this.logBuffer];
		this.logBuffer = [];

		try {
			await fetch(this.config.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					sessionId: this.config.sessionId,
					logs,
					metadata: this.metadata,
				}),
			});
		} catch (error) {
			// Silently fail in production
			if (process.env.NODE_ENV === "development") {
				console.error("Failed to send logs to server:", error);
			}
		}
	}

	// Public logging methods
	trace(message: string, data?: any) {
		this.log(LogLevels.TRACE, message, data);
	}

	debug(message: string, data?: any) {
		this.log(LogLevels.DEBUG, message, data);
	}

	info(message: string, data?: any) {
		this.log(LogLevels.INFO, message, data);
	}

	warn(message: string, data?: any) {
		this.log(LogLevels.WARN, message, data);
	}

	error(message: string, error?: any, data?: any) {
		const entry = this.formatMessage(LogLevels.ERROR, message, data);
		entry.error = error instanceof Error
			? {
					name: error.name,
					message: error.message,
					stack: error.stack,
				}
			: error;

		if (process.env.NODE_ENV === "development") {
			console.error(`[ERROR]`, message, error, data || "");
		}

		if (this.config.sendToServer) {
			this.logBuffer.push(entry);
			if (this.logBuffer.length >= this.config.batchSize) {
				this.flush();
			}
		}
	}

	// Performance logging
	time(label: string) {
		if (typeof window !== "undefined") {
			performance.mark(`${label}-start`);
		}
	}

	timeEnd(label: string, data?: any) {
		if (typeof window === "undefined") return;

		try {
			performance.mark(`${label}-end`);
			performance.measure(label, `${label}-start`, `${label}-end`);

			const measure = performance.getEntriesByName(label)[0];
			if (measure) {
				const entry = this.formatMessage(LogLevels.DEBUG, `Performance: ${label}`, data);
				entry.performance = {
					operation: label,
					duration: Math.round(measure.duration),
				};

				if (process.env.NODE_ENV === "development") {
					console.log(`[PERF] ${label}: ${Math.round(measure.duration)}ms`, data || "");
				}

				if (this.config.sendToServer) {
					this.logBuffer.push(entry);
				}
			}

			// Clean up
			performance.clearMarks(`${label}-start`);
			performance.clearMarks(`${label}-end`);
			performance.clearMeasures(label);
		} catch (error) {
			// Ignore performance API errors
		}
	}

	// Create child logger with additional context
	child(context: Record<string, any>): ClientLogger {
		const childLogger = new ClientLogger(this.config);
		childLogger.metadata = { ...this.metadata, ...context };
		return childLogger;
	}

	// Update configuration
	updateConfig(config: Partial<LoggerConfig>) {
		this.config = { ...this.config, ...config };

		// Restart batch timer if needed
		if (this.config.sendToServer && !this.batchTimer) {
			this.startBatchTimer();
		} else if (!this.config.sendToServer && this.batchTimer) {
			clearInterval(this.batchTimer);
			this.batchTimer = null;
		}
	}

	// Force send logs to server
	async sendLogs() {
		await this.flush();
	}

	// Clear log buffer
	clear() {
		this.logBuffer = [];
	}

	// Stop logger
	stop() {
		if (this.batchTimer) {
			clearInterval(this.batchTimer);
			this.batchTimer = null;
		}
		this.flush();
	}
}

// Create and export singleton instance
export const clientLogger = new ClientLogger();
export const logger = clientLogger; // Alias for easier imports

// Export for use in React components
export default clientLogger;

// React hook for logger
export function useLogger(context?: Record<string, any>) {
	if (context) {
		return clientLogger.child(context);
	}
	return clientLogger;
}