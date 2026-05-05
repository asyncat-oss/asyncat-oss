

const ListViewSkeleton = () => {
	// Create skeleton rows for the list view table
	const skeletonRows = Array(8).fill(0); // Show 8 skeleton rows

	return (
		<div className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl shadow-md transition-all duration-200">
			{/* Header with filters skeleton */}
			<div className="px-4 pt-4 pb-2">
				<div className="flex flex-col space-y-4">
					{/* Search and filters row */}
					<div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
						{/* Search bar skeleton */}
						<div className="flex-1 max-w-md">
							<div className="relative">
								<div className="w-full h-10 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg animate-pulse"></div>
							</div>
						</div>

					</div>

					{/* Filter chips skeleton */}
					<div className="flex flex-wrap gap-2">
						{Array(6)
							.fill(0)
							.map((_, index) => (
								<div
									key={index}
									className="h-7 w-20 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full animate-pulse"
									style={{
										animationDelay: `${index * 50}ms`,
									}}
								></div>
							))}
					</div>
				</div>
			</div>

			{/* Table container */}
			<div className="flex-1 min-h-0 flex flex-col">
				<div className="flex-1 min-h-0 overflow-y-auto">
					{/* Table header skeleton */}
					<div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
						<div className="grid grid-cols-12 gap-4 px-4 py-3">
							{/* Column headers */}
							<div className="col-span-4">
								<div className="w-24 h-4 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse"></div>
							</div>
							<div className="col-span-2">
								<div className="w-16 h-4 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse"></div>
							</div>
							<div className="col-span-2">
								<div className="w-20 h-4 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse"></div>
							</div>
							<div className="col-span-2">
								<div className="w-18 h-4 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse"></div>
							</div>
							<div className="col-span-2">
								<div className="w-16 h-4 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse"></div>
							</div>
						</div>
					</div>

					{/* Table rows skeleton */}
					<div className="divide-y divide-gray-200 dark:divide-gray-700 midnight:divide-gray-800">
						{skeletonRows.map((_, rowIndex) => (
							<div
								key={rowIndex}
								className="px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors duration-150"
								style={{
									animationDelay: `${rowIndex * 100}ms`,
								}}
							>
								<div className="grid grid-cols-12 gap-4 items-center">
									{/* Task title and expand button */}
									<div className="col-span-4 flex items-center space-x-3">
										<div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse"></div>
										<div className="flex-1">
											<div className="w-48 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse mb-1"></div>
											<div className="w-32 h-3 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse"></div>
										</div>
									</div>

									{/* Status */}
									<div className="col-span-2">
										<div className="w-20 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full animate-pulse"></div>
									</div>

									{/* Priority */}
									<div className="col-span-2">
										<div className="w-16 h-6 bg-red-200 dark:bg-red-800 midnight:bg-red-800 rounded-full animate-pulse"></div>
									</div>

									{/* Progress */}
									<div className="col-span-4 flex items-center">
										<div className="w-full mr-3">
											<div className="w-full h-2 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full animate-pulse"></div>
										</div>
									</div>
								</div>

								{/* Occasionally show expanded row skeleton */}
								{rowIndex % 3 === 0 && (
									<div className="mt-4 pl-7 space-y-3">
										{/* Subtasks skeleton */}
										<div className="bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-3">
											<div className="space-y-2">
												{Array(2)
													.fill(0)
													.map((_, subIndex) => (
														<div
															key={subIndex}
															className="flex items-center space-x-2"
														>
															<div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse"></div>
															<div className="w-40 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse"></div>
															<div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full animate-pulse"></div>
														</div>
													))}
											</div>
										</div>

										{/* Time entries skeleton */}
										<div className="bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-3">
											<div className="flex justify-between items-center mb-2">
												<div className="w-32 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse"></div>
												<div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse"></div>
											</div>
											<div className="space-y-1">
												{Array(2)
													.fill(0)
													.map((_, timeIndex) => (
														<div
															key={timeIndex}
															className="flex justify-between items-center"
														>
															<div className="w-24 h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse"></div>
															<div className="w-16 h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse"></div>
														</div>
													))}
											</div>
										</div>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
};

export default ListViewSkeleton;
