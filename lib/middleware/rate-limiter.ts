import { Context, Next } from "hono";
import { checkRateLimit, setWithExpiry, deleteKey, getValue } from "@/lib/services/redis";
import { redis } from "@/lib/services/redis";
import { logger } from "@/lib/logger";
import { nanoid } from "nanoid";

export interface RateLimitConfig {
	windowMs: number;
	maxRequests: number;
	keyGenerator?: (c: Context) => string;
	skipSuccessfulRequests?: boolean;
	skipFailedRequests?: boolean;
	message?: string;
	handler?: (c: Context) => Response | Promise<Response>;
	// Advanced features
	whitelist?: string[];
	storeAnalytics?: boolean;
	standardHeaders?: boolean; // Use RFC draft standard headers
	cost?: number | ((c: Context) => number); // Cost per request
	enableBackoff?: boolean; // Exponential backoff for repeat offenders
	backoffMultiplier?: number;
	maxBackoffMs?: number;
}

// Default configurations for different endpoints
export const RateLimitConfigs = {
	default: {
		windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000"),
		maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
	},
	upload: {
		windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000"),
		maxRequests: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX_REQUESTS || "10"),
	},
	api: {
		windowMs: 60000, // 1 minute
		maxRequests: 60,
	},
	auth: {
		windowMs: 900000, // 15 minutes
		maxRequests: 5,
	},
} as const;

/**
 * Extract client IP from request
 */
export function getClientIp(c: Context): string {
	const headers = c.req.header();

	// Check various headers for client IP (priority order)
	const ipHeaders = [
		"cf-connecting-ip", // Cloudflare
		"x-real-ip", // Nginx proxy
		"x-forwarded-for", // Standard proxy
		"x-client-ip", // Some proxies
		"true-client-ip", // Cloudflare Enterprise
		"x-cluster-client-ip", // Some load balancers
	];

	for (const header of ipHeaders) {
		const value = headers[header];
		if (value) {
			// Handle x-forwarded-for which may contain multiple IPs
			if (header === "x-forwarded-for") {
				const ips = value.split(",");
				return ips[0].trim();
			}
			return value;
		}
	}

	// Fallback to remote address
	return headers["remote-addr"] || "unknown";
}

/**
 * Default key generator - uses IP + path
 */
function defaultKeyGenerator(c: Context): string {
	const ip = getClientIp(c);
	const path = c.req.path;
	return `${ip}:${path}`;
}

/**
 * Calculate request cost
 */
function calculateCost(c: Context, costConfig?: number | ((c: Context) => number)): number {
	if (!costConfig) return 1;
	if (typeof costConfig === "function") {
		return costConfig(c);
	}
	return costConfig;
}

/**
 * Create rate limiter middleware for Hono with advanced features
 */
export function rateLimiter(config?: Partial<RateLimitConfig>) {
	const finalConfig: RateLimitConfig = {
		windowMs: 60000, // 1 minute default
		maxRequests: 100,
		keyGenerator: defaultKeyGenerator,
		skipSuccessfulRequests: false,
		skipFailedRequests: false,
		standardHeaders: true,
		...config,
	};

	return async (c: Context, next: Next) => {
		try {
			// Check whitelist
			if (finalConfig.whitelist) {
				const ip = getClientIp(c);
				if (finalConfig.whitelist.includes(ip)) {
					return next();
				}
			}

			// Generate identifier
			const identifier = finalConfig.keyGenerator!(c);
			const effectiveMaxRequests = finalConfig.maxRequests;
			const effectiveWindowMs = finalConfig.windowMs;

			// Check rate limit
			const { allowed, remaining, resetAt, memberId } = await checkRateLimit(
				identifier,
				effectiveMaxRequests,
				effectiveWindowMs,
			);

			// Store request ID and timestamp for potential rollback
			const requestId = nanoid();
			const requestTimestamp = Date.now();
			c.set("rateLimitRequestId", requestId);

			if ((finalConfig.skipSuccessfulRequests || finalConfig.skipFailedRequests) && memberId) {
				// Store request info for potential rollback (including memberId for ZSET removal)
				await setWithExpiry(
					`ratelimit:request:${requestId}`,
					JSON.stringify({ identifier, timestamp: requestTimestamp, memberId, key: `rate_limit:${identifier}` }),
					60 // Keep for 1 minute
				);
			}

			if (!allowed) {
				// Rate limit exceeded
				const resetTime = Math.ceil((resetAt.getTime() - Date.now()) / 1000);

				if (finalConfig.standardHeaders) {
					c.header("X-RateLimit-Limit", effectiveMaxRequests.toString());
					c.header("X-RateLimit-Remaining", "0");
					c.header("X-RateLimit-Reset", resetTime.toString());
					c.header("Retry-After", resetTime.toString());
				}

				if (finalConfig.handler) {
					return finalConfig.handler(c);
				}

				return c.json(
					{
						error: "Too Many Requests",
						message: finalConfig.message || "Rate limit exceeded. Please try again later.",
						retryAfter: resetTime,
					},
					429,
				);
			}

			// Set rate limit headers
			if (finalConfig.standardHeaders) {
				c.header("X-RateLimit-Limit", effectiveMaxRequests.toString());
				c.header("X-RateLimit-Remaining", remaining.toString());
				c.header("X-RateLimit-Reset", Math.ceil((resetAt.getTime() - Date.now()) / 1000).toString());
			}

			// Continue with request
			const response = await next();

			// Implement skip logic with actual rollback
			if (
				(finalConfig.skipSuccessfulRequests && response.status < 400) ||
				(finalConfig.skipFailedRequests && response.status>= 400)
			) {
				// Rollback: Remove the entry from sorted set using memberId
				const requestInfo = await getValue(`ratelimit:request:${requestId}`);
				
				if (requestInfo) {
					try {
						const { key, memberId: storedMemberId } = JSON.parse(requestInfo);
						
						if (key && storedMemberId) {
							// Remove the specific member from ZSET using ZREM
							await redis.zrem(key, storedMemberId);
							
							// Clean up request tracking
							await deleteKey(`ratelimit:request:${requestId}`);
						}
					} catch (error) {
						logger.warn({ message: "Failed to rollback rate limit entry", error });
					}
				}
			}

			return response;
		} catch (error) {
			logger.error({ message: "Rate limiter error", error });
			// On error, allow request to proceed (fail open)
			return next();
		}
	};
}

/**
 * Simple IP-based rate limiter
 */
export function ipRateLimiter(maxRequests: number, windowMs: number) {
	return rateLimiter({
		windowMs,
		maxRequests,
		keyGenerator: (c) => getClientIp(c),
	});
}

/**
 * Upload-specific rate limiter
 */
export function uploadRateLimiter() {
	return rateLimiter({
		...RateLimitConfigs.upload,
		keyGenerator: (c) => {
			const ip = getClientIp(c);
			return `upload:${ip}`;
		},
	});
}

