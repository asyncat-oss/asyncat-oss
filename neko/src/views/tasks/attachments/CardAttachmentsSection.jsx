
import { File, Upload, AlertCircle, X, Download } from "lucide-react";

const CardAttachmentsSection = ({
	files,
	attachments,
	fileError,
	onFileChange,
	onDeleteFile,
	onDeleteAttachment,
	getFileIcon,
	isUploading = false,
}) => {
	const hasAttachments =
		(attachments && attachments.length > 0) || (files && files.length > 0);

	return (
		<div className="w-full space-y-6">
			{/* File Upload Area */}
			<div className="border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
				<label className="cursor-pointer block">
					<div className="flex flex-col items-center">
						<div className="w-10 h-10 mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
							<Upload className="w-5 h-5 text-gray-400" />
						</div>
						<span className="text-sm text-gray-600 dark:text-gray-400 mb-2">
							Drop files here or click to browse
						</span>
						<span className="text-xs text-gray-500">
							PDF, PNG, JPEG, DOCX, XLSX (max 10MB)
						</span>
					</div>
					<input
						type="file"
						multiple
						className="hidden"
						onChange={onFileChange}
						accept=".pdf,.png,.jpeg,.jpg,.gif,.webp,.svg,.bmp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.html,.css,.js,.json,.xml,.zip,.rar,.7z,.tar,.gz"
					/>
				</label>
			</div>

			{/* Error Message */}
			{fileError && (
				<div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-900/20">
					<div className="flex items-start space-x-3">
						<AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{fileError}
						</span>
					</div>
				</div>
			)}

			{/* Files List */}
			{hasAttachments ? (
				<div className="space-y-4">
					{/* Files being uploaded */}
					{files && files.length > 0 && (
						<div className="space-y-3">
							<div className="flex items-center space-x-2">
								{isUploading ? (
									<>
										<div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
										<h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">
											Uploading...
										</h5>
									</>
								) : (
									<>
										<div className="w-2 h-2 bg-blue-500 rounded-full"></div>
										<h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">
											Uploaded Attachments
										</h5>
									</>
								)}
							</div>
							{files.map((file, index) => (
								<div
									key={`file-${index}`}
									className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-900/20"
								>
									<div className="flex items-center space-x-3 overflow-hidden">
										{getFileIcon(file.type)}
										<div className="min-w-0 flex-1">
											<div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
												{file.name}
											</div>
											<div className="text-xs text-blue-600 dark:text-blue-400">
												{isUploading
													? "Uploading..."
													: "Pending upload"}
											</div>
										</div>
									</div>
									{!isUploading && (
										<button
											onClick={() => onDeleteFile(file)}
											className="p-1 text-gray-400 hover:text-red-500 transition-colors"
										>
											<X className="w-4 h-4" />
										</button>
									)}
								</div>
							))}
						</div>
					)}

					{/* Already uploaded attachments */}
					{attachments && attachments.length > 0 && (
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<div className="flex items-center space-x-2">
									<div className="w-2 h-2 bg-green-500 rounded-full"></div>
									<h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">
										Attached Files
									</h5>
								</div>
								<span className="text-xs text-gray-500">
									{attachments.length}{" "}
									{attachments.length === 1
										? "file"
										: "files"}
								</span>
							</div>
							{attachments.map((attachment, index) => (
								<div
									key={attachment.blobName || index}
									className="group flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
								>
									<div className="flex items-center space-x-3 overflow-hidden">
										{getFileIcon(attachment.fileType)}
										<div className="min-w-0 flex-1">
											<div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
												{attachment.fileName}
											</div>
											<div className="text-xs text-gray-500">
												{attachment.fileSize
													? `${Math.round(
															attachment.fileSize /
																1024
													  )} KB`
													: "File"}
											</div>
										</div>
									</div>
									<div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
										<a
											href={attachment.fileUrl}
											download={attachment.fileName}
											className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
											target="_blank"
											rel="noopener noreferrer"
										>
											<Download className="w-4 h-4" />
										</a>
										<button
											onClick={() =>
												onDeleteAttachment(
													attachment.blobName
												)
											}
											className="p-2 text-gray-400 hover:text-red-500 transition-colors"
										>
											<X className="w-4 h-4" />
										</button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			) : (
				<div className="text-center py-12">
					<div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
						<File className="w-6 h-6 text-gray-400" />
					</div>
					<p className="text-sm text-gray-500">
						No files attached yet
					</p>
				</div>
			)}
		</div>
	);
};

export default CardAttachmentsSection;
