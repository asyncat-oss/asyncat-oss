

const GanttViewSkeleton = () => {
	// Create skeleton rows for the Gantt chart
	const skeletonTasks = Array(6).fill(0);

	return (
		<div className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950">
			{/* Filters Header Skeleton */}
			<div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 z-10">
				<div className="px-4 py-3">
					<div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
						{/* Left side controls */}
						<div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
							{/* Search bar skeleton */}
							<div className="w-64 h-9 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg animate-pulse"></div>

							{/* Filter buttons skeleton */}
							<div className="flex items-center space-x-2">
								{Array(4)
									.fill(0)
									.map((_, index) => (
										<div
											key={index}
											className="w-20 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"
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
							{/* View type and navigation skeleton */}
							<div className="flex items-center space-x-2">
								<div className="w-16 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
								<div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
								<div className="w-32 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
								<div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
							</div>

							{/* Zoom controls skeleton */}
							<div className="flex items-center space-x-1">
								<div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
								<div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
							</div>

							{/* Create button skeleton */}
							<div className="w-28 h-9 bg-blue-200 dark:bg-blue-800 midnight:bg-blue-800 rounded-lg animate-pulse"></div>
						</div>
					</div>
				</div>
			</div>

			{/* Fixed Header Row Skeleton */}
			<div className="flex flex-shrink-0 z-30 bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
				{/* Task List Header */}
				<div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 midnight:border-gray-800 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900">
					<div className="h-12 px-4 flex items-center justify-between">
						<div className="w-24 h-4 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse"></div>
						<div className="flex space-x-2">
							<div className="w-4 h-4 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse"></div>
							<div className="w-4 h-4 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse"></div>
						</div>
					</div>
				</div>

				{/* Timeline Header */}
				<div className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900">
					<div className="h-12 flex items-center">
						{/* Week days or timeline units skeleton */}
						<div className="flex space-x-0 w-full">
							{Array(7)
								.fill(0)
								.map((_, dayIndex) => (
									<div
										key={dayIndex}
										className="flex-1 px-4 py-2 border-r border-gray-200 dark:border-gray-700 midnight:border-gray-800 text-center"
									>
										<div className="w-8 h-3 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse mx-auto mb-1"></div>
										<div className="w-6 h-3 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse mx-auto"></div>
									</div>
								))}
						</div>
					</div>
				</div>
			</div>

			{/* Gantt Content Area Skeleton */}
			<div className="flex-1 flex overflow-hidden">
				<div className="flex-1 overflow-auto bg-white dark:bg-gray-900 midnight:bg-slate-950">
					<div className="flex">
						{/* Task List Content */}
						<div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 midnight:border-gray-800 bg-gray-50/50 dark:bg-gray-900 midnight:bg-gray-900/50">
							{skeletonTasks.map((_, rowIndex) => (
								<div
									key={rowIndex}
									className="h-[140px] border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-4 flex flex-col justify-center space-y-3"
									style={{
										animationDelay: `${rowIndex * 100}ms`,
									}}
								>
									{/* Task title */}
									<div className="w-48 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse"></div>

									{/* Task details */}
									<div className="flex items-center space-x-3">
										{/* Priority indicator */}
										<div className="w-3 h-3 bg-red-300 dark:bg-red-600 midnight:bg-red-600 rounded-full animate-pulse"></div>

										{/* Status badge */}
										<div className="w-16 h-5 bg-blue-200 dark:bg-blue-800 midnight:bg-blue-800 rounded-full animate-pulse"></div>
									</div>

									{/* Assignee and progress */}
									<div className="flex items-center justify-between">
										<div className="flex items-center space-x-2">
											<div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full animate-pulse"></div>
											<div className="w-20 h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse"></div>
										</div>
										<div className="w-12 h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded animate-pulse"></div>
									</div>

									{/* Progress bar */}
									<div className="w-full h-2 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full animate-pulse"></div>
								</div>
							))}
						</div>

						{/* Timeline Content */}
						<div className="flex-1 min-w-0 relative">
							{/* Timeline grid background */}
							<div className="absolute inset-0">
								{skeletonTasks.map((_, rowIndex) => (
									<div
										key={`background-row-${rowIndex}`}
										className={`relative h-[140px] border-b border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 ${
											rowIndex % 2 === 0
												? "bg-white dark:bg-gray-900 midnight:bg-gray-950"
												: "bg-gray-50 dark:bg-gray-800/60 midnight:bg-gray-900/80"
										}`}
									>
										{/* Grid columns */}
										<div className="absolute inset-0 flex">
											{Array(7)
												.fill(0)
												.map((_, dayIndex) => (
													<div
														key={`grid-cell-${rowIndex}-${dayIndex}`}
														className="flex-1 border-r border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60"
													></div>
												))}
										</div>
									</div>
								))}
							</div>

							{/* Task Bars Overlay */}
							<div className="relative z-10">
								{skeletonTasks.map((_, rowIndex) => (
									<div
										key={`task-bar-${rowIndex}`}
										className="absolute left-0 right-0"
										style={{
											top: `${rowIndex * 140}px`,
											height: "140px",
										}}
									>
										<div className="relative w-full h-full flex items-center px-4">
											{/* Task bar skeleton */}
											<div
												className="h-8 bg-indigo-200 dark:bg-indigo-700 midnight:bg-indigo-700 rounded-md animate-pulse flex items-center px-3"
												style={{
													width: `${
														Math.random() * 40 + 20
													}%`,
													marginLeft: `${
														Math.random() * 30
													}%`,
													animationDelay: `${
														rowIndex * 150
													}ms`,
												}}
											>
												<div className="w-16 h-3 bg-indigo-100 dark:bg-indigo-600 midnight:bg-indigo-600 rounded animate-pulse"></div>
											</div>

											{/* Progress indicator on task bar */}
											<div
												className="absolute top-1/2 transform -translate-y-1/2 h-2 bg-indigo-400 dark:bg-indigo-500 midnight:bg-indigo-500 rounded-full animate-pulse"
												style={{
													width: `${
														Math.random() * 20 + 10
													}%`,
													left: `${
														Math.random() * 30 + 10
													}%`,
												}}
											></div>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default GanttViewSkeleton;
