import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema/auth";
import { createAuthMiddleware } from "better-auth/api";
import { logger } from "@/lib/logger";

export const auth = betterAuth<BetterAuthOptions>({
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			if (ctx.path === "/sign-in/email" && ctx.context.user) {
				// Log successful login
				logger.info({
					event: "user.login",
					message: `User logged in: ${ctx.context.newSession?.user.email}`,
					metadata: {
						userId: ctx.context.newSession?.user.id,
						email: ctx.context.newSession?.user.email,
						name: ctx.context.newSession?.user.name,
						method: "email",
						ip: ctx.request?.headers?.get("x-forwarded-for") ||
							ctx.request?.headers?.get("x-real-ip") ||
							"unknown",
						userAgent: ctx.request?.headers?.get("user-agent") || "unknown",
						timestamp: new Date().toISOString(),
					}
				});
			} else if (ctx.path === "/sign-up/email" && ctx.context.user) {
				// Log successful signup
				logger.info({
					event: "user.signup",
					message: `New user registered: ${ctx.context.newSession?.user.email}`,
					metadata: {
						userId: ctx.context.newSession?.user.id,
						email: ctx.context.newSession?.user.email,
						name: ctx.context.newSession?.user.name,
						method: "email",
						ip: ctx.request?.headers?.get("x-forwarded-for") ||
							ctx.request?.headers?.get("x-real-ip") ||
							"unknown",
						userAgent: ctx.request?.headers?.get("user-agent") || "unknown",
						timestamp: new Date().toISOString(),
					}
				});
			} else if (ctx.path === "/sign-out") {
				// Log logout
				logger.info({
					event: "user.logout",
					message: `User logged out`,
					metadata: {
						sessionId: (ctx.context as any)?.session?.id || "unknown",
						userId: (ctx.context as any)?.session?.userId || (ctx.context as any)?.user?.id || "unknown",
						ip: ctx.request?.headers?.get("x-forwarded-for") ||
							ctx.request?.headers?.get("x-real-ip") ||
							"unknown",
						timestamp: new Date().toISOString(),
					}
				});
			}

			// Log authentication errors
			if ((ctx as any).error) {
				const error = (ctx as any).error;
				const errorMessage = typeof error === 'string' ? error :
					error?.message || error?.error || 'Unknown authentication error';
				logger.warn({
					event: "auth.error",
					message: `Authentication error: ${errorMessage}`,
					metadata: {
						path: ctx.path,
						error: errorMessage,
						code: error?.code || error?.status || "unknown",
						ip: ctx.request?.headers?.get("x-forwarded-for") ||
							ctx.request?.headers?.get("x-real-ip") ||
							"unknown",
						userAgent: ctx.request?.headers?.get("user-agent") || "unknown",
						timestamp: new Date().toISOString(),
					}
				});
			}
		}),
	},
	database: drizzleAdapter(db, {
		provider: "mysql",
		schema: schema,
	}),
	trustedOrigins: [process.env.CORS_ORIGIN || ""],
	emailAndPassword: {
		enabled: true,
	},
});

