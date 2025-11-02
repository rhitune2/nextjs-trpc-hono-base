import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@/routers";
import { toast } from "sonner";
import superjson from "superjson";

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error: { message?: string }) => {
			toast.error(error.message, {
				action: {
					label: "retry",
					onClick: () => {
						queryClient.invalidateQueries();
					},
				},
			});
		},
	}),
});

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
	links: [
		httpBatchLink({
			url: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/trpc`,
			fetch(input, options) {
				return fetch(input, {
					...options,
					credentials: "include",
				});
			},
			transformer: superjson,
		}),
	],
});