import type { RedisOptions } from "ioredis";

/**
 * Redis connection configuration for self-hosted Redis (Coolify compatible)
 */
export const redisConfig: RedisOptions = {
	host: process.env.REDIS_HOST || "localhost",
	port: parseInt(process.env.REDIS_PORT || "6379"),
	password: process.env.REDIS_PASSWORD || undefined,
	db: parseInt(process.env.REDIS_DB || "0"),

	// Connection options for stability
	retryStrategy: (times: number) => {
		const delay = Math.min(times * 50, 2000);
		return delay;
	},

	// Reconnection options
	reconnectOnError: (err) => {
		const targetError = "READONLY";
		if (err.message.includes(targetError)) {
			return true;
		}
		return false;
	},

	// Performance options
	enableReadyCheck: true,
	maxRetriesPerRequest: 3,

	// TLS configuration if needed
	...(process.env.REDIS_TLS === "true" && {
		tls: {
			rejectUnauthorized: false,
		},
	}),

	// Connection pooling
	lazyConnect: false, // Connect immediately for rate limiter reliability

	// Timeouts
	connectTimeout: 10000,
	commandTimeout: 5000,
};

