"use client";

import { useEffect } from "react";
import { trpc } from "@/utils/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { logger } from "@/lib/logger/client";

export default function LogsPage() {
	// Get logs from database
	const { data: logsData, refetch } = trpc.logs.getLogs.useQuery({
		limit: 50,
	});

	// Get statistics
	const { data: stats } = trpc.logs.getStats.useQuery({});

	// Test logging
	const testLogging = () => {
		// Test different log levels
		logger.info("Test info log", {
			test: true,
			timestamp: new Date().toISOString()
		});

		logger.warn("Test warning log", {
			warning: "This is a test warning",
			userId: "test-user-123"
		});

		logger.error("Test error log", {
			error: new Error("This is a test error"),
			stack: "Test stack trace"
		});

		toast.success("Test logs created! They will be saved to database.");

		// Refetch after a delay to see the new logs
		setTimeout(() => {
			refetch();
		}, 2000);
	};

	// Test server logging
	const testServerLogging = async () => {
		try {
			// Call a non-existent endpoint to generate server error
			await fetch("/api/test-error");
			toast.info("Server log test triggered");
		} catch (error) {
			toast.info("Server error log created");
		}

		setTimeout(() => {
			refetch();
		}, 2000);
	};

	// Get level badge color
	const getLevelColor = (level: string) => {
		switch (level) {
			case "error":
			case "fatal":
				return "destructive";
			case "warn":
				return "outline"; // Changed from "warning" to "outline"
			case "info":
				return "default";
			case "debug":
				return "secondary";
			default:
				return "outline";
		}
	};

	// Get source badge color
	const getSourceColor = (source: string) => {
		switch (source) {
			case "client":
				return "blue";
			case "server":
				return "green";
			case "api":
				return "purple";
			default:
				return "gray";
		}
	};

	return (
		<div className="container mx-auto py-8">
			<div className="mb-8">
				<h1 className="text-3xl font-bold mb-2">System Logs</h1>
				<p className="text-muted-foreground">
					View and manage application logs stored in database
				</p>
			</div>

			{/* Test Buttons */}
			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Test Logging</CardTitle>
					<CardDescription>
						Generate test logs to verify the logging system
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex gap-4">
						<Button onClick={testLogging}>
							Generate Client Logs
						</Button>
						<Button onClick={testServerLogging} variant="outline">
							Generate Server Logs
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Statistics */}
			{stats && (
				<div className="grid gap-4 md:grid-cols-4 mb-6">
					{stats.levelCounts.map((item) => (
						<Card key={item.level}>
							<CardHeader className="pb-2">
								<CardDescription>
									{item.level?.toUpperCase() || "UNKNOWN"} Logs
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{item.count}</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{/* Logs Table */}
			<Card>
				<CardHeader>
					<CardTitle>Recent Logs</CardTitle>
					<CardDescription>
						Showing {logsData?.logs.length || 0} of {logsData?.total || 0} total logs
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-2">
						{logsData?.logs.length === 0 && (
							<div className="text-center py-8 text-muted-foreground">
								No logs found. Generate some test logs to see them here.
							</div>
						)}

						{logsData?.logs.map((log) => (
							<div
								key={log.id}
								className="border rounded-lg p-3 space-y-2 hover:bg-muted/50 transition-colors"
							>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<Badge variant={getLevelColor(log.level)}>
											{log.level}
										</Badge>
										<Badge variant="outline" className={`border-${getSourceColor(log.source)}-500`}>
											{log.source}
										</Badge>
										{log.event && (
											<Badge variant="secondary">
												{log.event}
											</Badge>
										)}
									</div>
									<span className="text-xs text-muted-foreground">
										{new Date(log.createdAt).toLocaleString()}
									</span>
								</div>

								<div className="text-sm">
									{log.message}
								</div>

								{log.errorMessage && (
									<div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
										Error: {log.errorMessage}
									</div>
								)}

								{log.userId && (
									<div className="text-xs text-muted-foreground">
										User: {log.userId}
									</div>
								)}

								{log.sessionId && (
									<div className="text-xs text-muted-foreground">
										Session: {log.sessionId}
									</div>
								)}
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}