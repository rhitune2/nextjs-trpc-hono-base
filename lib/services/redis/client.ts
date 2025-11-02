import Redis from "ioredis";
import { redisConfig } from "@/lib/config/redis";
import { logger } from "@/lib/logger";

// Create Redis client instance
// With lazyConnect: false, connection starts immediately
export const redis = new Redis(redisConfig);

// Connection event handlers
redis.on("connect", () => {
	logger.info("Redis client connected successfully");
});

redis.on("error", (error) => {
	logger.error({ message: "Redis connection error", error });
});

redis.on("close", () => {
	logger.warn("Redis connection closed");
});

redis.on("reconnecting", (delay: number) => {
	logger.info(`Redis reconnecting in ${delay}ms`);
});

redis.on("ready", () => {
	logger.info("Redis client ready");
});

/**
 * Health check for Redis connection
 */
export async function isRedisHealthy(): Promise<boolean> {
	try {
		const pong = await redis.ping();
		return pong === "PONG";
	} catch (error) {
		logger.error({ message: "Redis health check failed", error });
		return false;
	}
}

/**
 * Graceful shutdown
 */
export async function closeRedisConnection(): Promise<void> {
	try {
		await redis.quit();
		logger.info("Redis connection closed gracefully");
	} catch (error) {
		logger.error({ message: "Error closing Redis connection", error });
		redis.disconnect();
	}
}

export default redis;

