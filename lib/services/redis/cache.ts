import { redis } from "./client";
import { logger } from "@/lib/logger";

/**
 * Set a value with expiration
 */
export async function setWithExpiry(
	key: string,
	value: string | number | Buffer,
	ttlSeconds: number,
): Promise<"OK" | null> {
	try {
		return await redis.setex(key, ttlSeconds, value);
	} catch (error) {
		logger.error({ message: `Redis setWithExpiry error for key ${key}`, error });
		throw error;
	}
}

/**
 * Get a value by key
 */
export async function getValue(key: string): Promise<string | null> {
	try {
		return await redis.get(key);
	} catch (error) {
		logger.error({ message: `Redis getValue error for key ${key}`, error });
		throw error;
	}
}

/**
 * Delete a key
 */
export async function deleteKey(key: string): Promise<number> {
	try {
		return await redis.del(key);
	} catch (error) {
		logger.error({ message: `Redis deleteKey error for key ${key}`, error });
		throw error;
	}
}

/**
 * Increment a counter
 */
export async function incrementCounter(key: string): Promise<number> {
	try {
		return await redis.incr(key);
	} catch (error) {
		logger.error({ message: `Redis incrementCounter error for key ${key}`, error });
		throw error;
	}
}

/**
 * Set JSON object
 */
export async function setJson(
	key: string,
	value: object,
	ttlSeconds?: number,
): Promise<"OK" | null> {
	try {
		const stringified = JSON.stringify(value);
		if (ttlSeconds) {
			return await redis.setex(key, ttlSeconds, stringified);
		}
		return await redis.set(key, stringified);
	} catch (error) {
		logger.error({ message: `Redis setJson error for key ${key}`, error });
		throw error;
	}
}

/**
 * Get JSON object
 */
export async function getJson<T = unknown>(key: string): Promise<T | null> {
	try {
		const value = await redis.get(key);
		if (!value) return null;
		return JSON.parse(value) as T;
	} catch (error) {
		logger.error({ message: `Redis getJson error for key ${key}`, error });
		throw error;
	}
}

/**
 * Cache helper with automatic serialization
 */
export async function cache<T>(
	key: string,
	fetcher: () => Promise<T>,
	ttlSeconds: number = 3600,
): Promise<T> {
	try {
		// Try to get from cache
		const cached = await getJson<T>(key);
		if (cached !== null) {
			logger.debug(`Cache hit for key: ${key}`);
			return cached;
		}

		// Fetch fresh data
		logger.debug(`Cache miss for key: ${key}, fetching fresh data`);
		const fresh = await fetcher();

		// Store in cache - cast to object for setJson
		await setJson(key, fresh as object, ttlSeconds);

		return fresh;
	} catch (error) {
		logger.error({ message: `Cache operation error for key ${key}`, error });
		// Return fresh data on cache error
		return fetcher();
	}
}

/**
 * Invalidate cache by pattern
 */
export async function invalidateCache(pattern: string): Promise<number> {
	try {
		const keys = await redis.keys(pattern);
		if (keys.length === 0) return 0;

		const deleted = await redis.del(...keys);
		logger.info(`Invalidated ${deleted} cache entries for pattern: ${pattern}`);
		return deleted;
	} catch (error) {
		logger.error({ message: `Cache invalidation error for pattern ${pattern}`, error });
		throw error;
	}
}

