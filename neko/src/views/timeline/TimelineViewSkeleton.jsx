

const TimelineViewSkeleton = () => {
	// Create skeleton groups for the timeline view
	const skeletonGroups = Array(4).fill(0);
	const skeletonTasks = Array(3).fill(0); // Tasks per group

	return (
		<div className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950">
			{/* Timeline Controls Skeleton */}
			<div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 z-10">
				<div className="px-4 py-3">
					<div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
						{/* Left side controls */}
						<div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
							{/* Search bar skeleton */}
							<div className="w-64 h-9 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg animate-pulse"></div>

							{/* View mode buttons skeleton */}
							<div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-1">
								{Array(3)
									.fill(0)
									.map((_, index) => (
										<div
											key={index}
											className="w-16 h-7 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"
											style={{
												animationDelay: `${
													index * 50
												}ms`,
											}}
										></div>
									))}
							</div>
						</div>

						{/* Right side controls */}
						<div className="flex items-center space-x-3">
							{/* Navigation controls skeleton */}
							<div className="flex items-center space-x-2">
								<div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
								<div className="w-32 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
								<div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
							</div>

							{/* Filter and create button skeleton */}
							<div className="w-20 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
							<div className="w-28 h-9 bg-blue-200 dark:bg-blue-800 midnight:bg-blue-800 rounded-lg animate-pulse"></div>
						</div>
					</div>

					{/* Filter chips skeleton */}
					<div className="flex flex-wrap gap-2 mt-3">
						{Array(5)
							.fill(0)
							.map((_, index) => (
								<div
									key={index}
									className="h-6 w-16 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full animate-pulse"
									style={{
										animationDelay: `${index * 75}ms`,
									}}
								></div>
							))}
					</div>
				</div>
			</div>

			{/* Timeline Content Area Skeleton */}
			<div className="flex-1 overflow-hidden relative">
				<div className="h-full flex">
					{/* Left Panel Skeleton (Task Groups) */}
					<div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50">
						{/* Header */}
						<div className="h-14 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 px-4 flex items-center">
							<div className="w-32 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse"></div>
						</div>

						{/* Task Groups */}
						<div className="overflow-y-auto">
							{skeletonGroups.map((_, groupIndex) => (
								<div
									key={groupIndex}
									className="border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800"
									style={{
										animationDelay: `${groupIndex * 100}ms`,
									}}
								>
									{/* Group Header */}
									<div className="bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 px-4 py-3 flex items-center justify-between">
										<div className="flex items-center space-x-3">
											<div className="w-3 h-3 bg-indigo-300 dark:bg-indigo-600 midnight:bg-indigo-600 rounded-full animate-pulse"></div>
											<div className="w-24 h-4 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse"></div>
										</div>
										<div className="w-6 h-4 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse"></div>
									</div>

									{/* Tasks in Group */}
									<div className="divide-y divide-gray-200 dark:divide-gray-700 midnight:divide-gray-800">
										{skeletonTasks.map((_, taskIndex) => (
											<div
												key={taskIndex}
												className="px-4 py-4 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900"
											>
												<div className="flex items-start space-x-3">
													{/* Priority indicator */}
													<div className="w-1 h-12 bg-red-300 dark:bg-red-600 midnight:bg-red-600 rounded-full animate-pulse mt-1"></div>

													<div className="flex-1 space-y-2">
														{/* Task title */}
														<div className="w-48 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse"></div>

														{/* Task details */}
														<div className="flex items-center space-x-4">
															{/* Status badge */}
															<div className="w-20 h-5 bg-blue-200 dark:bg-blue-800 midnight:bg-blue-800 rounded-full animate-pulse"></div>

															{/* Assignee avatar */}
															<div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full animate-pulse"></div>

															{/* Progress */}
															<div className="flex-1 max-w-20">
																<div className="w-full h-1 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full animate-pulse"></div>
															</div>
														</div>
													</div>

													{/* Timer button skeleton */}
													<div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
												</div>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Timeline Panel Skeleton */}
					<div className="flex-1 bg-white dark:bg-gray-900 midnight:bg-gray-950">
						{/* Timeline Header */}
						<div className="h-14 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 flex items-center">
							<div className="flex space-x-1 px-4">
								{Array(7)
									.fill(0)
									.map((_, dayIndex) => (
										<div
											key={dayIndex}
											className="flex-1 min-w-0 text-center"
										>
											<div className="w-12 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse mx-auto mb-1"></div>
											<div className="w-8 h-3 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse mx-auto"></div>
										</div>
									))}
							</div>
						</div>

						{/* Timeline Grid Content */}
						<div className="overflow-auto">
							{skeletonGroups.map((_, groupIndex) => (
								<div
									key={groupIndex}
									className="border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800"
								>
									{/* Group Header */}
									<div className="h-12 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800"></div>

									{/* Task Bars */}
									{skeletonTasks.map((_, taskIndex) => (
										<div
											key={taskIndex}
											className="h-16 border-b border-gray-100 dark:border-gray-700 midnight:border-gray-800 relative"
											style={{
												background:
													taskIndex % 2 === 0
														? "transparent"
														: "rgb(249 250 251 / 0.5)",
											}}
										>
											{/* Timeline grid columns */}
											<div className="absolute inset-0 flex">
												{Array(7)
													.fill(0)
													.map((_, colIndex) => (
														<div
															key={colIndex}
															className="flex-1 border-r border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-800/50"
														></div>
													))}
											</div>

											{/* Task bar skeleton */}
											<div className="absolute inset-y-0 flex items-center px-2">
												<div
													className="h-6 bg-indigo-200 dark:bg-indigo-700 midnight:bg-indigo-700 rounded-md animate-pulse"
													style={{
														width: `${
															Math.random() * 60 +
															20
														}%`,
														marginLeft: `${
															Math.random() * 30
														}%`,
													}}
												></div>
											</div>
										</div>
									))}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default TimelineViewSkeleton;
