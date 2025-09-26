import { auth } from '@/lib/auth'
import { createContext } from '@/lib/context'
import { appRouter } from '@/routers'
import { Hono } from 'hono'
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { handle } from 'hono/vercel'
import { trpcServer } from "@hono/trpc-server";

const app = new Hono()

app.use(logger())
app.use(
	"/api/*",
	cors({
		origin: process.env.CORS_ORIGIN || "",
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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