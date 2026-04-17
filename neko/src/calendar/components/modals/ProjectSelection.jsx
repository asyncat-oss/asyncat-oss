// ProjectSelection.jsx — single-user OSS version
// Shows all user projects (no team filtering needed)

import React, { useState, useEffect } from "react";
import { Briefcase, Search, Check } from "lucide-react";
import { calendarProjectsApi } from "../../api/calendarApi";

const ProjectSelection = ({
	projectId,
	setProjectId,
	isPersonalEvent,
}) => {
	const [projects, setProjects] = useState([]);
	const [isLoading, setIsLoading] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	useEffect(() => {
		if (isPersonalEvent) {
			setProjects([]);
			return;
		}
		const fetchProjects = async () => {
			try {
				setIsLoading(true);
				const result = await calendarProjectsApi.getProjects();
				const data = result.data || [];
				if (Array.isArray(data)) {
					setProjects(data.sort((a, b) => a.name.localeCompare(b.name)));
				}
			} catch (error) {
				console.error("Error fetching projects:", error);
				setProjects([]);
			} finally {
				setIsLoading(false);
			}
		};
		fetchProjects();
	}, [isPersonalEvent]);

	const filteredProjects = projects.filter((project) => {
		if (!searchQuery) return true;
		const q = searchQuery.toLowerCase();
		return project.name.toLowerCase().includes(q) ||
			(project.description && project.description.toLowerCase().includes(q));
	});

	if (isPersonalEvent) return null;

	return (
		<div>
			{/* Search */}
			<div className="relative mb-3">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
				<input
					type="text"
					placeholder="Search projects..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
				/>
			</div>

			{isLoading ? (
				<div className="flex justify-center py-6">
					<div className="w-5 h-5 animate-spin border-2 border-indigo-500 rounded-full border-t-transparent" />
				</div>
			) : filteredProjects.length > 0 ? (
				<div className="space-y-1.5 max-h-48 overflow-y-auto">
					{filteredProjects.map((project) => (
						<button
							key={project.id}
							type="button"
							onClick={(e) => { e.preventDefault(); setProjectId(project.id); }}
							className={`w-full p-3 border rounded-lg text-left transition-colors ${
								projectId === project.id
									? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400"
									: "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
							}`}
						>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<span className="text-lg">{project.emoji || "📁"}</span>
									<div>
										<p className="text-sm font-medium text-gray-900 dark:text-gray-100">
											{project.name}
										</p>
										{project.description && (
											<p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
												{project.description}
											</p>
										)}
									</div>
								</div>
								{projectId === project.id && (
									<Check className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
								)}
							</div>
						</button>
					))}
				</div>
			) : (
				<div className="text-center py-6">
					<Briefcase className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
					<p className="text-sm text-gray-500 dark:text-gray-400">
						{searchQuery ? "No projects found." : "No projects available."}
					</p>
					{searchQuery && (
						<button
							type="button"
							onClick={(e) => { e.preventDefault(); setSearchQuery(""); }}
							className="text-blue-500 text-sm hover:underline mt-1"
						>
							Clear search
						</button>
					)}
				</div>
			)}
		</div>
	);
};

export default ProjectSelection;
