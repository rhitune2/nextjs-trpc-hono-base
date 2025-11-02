import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";
import { trpcLogger, StructuredLogger } from "@/lib/logger";
import superjson from "superjson";

export const t = initTRPC.context<Context>().create({
	transformer: superjson,
	errorFormatter({ shape, error, type, path, input, ctx }) {
		// Log errors
		trpcLogger.error({
			event: "trpc.error",
			type,
			path,
			code: shape.code,
			message: shape.message,
			error: error.message,
			stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
		});

		return shape;
	},
});

// Logger middleware
const loggerMiddleware = t.middleware(async ({ path, type, next, input }) => {
	const start = Date.now();
	const structuredLogger = new StructuredLogger("trpc", { path, type });

	structuredLogger.logEvent("debug", "trpc.start", {
		input: input ? "[PRESENT]" : "[EMPTY]",
	});

	const result = await next();
	const duration = Date.now() - start;

	if (result.ok) {
		structuredLogger.logPerformance(path, duration, { type });
	} else {
		structuredLogger.logEvent("error", "trpc.error", {
			duration,
			error: result.error,
		});
	}

	return result;
});

export const router = t.router;

export const publicProcedure = t.procedure.use(loggerMiddleware);

export const protectedProcedure = t.procedure
	.use(loggerMiddleware)
	.use(({ ctx, next }) => {
		if (!ctx.session) {
			// Log unauthorized attempt
			trpcLogger.warn({
				event: "auth.unauthorized",
				message: "Authentication required",
			});

			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Authentication required",
				cause: "No session",
			});
		}
		return next({
			ctx: {
				...ctx,
				session: ctx.session,
			},
		});
	});

