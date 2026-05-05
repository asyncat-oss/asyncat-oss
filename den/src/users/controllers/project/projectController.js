// projectController.js — single-user OSS version
// Removed: project_members queries, team member management, invitation emails
// Access check: project.owner_id === req.user.id

import { randomUUID } from 'crypto';
import {
	sanitizeEmoji,
	sanitizeWorkspaceEmoji,
	OWNER_PERMISSIONS,
	getDefaultEnabledViews,
	normalizeProjectViews,
	validateProjectEnabledViews,
	getDefaultViewPermissions,
} from "./projectPermissionHelpers.js";

// Helper: fetch workspace by id
async function getWorkspace(db, workspaceId) {
	if (!workspaceId) return null;
	const { data } = await db
		.from("workspaces")
		.select("id, name, owner_id, emoji")
		.eq("id", workspaceId)
		.single();
	return data || null;
}

/**
 * GET /api/projects
 * Returns all projects owned by the current user.
 */
async function getProjects(req, res) {
	try {
		const { user, db } = req;

		const { data: projects, error } = await db
			.from("projects")
			.select("id, name, description, due_date, created_by, owner_id, created_at, updated_at, is_archived, team_id, enabled_views, emoji")
			.eq("owner_id", user.id)
			.eq("is_archived", false);

		if (error) throw error;

		if (!projects || projects.length === 0) {
			return res.json({ success: true, data: [] });
		}

		// Fetch unique workspaces
		const workspaceIds = [...new Set(projects.map(p => p.team_id).filter(Boolean))];
		const workspaceList = await Promise.all(workspaceIds.map(id => getWorkspace(db, id)));
		const workspaceMap = workspaceList.reduce((acc, w) => { if (w) acc[w.id] = w; return acc; }, {});

		const processedProjects = projects.map((project) => {
			const availableViews = normalizeProjectViews(project.enabled_views);
			const sanitizedEmoji = sanitizeEmoji(project.emoji);

			const rawWorkspace = workspaceMap[project.team_id] || null;
			const sanitizedWorkspace = rawWorkspace?.emoji
				? { ...rawWorkspace, emoji: sanitizeWorkspaceEmoji(rawWorkspace.emoji) }
				: rawWorkspace;

			return {
				...project,
				emoji: sanitizedEmoji,
				teams: sanitizedWorkspace,
				project_members: [],
				user_role: "owner",
				user_permissions: OWNER_PERMISSIONS,
				available_views: availableViews,
				accessible_views: availableViews,
				user_visible_views: availableViews,
				user_view_preferences: null,
				user_view_permissions: getDefaultViewPermissions("owner", availableViews),
				guest_count: 0,
				starred: false,
				is_owner: true,
			};
		});

		res.json({ success: true, data: processedProjects });
	} catch (error) {
		console.error("Project fetch error:", error);
		res.status(500).json({ success: false, error: error.message || "Failed to fetch projects" });
	}
}

/**
 * GET /api/teams/:teamId/projects
 * Returns projects in a specific workspace owned by the user.
 */
async function getTeamProjects(req, res) {
	try {
		const { user, db } = req;
		const { teamId } = req.params;

		// Verify user owns this workspace
		const { data: workspace, error: wsError } = await db
			.from("workspaces")
			.select("id, name, owner_id, emoji")
			.eq("id", teamId)
			.single();

		if (wsError || !workspace || workspace.owner_id !== user.id) {
			return res.status(403).json({ success: false, error: "Workspace not found or access denied" });
		}

		const { data: projects, error } = await db
			.from("projects")
			.select("id, name, description, due_date, created_by, owner_id, created_at, updated_at, is_archived, team_id, enabled_views, emoji")
			.eq("team_id", teamId)
			.eq("owner_id", user.id)
			.order("created_at", { ascending: false });

		if (error) throw error;

		const sanitizedWorkspace = workspace.emoji
			? { ...workspace, emoji: sanitizeWorkspaceEmoji(workspace.emoji) }
			: workspace;

		const processedProjects = (projects || []).map((project) => {
			const availableViews = normalizeProjectViews(project.enabled_views);
			return {
				id: project.id,
				name: project.name,
				description: project.description,
				emoji: sanitizeEmoji(project.emoji),
				created_at: project.created_at,
				updated_at: project.updated_at,
				due_date: project.due_date,
				starred: false,
				user_role: "owner",
				user_status: "active",
				permissions: OWNER_PERMISSIONS,
				enabled_views: availableViews,
				accessible_views: availableViews,
				user_visible_views: availableViews,
				user_view_permissions: getDefaultViewPermissions("owner", availableViews),
				teams: sanitizedWorkspace,
				member_count: 1,
				guest_count: 0,
				total_members: 1,
				is_owner: true,
				owner_id: project.owner_id,
			};
		});

		res.json({ success: true, data: processedProjects });
	} catch (error) {
		console.error("Workspace projects fetch error:", error);
		res.status(500).json({ success: false, error: error.message || "Failed to fetch workspace projects" });
	}
}

/**
 * POST /api/projects
 */
