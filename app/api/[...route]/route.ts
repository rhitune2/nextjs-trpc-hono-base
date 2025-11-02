import { auth } from '@/lib/auth'
import { createContext } from '@/lib/api/trpc/context'
import { appRouter } from '@/routers'
import { Hono } from 'hono'
import { cors } from "hono/cors"
import { handle } from 'hono/vercel'
import { trpcServer } from "@hono/trpc-server";
import {
	loggerMiddleware,
	performanceMiddleware,
	errorLoggingMiddleware,
} from '@/lib/logger'
import {
	rateLimiter,
	ipRateLimiter,
	uploadRateLimiter,
	RateLimitConfigs
} from '@/lib/middleware/rate-limiter'
import { handleClientLogs } from '@/routers/logs'
import { handleDirectUpload } from '@/routers/upload'

const app = new Hono()

// Add custom logger middleware instead of default hono logger
app.use('*', loggerMiddleware())
app.use('*', performanceMiddleware())
app.use('*', errorLoggingMiddleware())

// CORS configuration (should be before rate limiting)
app.use(
	"/api/*",
	cors({
		origin: process.env.CORS_ORIGIN || "",
		allowMethods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

// Add global rate limiter for all API routes (excluding static assets)
app.use(
	"/api/*",
	ipRateLimiter(
		parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
		parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000")
	)
);

// Auth endpoints with specific stricter rate limiting
app.use("/api/auth/*", rateLimiter(RateLimitConfigs.auth));
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Client logs endpoint
app.post("/api/logs", handleClientLogs);

// Direct upload endpoint with specific rate limiting
app.use("/api/upload", uploadRateLimiter());
app.post("/api/upload", handleDirectUpload);

// tRPC endpoints with specific rate limiting (global limiter already applied)
app.use("/api/trpc/*", rateLimiter(RateLimitConfigs.api));
app.use(
	"/api/trpc/*",
	trpcServer({
		router: appRouter,
		endpoint: "/api/trpc",
		createContext: (_opts, context) => {
			return createContext({ context });
		},
	}),
);

export const GET = handle(app)
export const POST = handle(app)