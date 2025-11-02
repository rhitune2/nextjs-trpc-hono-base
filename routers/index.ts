import { protectedProcedure, publicProcedure, router } from "@/lib/api/trpc";
import { testRouter } from "./test";
import { uploadRouter } from "./upload";
import { logsRouter } from "./logs";
import z from "zod";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return {
			message: "OK",
		};
	}),
	privateData: protectedProcedure.query(({ ctx }) => {
		return {
			message: "This is private",
			user: ctx.session.user,
		};
	}),
	test: testRouter,
	upload: uploadRouter,
	logs: logsRouter,
	hello: publicProcedure
		.input(
			z
				.object({
					text: z.string().nullish(),
				})
				.nullish(),
		)
		.query((opts) => {
			return {
				greeting: `hello ${opts.input?.text ?? 'world'}`,
			};
		}),

});
export type AppRouter = typeof appRouter;
