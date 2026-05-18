import { randomUUID } from 'crypto';
import { sanitizeEmoji } from "./projectPermissionHelpers.js";

const PROJECT_FIELDS = "id, name, description, due_date, created_by, owner_id, created_at, updated_at, is_archived, team_id, emoji";

const presentProject = (project) => ({
	...project,
	emoji: sanitizeEmoji(project.emoji),
});

/**
 * GET /api/projects
 * Returns all projects owned by the current user.
 */
async function getProjects(req, res) {
	try {
		const { user, db } = req;

		const { data: projects, error } = await db
			.from("projects")
			.select(PROJECT_FIELDS)
			.eq("owner_id", user.id)
			.eq("is_archived", false);

		if (error) throw error;

		res.json({ success: true, data: (projects || []).map(presentProject) });
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
			.select("id, owner_id")
			.eq("id", teamId)
			.single();

		if (wsError || !workspace || workspace.owner_id !== user.id) {
			return res.status(403).json({ success: false, error: "Workspace not found or access denied" });
		}

		const { data: projects, error } = await db
			.from("projects")
			.select(PROJECT_FIELDS)
			.eq("team_id", teamId)
			.eq("owner_id", user.id)
			.eq("is_archived", false)
			.order("created_at", { ascending: false });

		if (error) throw error;

		res.json({ success: true, data: (projects || []).map(presentProject) });
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
			emoji: validatedEmoji,
		};

		const { data: project, error: projectError } = await db
			.from("projects")
			.insert([projectData])
			.select(PROJECT_FIELDS)
			.single();

		if (projectError) throw projectError;

		res.status(201).json({
			success: true,
			data: presentProject(project),
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
		const { name, description, due_date, emoji } = req.body;

		const { user, db } = req;

		// Single-user: only owner can update
		const { data: existingProject, error: fetchError } = await db
			.from("projects")
			.select("owner_id, emoji")
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

		const validUpdates = { updated_at: new Date().toISOString() };
		if (name !== undefined) validUpdates.name = name;
		if (description !== undefined) validUpdates.description = description;
		if (due_date !== undefined) validUpdates.due_date = due_date;
		if (emoji !== undefined) validUpdates.emoji = validatedEmoji;

		const { data: updatedProject, error: updateError } = await db
			.from("projects")
			.update(validUpdates)
			.eq("id", id)
			.select(PROJECT_FIELDS)
			.single();

		if (updateError) throw updateError;

		res.json({
			success: true,
			data: presentProject(updatedProject),
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
			.select("owner_id")
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

export {
  getProjects,
  getTeamProjects,
  createProject,
  updateProject,
  deleteProject,
};
