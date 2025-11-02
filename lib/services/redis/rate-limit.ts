import { redis } from "./client";
import { logger } from "@/lib/logger";

/**
 * Rate limiter helper - sliding window implementation using Redis ZSET
 */
export async function checkRateLimit(
	identifier: string,
	maxRequests: number,
	windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date; memberId?: string }> {
	const key = `rate_limit:${identifier}`;
	const now = Date.now();
	const windowStart = now - windowMs;

	try {
		// Remove old entries
		await redis.zremrangebyscore(key, "-inf", windowStart);

		// Count current entries
		const count = await redis.zcard(key);

		if (count < maxRequests) {
			// Add current request with unique member ID
			// Using timestamp + random ensures uniqueness and allows rollback
			const memberId = `${now}-${Math.random().toString(36).substring(7)}`;
			await redis.zadd(key, now, memberId);
			// Set expiry for cleanup (add 1 second buffer)
			await redis.expire(key, Math.ceil(windowMs / 1000) + 1);

			return {
				allowed: true,
				remaining: maxRequests - count - 1,
				resetAt: new Date(now + windowMs),
				memberId,
			};
		}

		// Get oldest entry to calculate reset time
		const oldestEntry = await redis.zrange(key, 0, 0, "WITHSCORES");
		const resetAt = oldestEntry[1]
			? new Date(parseInt(oldestEntry[1]) + windowMs)
			: new Date(now + windowMs);

		return {
			allowed: false,
			remaining: 0,
			resetAt,
		};
	} catch (error) {
		logger.error({ message: `Rate limit check error for ${identifier}`, error });
		// Allow request on error to prevent blocking users
		return {
			allowed: true,
			remaining: maxRequests,
			resetAt: new Date(now + windowMs),
			// No memberId on error (no entry was added)
		};
	}
}

