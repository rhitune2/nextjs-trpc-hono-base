"use client";

import { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/utils/trpc";
import { toast } from "sonner";
import {
	Upload,
	File,
	Image,
	FileText,
	Film,
	Archive,
	X,
	CheckCircle2,
	AlertCircle,
	Download,
	Trash2,
	Eye,
	Share2,
	Link,
	Loader2,
} from "lucide-react";
import { formatFileSize, getFileCategory } from "@/lib/api/upload";

interface FileUploadProps {
	onUploadComplete?: (files: UploadedFile[]) => void;
	maxFiles?: number;
	maxSize?: number;
	acceptedTypes?: string[];
	isPublic?: boolean;
	showUploadedFiles?: boolean;
}

interface UploadedFile {
	id: string;
	url: string;
	fileName: string;
	originalName: string;
	size: number;
	mimeType: string;
	thumbnailUrl?: string | null;
}

interface UploadingFile {
	id: string;
	file: File;
	progress: number;
	status: "pending" | "uploading" | "success" | "error";
	error?: string;
	result?: UploadedFile;
}

export function FileUpload({
	onUploadComplete,
	maxFiles = 10,
	maxSize = 52428800, // 50MB
	acceptedTypes,
	isPublic = true,
	showUploadedFiles = true,
}: FileUploadProps) {
	const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
	const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
	const [isUploading, setIsUploading] = useState(false);
	const [shareDialogOpen, setShareDialogOpen] = useState(false);
	const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const utils = trpc.useUtils();
	const uploadMutation = trpc.upload.upload.useMutation();
	const deleteMutation = trpc.upload.deleteFile.useMutation();
	const createShareLinkMutation = trpc.upload.createShareLink.useMutation();

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop: handleDrop,
		maxFiles,
		maxSize,
		accept: acceptedTypes
			? acceptedTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {})
			: undefined,
	});

	async function handleDrop(acceptedFiles: File[]) {
		const newFiles: UploadingFile[] = acceptedFiles.map((file) => ({
			id: Math.random().toString(36).substring(7),
			file,
			progress: 0,
			status: "pending" as const,
		}));

		setUploadingFiles((prev) => [...prev, ...newFiles]);
		setIsUploading(true);

		for (const uploadingFile of newFiles) {
			await uploadFile(uploadingFile);
		}

		setIsUploading(false);
	}

	async function uploadFile(uploadingFile: UploadingFile) {
		try {
			// Update status to uploading
			setUploadingFiles((prev) =>
				prev.map((f) =>
					f.id === uploadingFile.id ? { ...f, status: "uploading" } : f
				)
			);

			// Convert file to base64
			const reader = new FileReader();
			const base64Promise = new Promise<string>((resolve, reject) => {
				reader.onload = () => {
					const base64 = reader.result?.toString().split(",")[1];
					if (base64) resolve(base64);
					else reject(new Error("Failed to convert file"));
				};
				reader.onerror = reject;
				reader.readAsDataURL(uploadingFile.file);
			});

			const fileData = await base64Promise;

			// Simulate progress
			const progressInterval = setInterval(() => {
				setUploadingFiles((prev) =>
					prev.map((f) =>
						f.id === uploadingFile.id && f.progress < 90
							? { ...f, progress: f.progress + 10 }
							: f
					)
				);
			}, 200);

			// Upload file
			const result = await uploadMutation.mutateAsync({
				fileName: uploadingFile.file.name,
				mimeType: uploadingFile.file.type,
				size: uploadingFile.file.size,
				fileData,
				isPublic,
			});

			clearInterval(progressInterval);

			// Update status to success
			setUploadingFiles((prev) =>
				prev.map((f) =>
					f.id === uploadingFile.id
						? { ...f, status: "success", progress: 100, result }
						: f
				)
			);

			setUploadedFiles((prev) => [...prev, result]);
			toast.success(`${uploadingFile.file.name} uploaded successfully`);
		} catch (error) {
			// Update status to error
			setUploadingFiles((prev) =>
				prev.map((f) =>
					f.id === uploadingFile.id
						? {
								...f,
								status: "error",
								error:
									error instanceof Error
										? error.message
										: "Failed to upload file",
							}
						: f
				)
			);

			toast.error(
				`Failed to upload ${uploadingFile.file.name}: ${
					error instanceof Error ? error.message : "Unknown error"
				}`
			);
		}
	}

	async function handleDelete(fileId: string) {
		try {
			await deleteMutation.mutateAsync({ id: fileId });
			setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
			toast.success("File deleted successfully");
			utils.upload.getUserFiles.invalidate();
		} catch (error) {
			toast.error("Failed to delete file");
		}
	}

	async function handleShare(file: UploadedFile) {
		setSelectedFile(file);
		setShareDialogOpen(true);
	}

	async function createShareLink() {
		if (!selectedFile) return;

		try {
			const result = await createShareLinkMutation.mutateAsync({
				fileId: selectedFile.id,
				expiresInHours: 24,
			});

			navigator.clipboard.writeText(result.url);
			toast.success("Share link copied to clipboard!");
			setShareDialogOpen(false);
		} catch (error) {
			toast.error("Failed to create share link");
		}
	}

	function removeUploadingFile(id: string) {
		setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
	}

	function getFileIcon(mimeType: string) {
		const category = getFileCategory(mimeType);
		switch (category) {
			case "image":
				return <Image className="h-4 w-4" />;
			case "video":
				return <Film className="h-4 w-4" />;
			case "document":
				return <FileText className="h-4 w-4" />;
			case "archive":
				return <Archive className="h-4 w-4" />;
			default:
				return <File className="h-4 w-4" />;
		}
	}

	return (
		<div className="space-y-4">
			{/* Upload Area */}
			<Card>
				<CardHeader>
					<CardTitle>Upload Files</CardTitle>
					<CardDescription>
						Drag and drop files or click to browse
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div
						{...getRootProps()}
						className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
							isDragActive
								? "border-primary bg-primary/5"
								: "border-muted-foreground/25 hover:border-primary/50"
						}`}
					>
						<input {...getInputProps()} />
						<Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
						{isDragActive ? (
							<p className="text-sm text-muted-foreground">
								Drop the files here...
							</p>
						) : (
							<div className="space-y-2">
								<p className="text-sm text-muted-foreground">
									Drag & drop files here, or click to select
								</p>
								<p className="text-xs text-muted-foreground">
									Max {maxFiles} files, up to {formatFileSize(maxSize)} each
								</p>
							</div>
						)}
					</div>

					{/* File visibility option */}
					<div className="flex items-center space-x-2 mt-4">
						<Checkbox
							id="public"
							checked={isPublic}
							disabled
						/>
						<Label htmlFor="public" className="text-sm">
							Make files public (visible to everyone)
						</Label>
					</div>
				</CardContent>
			</Card>

			{/* Uploading Files */}
			{uploadingFiles.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Uploading Files</CardTitle>
					</CardHeader>
					<CardContent>
						<ScrollArea className="h-64">
							<div className="space-y-2">
								{uploadingFiles.map((file) => (
									<div
										key={file.id}
										className="flex items-center justify-between p-3 border rounded-lg"
									>
										<div className="flex items-center space-x-3 flex-1">
											{getFileIcon(file.file.type)}
											<div className="flex-1 min-w-0">
												<p className="text-sm font-medium truncate">
													{file.file.name}
												</p>
												<p className="text-xs text-muted-foreground">
													{formatFileSize(file.file.size)}
												</p>
												{file.status === "uploading" && (
													<Progress
														value={file.progress}
														className="h-1 mt-2"
													/>
												)}
												{file.status === "error" && (
													<p className="text-xs text-destructive mt-1">
														{file.error}
													</p>
												)}
											</div>
										</div>
										<div className="flex items-center space-x-2">
											{file.status === "pending" && (
												<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
											)}
											{file.status === "uploading" && (
												<Loader2 className="h-4 w-4 animate-spin text-primary" />
											)}
											{file.status === "success" && (
												<CheckCircle2 className="h-4 w-4 text-green-500" />
											)}
											{file.status === "error" && (
												<AlertCircle className="h-4 w-4 text-destructive" />
											)}
											<Button
												variant="ghost"
												size="sm"
												onClick={() => removeUploadingFile(file.id)}
											>
												<X className="h-4 w-4" />
											</Button>
										</div>
									</div>
								))}
							</div>
						</ScrollArea>
					</CardContent>
				</Card>
			)}

			{/* Uploaded Files */}
			{showUploadedFiles && uploadedFiles.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Uploaded Files</CardTitle>
					</CardHeader>
					<CardContent>
						<ScrollArea className="h-64">
							<div className="space-y-2">
								{uploadedFiles.map((file) => (
									<div
										key={file.id}
										className="flex items-center justify-between p-3 border rounded-lg"
									>
										<div className="flex items-center space-x-3 flex-1">
											{file.thumbnailUrl ? (
												<img
													src={file.thumbnailUrl}
													alt={file.originalName}
													className="h-10 w-10 rounded object-cover"
												/>
											) : (
												getFileIcon(file.mimeType)
											)}
											<div className="flex-1 min-w-0">
												<p className="text-sm font-medium truncate">
													{file.originalName}
												</p>
												<p className="text-xs text-muted-foreground">
													{formatFileSize(file.size)}
												</p>
											</div>
										</div>
										<div className="flex items-center space-x-1">
											<Button
												variant="ghost"
												size="sm"
												onClick={() => window.open(file.url, "_blank")}
											>
												<Eye className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleShare(file)}
											>
												<Share2 className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleDelete(file.id)}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									</div>
								))}
							</div>
						</ScrollArea>
					</CardContent>
				</Card>
			)}

			{/* Share Dialog */}
			<Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Share File</DialogTitle>
						<DialogDescription>
							Create a shareable link for this file
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="flex items-center space-x-3">
							{selectedFile?.thumbnailUrl ? (
								<img
									src={selectedFile.thumbnailUrl}
									alt={selectedFile.originalName}
									className="h-12 w-12 rounded object-cover"
								/>
							) : (
								selectedFile && getFileIcon(selectedFile.mimeType)
							)}
							<div>
								<p className="font-medium">{selectedFile?.originalName}</p>
								<p className="text-sm text-muted-foreground">
									{selectedFile && formatFileSize(selectedFile.size)}
								</p>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setShareDialogOpen(false)}>
							Cancel
						</Button>
						<Button onClick={createShareLink}>
							<Link className="h-4 w-4 mr-2" />
							Create Link
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}