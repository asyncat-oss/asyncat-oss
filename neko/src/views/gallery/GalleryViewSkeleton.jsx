

const GalleryViewSkeleton = () => {
	// Create skeleton cards for the gallery view
	const skeletonCards = Array(12).fill(0); // Show 12 skeleton cards

	return (
		<div className="p-0 bg-white dark:bg-gray-900 midnight:bg-gray-950 min-h-screen flex flex-col">
			{/* Filters header skeleton */}
			<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60">
				<div className="px-6 py-4">
					<div className="flex items-center justify-between gap-4">
						{/* Left side - Search and Filters */}
						<div className="flex items-center gap-4 flex-1 min-w-0">
							{/* Search input skeleton */}
							<div className="h-10 min-w-[280px] sm:min-w-[350px] bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60 rounded-xl animate-pulse"></div>

							{/* Filter pills skeletons */}
							<div className="flex items-center gap-2 overflow-x-auto pb-1">
								{/* Completed */}
								<div className="w-24 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 animate-pulse"></div>
								{/* Priority: High/Medium/Low */}
								<div className="w-16 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 animate-pulse"></div>
								<div className="w-20 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 animate-pulse"></div>
								<div className="w-14 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 animate-pulse"></div>
								{/* Due: Overdue/Today/This Week */}
								<div className="w-20 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 animate-pulse"></div>
								<div className="w-16 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 animate-pulse"></div>
								<div className="w-24 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 animate-pulse"></div>
							</div>
						</div>

						{/* Right side - Create Task button skeleton */}
						<div className="flex items-center gap-3">
							<div className="w-28 h-9 rounded-md bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60 animate-pulse"></div>
						</div>
					</div>
				</div>
			</div>

			<div className="p-6">
				{/* Gallery Grid Skeleton */}
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
					{skeletonCards.map((_, cardIndex) => (
						<div
							key={cardIndex}
							className="bg-white dark:bg-gray-800 midnight:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800 flex flex-col animate-pulse"
							style={{
								animationDelay: `${cardIndex * 100}ms`,
							}}
						>
							<div className="p-4 flex-1 flex flex-col">
								{/* Priority and due status badges */}
								<div className="flex items-center justify-between mb-2">
									<div className="w-20 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
									<div className="w-16 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
								</div>

								{/* Card title */}
								<div className="w-full h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded mb-2"></div>

								{/* Card description */}
								<div className="space-y-1 mb-3">
									<div className="w-full h-3 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-700 rounded"></div>
									<div className="w-4/5 h-3 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-700 rounded"></div>
									<div className="w-3/4 h-3 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-700 rounded"></div>
								</div>

								{/* Spacer */}
								<div className="flex-1" />

								{/* Progress bar */}
								<div className="mb-2">
									<div className="w-full h-2 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full mb-1">
										{/* Progress fill */}
										<div
											className="h-full bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded-full"
											style={{
												width: `${
													Math.random() * 70 + 10
												}%`,
											}}
										></div>
									</div>
									<div className="w-16 h-3 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-700 rounded"></div>
								</div>

							</div>

							{/* Optional card footer with additional info */}
							{cardIndex % 3 === 0 && (
								<div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 midnight:border-gray-800 bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-b-xl">
									<div className="flex items-center justify-between">
										<div className="flex items-center space-x-2">
											<div className="w-3 h-3 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded-full"></div>
											<div className="w-20 h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
										</div>
										<div className="w-12 h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
									</div>
								</div>
							)}
						</div>
					))}
				</div>

				{/* Empty state skeleton for when fewer cards are shown */}
				{skeletonCards.length < 4 && (
					<div className="flex flex-1 min-h-[40vh] items-center justify-center">
						<div className="flex flex-col items-center text-center animate-pulse">
							<div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full mb-4"></div>
							<div className="w-48 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded mb-2"></div>
							<div className="w-64 h-4 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-700 rounded mb-4"></div>
							<div className="w-28 h-10 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg"></div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default GalleryViewSkeleton;