async function createProject(req, res) {
	const { name, description, due_date, team_id, emoji = "📁" } = req.body;

	try {
		const { user, db } = req;
		const userId = user.id;

		const validatedEmoji = sanitizeEmoji(emoji);
		const finalEnabledViews = getDefaultEnabledViews();
		const viewValidation = validateProjectEnabledViews(finalEnabledViews);

		if (!viewValidation.isValid) {
			return res.status(400).json({ success: false, error: viewValidation.error });
		}

		if (!team_id) {
			return res.status(400).json({ success: false, error: "Workspace ID is required" });
		}

		// Validate workspace exists and user owns it
		const { data: workspace, error: wsError } = await db
			.from("workspaces")
			.select("id")
			.eq("id", team_id)
			.eq("owner_id", userId)
			.single();

		if (wsError || !workspace) {
			return res.status(403).json({ success: false, error: "Workspace not found or you are not the owner" });
		}

		const projectData = {
			id: randomUUID(),
			name,
			description,
			due_date,
			team_id,
			created_by: userId,
			owner_id: userId,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			is_archived: false,
			enabled_views: finalEnabledViews,
			emoji: validatedEmoji,
		};

		const { data: project, error: projectError } = await db
			.from("projects")
			.insert([projectData])
			.select()
			.single();

		if (projectError) throw projectError;

		res.status(201).json({
			success: true,
			data: {
				...project,
				emoji: validatedEmoji,
				user_role: "owner",
				user_permissions: OWNER_PERMISSIONS,
				available_views: finalEnabledViews,
				accessible_views: finalEnabledViews,
				user_visible_views: finalEnabledViews,
				user_view_preferences: null,
				user_view_permissions: getDefaultViewPermissions("owner", finalEnabledViews),
				guest_count: 0,
				starred: false,
				is_owner: true,
				project_members: [],
			},
		});
	} catch (error) {
		console.error("Project creation error:", error);
		res.status(400).json({ success: false, error: error.message });
	}
}

/**
 * PATCH /api/projects/:id
 */
async function updateProject(req, res) {
	try {
		const { id } = req.params;
		const { name, description, due_date, enabled_views, emoji, ...otherUpdates } = req.body;
		delete otherUpdates.starred;

		const { user, db } = req;

		// Single-user: only owner can update
		const { data: existingProject, error: fetchError } = await db
			.from("projects")
			.select("owner_id, team_id, enabled_views, emoji")
			.eq("id", id)
			.single();

		if (fetchError || !existingProject) {
			return res.status(404).json({ success: false, error: "Project not found" });
		}

		if (existingProject.owner_id !== user.id) {
			return res.status(403).json({ success: false, error: "You do not have permission to edit this project" });
		}

		let validatedEmoji = existingProject.emoji;
		if (emoji !== undefined) validatedEmoji = sanitizeEmoji(emoji);

		let finalEnabledViews = enabled_views;
		if (enabled_views !== undefined) {
			if (!Array.isArray(enabled_views)) {
				return res.status(400).json({ success: false, error: "Enabled views must be an array" });
			}
			finalEnabledViews = enabled_views.filter(view => view !== "timeline");
			if (finalEnabledViews.length === 0) {
				finalEnabledViews = getDefaultEnabledViews();
			}
			const validation = validateProjectEnabledViews(finalEnabledViews);
			if (!validation.isValid) {
				return res.status(400).json({ success: false, error: validation.error });
			}
		}

		const validUpdates = {
			name,
			description,
			due_date,
			updated_at: new Date().toISOString(),
			...otherUpdates,
		};

		if (finalEnabledViews) validUpdates.enabled_views = finalEnabledViews;
		if (emoji !== undefined) validUpdates.emoji = validatedEmoji;

		const { data: updatedProject, error: updateError } = await db
			.from("projects")
			.update(validUpdates)
			.eq("id", id)
			.select()
			.single();

		if (updateError) throw updateError;

		// Fetch workspace info
		const workspace = await getWorkspace(db, updatedProject.team_id);
		const sanitizedWorkspace = workspace?.emoji
			? { ...workspace, emoji: sanitizeWorkspaceEmoji(workspace.emoji) }
			: workspace;

		const availableViews = normalizeProjectViews(updatedProject.enabled_views);

		res.json({
			success: true,
			data: {
				...updatedProject,
				emoji: sanitizeEmoji(updatedProject.emoji),
				teams: sanitizedWorkspace,
				project_members: [],
				user_role: "owner",
				user_permissions: OWNER_PERMISSIONS,
				available_views: availableViews,
				accessible_views: availableViews,
				user_visible_views: availableViews,
				user_view_preferences: null,
				user_view_permissions: getDefaultViewPermissions("owner", availableViews),
				guest_count: 0,
				starred: false,
				is_owner: true,
			},
		});
	} catch (error) {
		console.error("Project update error:", error);
		res.status(500).json({ success: false, error: error.message || "Failed to update project" });
	}
}

/**
 * DELETE /api/projects/:id
 */
async function deleteProject(req, res) {
	try {
		const { id } = req.params;
		const { user, db } = req;

		// Single-user: only owner can delete
		const { data: project, error: projectError } = await db
			.from("projects")
			.select("owner_id, team_id, name, emoji")
			.eq("id", id)
			.single();

		if (projectError || !project) {
			return res.status(404).json({ success: false, error: "Project not found" });
		}

		if (project.owner_id !== user.id) {
			return res.status(403).json({ success: false, error: "Only project owners can delete projects" });
		}

		// Delete related data
		try {
			await db.from("Events").delete().eq("projectId", id);
			await db.from("Columns").delete().eq("projectId", id);
		} catch (relatedError) {
			console.error("Error deleting project related data:", relatedError);
		}

		const { error: projectDeleteError } = await db
			.from("projects")
			.delete()
			.eq("id", id);

		if (projectDeleteError) throw projectDeleteError;

		res.json({ success: true });
	} catch (error) {
		console.error("Project deletion error:", error);
		res.status(500).json({ success: false, error: error.message || "Failed to delete project" });
	}
}

/**
 * POST /api/projects/:id/transfer-ownership
 * Not applicable in single-user mode — kept as stub.
 */
async function transferOwnership(req, res) {
	return res.status(400).json({
		success: false,
		error: "Ownership transfer is not available in single-user mode",
	});
}

export {
	getProjects,
	getTeamProjects,
	createProject,
	updateProject,
	deleteProject,
	transferOwnership,
};
