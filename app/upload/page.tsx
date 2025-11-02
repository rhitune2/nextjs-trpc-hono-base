"use client";

import { FileUpload } from "@/components/file-upload";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function UploadPage() {
	return (
		<div className="container mx-auto py-8">
			<div className="max-w-4xl mx-auto">
				<div className="mb-8">
					<h1 className="text-3xl font-bold mb-2">File Upload Test</h1>
					<p className="text-muted-foreground">
						Test file upload functionality with MinIO storage
					</p>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Upload Files</CardTitle>
						<CardDescription>
							Drag and drop files or click to browse. Files are stored in MinIO.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<FileUpload
							maxFiles={5}
							maxSize={10485760} // 10MB
							showUploadedFiles={true}
							onUploadComplete={(files) => {
								console.log("Uploaded files:", files);
							}}
						/>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
