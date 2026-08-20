import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import localDb from '../../../db/client.js';
import { sanitizeEmoji } from "./projectPermissionHelpers.js";

const PROJECT_FIELDS = "id, name, description, due_date, created_by, owner_id, created_at, updated_at, is_archived, team_id, emoji";

const projectFolderRootId = (folderId) => `project:${folderId}`;

const presentFolder = (folder) => ({
	...folder,
	is_primary: Boolean(folder.is_primary),
	exists: fs.existsSync(folder.path),
	root_id: projectFolderRootId(folder.id),
});

const foldersForProject = (projectId) => localDb.prepare(`
	SELECT id, project_id, name, path, is_primary, position, created_at, updated_at
	FROM project_folders
	WHERE project_id = ?
	ORDER BY is_primary DESC, position ASC, created_at ASC
`).all(projectId).map(presentFolder);

const presentProject = (project) => {
	const folders = foldersForProject(project.id);
	return {
		...project,
		emoji: sanitizeEmoji(project.emoji),
		folders,
		folder_count: folders.length,
		primary_folder: folders.find(folder => folder.is_primary) || folders[0] || null,
	};
};

function ownedProject(projectId, userId) {
	return localDb.prepare(`
		SELECT id, owner_id, team_id, name
		FROM projects
		WHERE id = ? AND owner_id = ? AND is_archived = 0
	`).get(projectId, userId);
}

function canonicalDirectory(rawPath) {
	const candidate = String(rawPath || '').trim();
	if (!candidate || !path.isAbsolute(candidate)) {
		const error = new Error('Choose an absolute folder path');
		error.status = 400;
		throw error;
	}
	const resolved = path.resolve(candidate);
	if (!fs.existsSync(resolved)) {
		const error = new Error('Folder not found');
		error.status = 404;
		throw error;
	}
	if (!fs.statSync(resolved).isDirectory()) {
		const error = new Error('The selected path is not a folder');
		error.status = 400;
		throw error;
	}
	return fs.realpathSync(resolved);
}

function pathKey(folderPath) {
	const normalized = path.normalize(folderPath).replace(/[\\/]+$/, '');
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function createProjectFolder(projectId, rawPath, rawName = '', makePrimary = false) {
	const folderPath = canonicalDirectory(rawPath);
	const existingCount = localDb.prepare('SELECT COUNT(*) AS count FROM project_folders WHERE project_id = ?').get(projectId)?.count || 0;
	const id = randomUUID();
	const name = String(rawName || path.basename(folderPath) || 'Project folder').trim().slice(0, 120);
	const position = localDb.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM project_folders WHERE project_id = ?').get(projectId)?.next || 0;
	const isPrimary = makePrimary || existingCount === 0;

	localDb.transaction(() => {
		if (isPrimary) {
			localDb.prepare("UPDATE project_folders SET is_primary = 0, updated_at = datetime('now') WHERE project_id = ?").run(projectId);
		}
		localDb.prepare(`
			INSERT INTO project_folders (id, project_id, name, path, path_key, is_primary, position, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
		`).run(id, projectId, name, folderPath, pathKey(folderPath), isPrimary ? 1 : 0, position);
		localDb.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
	})();

	return foldersForProject(projectId).find(folder => folder.id === id);
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
 * Backwards-compatible internal namespace route.
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
	const { name, description, due_date, team_id, emoji = "📁", folder_path, folder_name } = req.body;

	try {
		const { user, db } = req;
		const userId = user.id;

		const projectName = String(name || '').trim();
		if (!projectName) {
			return res.status(400).json({ success: false, error: 'Project name is required' });
		}
		const validatedEmoji = sanitizeEmoji(emoji);
		if (folder_path) canonicalDirectory(folder_path);

		const internalWorkspaceId = team_id || localDb.prepare(
			'SELECT id FROM workspaces WHERE owner_id = ? ORDER BY created_at LIMIT 1'
		).get(userId)?.id;
		if (!internalWorkspaceId) {
			return res.status(500).json({ success: false, error: 'Project storage is not initialized' });
		}

		// Validate workspace exists and user owns it
		const { data: workspace, error: wsError } = await db
			.from("workspaces")
			.select("id")
			.eq("id", internalWorkspaceId)
			.eq("owner_id", userId)
			.single();

		if (wsError || !workspace) {
			return res.status(403).json({ success: false, error: "Workspace not found or you are not the owner" });
		}

		const projectData = {
			id: randomUUID(),
			name: projectName.slice(0, 160),
			description,
			due_date,
			team_id: internalWorkspaceId,
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

		// Auto-create default columns for every new project
		const defaultColumns = [
			{ title: 'To Do', order: 0 },
			{ title: 'In Progress', order: 1 },
			{ title: 'Done', order: 2 },
		];
		for (const col of defaultColumns) {
			await db.from('Columns').insert({
				id: randomUUID(),
				title: col.title,
				projectId: project.id,
				createdBy: userId,
				order: col.order,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
		}

		if (folder_path) createProjectFolder(project.id, folder_path, folder_name, true);

		res.status(201).json({
			success: true,
			data: presentProject(project),
		});
	} catch (error) {
		console.error("Project creation error:", error);
		res.status(400).json({ success: false, error: error.message });
	}
}

/** GET /api/projects/:id/folders */
function getProjectFolders(req, res) {
	try {
		if (!ownedProject(req.params.id, req.user.id)) {
			return res.status(404).json({ success: false, error: 'Project not found' });
		}
		res.json({ success: true, data: foldersForProject(req.params.id) });
	} catch (error) {
		res.status(500).json({ success: false, error: error.message || 'Failed to load project folders' });
	}
}

/** POST /api/projects/:id/folders */
function addProjectFolder(req, res) {
	try {
		if (!ownedProject(req.params.id, req.user.id)) {
			return res.status(404).json({ success: false, error: 'Project not found' });
		}
		const folder = createProjectFolder(req.params.id, req.body?.path, req.body?.name, req.body?.is_primary === true);
		res.status(201).json({ success: true, data: folder });
	} catch (error) {
		const duplicate = String(error.message || '').includes('UNIQUE constraint failed');
		res.status(duplicate ? 409 : (error.status || 400)).json({
			success: false,
			error: duplicate ? 'That folder is already attached to this project' : error.message,
		});
	}
}

/** PATCH /api/projects/:id/folders/:folderId */
function updateProjectFolder(req, res) {
	try {
		if (!ownedProject(req.params.id, req.user.id)) {
			return res.status(404).json({ success: false, error: 'Project not found' });
		}
		const folder = localDb.prepare('SELECT * FROM project_folders WHERE id = ? AND project_id = ?').get(req.params.folderId, req.params.id);
		if (!folder) return res.status(404).json({ success: false, error: 'Folder not found' });

		localDb.transaction(() => {
			if (req.body?.is_primary === true) {
				localDb.prepare("UPDATE project_folders SET is_primary = 0, updated_at = datetime('now') WHERE project_id = ?").run(req.params.id);
				localDb.prepare("UPDATE project_folders SET is_primary = 1, updated_at = datetime('now') WHERE id = ?").run(folder.id);
			}
			if (req.body?.name !== undefined) {
				const nextName = String(req.body.name || '').trim().slice(0, 120);
				if (!nextName) throw Object.assign(new Error('Folder name is required'), { status: 400 });
				localDb.prepare("UPDATE project_folders SET name = ?, updated_at = datetime('now') WHERE id = ?").run(nextName, folder.id);
			}
			localDb.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
		})();

		const updated = foldersForProject(req.params.id).find(item => item.id === folder.id);
		res.json({ success: true, data: updated });
	} catch (error) {
		res.status(error.status || 400).json({ success: false, error: error.message || 'Failed to update folder' });
	}
}

/** DELETE /api/projects/:id/folders/:folderId */
function deleteProjectFolder(req, res) {
	try {
		if (!ownedProject(req.params.id, req.user.id)) {
			return res.status(404).json({ success: false, error: 'Project not found' });
		}
		const folder = localDb.prepare('SELECT id, is_primary FROM project_folders WHERE id = ? AND project_id = ?').get(req.params.folderId, req.params.id);
		if (!folder) return res.status(404).json({ success: false, error: 'Folder not found' });

		localDb.transaction(() => {
			localDb.prepare('DELETE FROM project_folders WHERE id = ? AND project_id = ?').run(folder.id, req.params.id);
			if (folder.is_primary) {
				const next = localDb.prepare('SELECT id FROM project_folders WHERE project_id = ? ORDER BY position, created_at LIMIT 1').get(req.params.id);
				if (next) localDb.prepare("UPDATE project_folders SET is_primary = 1, updated_at = datetime('now') WHERE id = ?").run(next.id);
			}
			localDb.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
		})();

		res.json({ success: true });
	} catch (error) {
		res.status(500).json({ success: false, error: error.message || 'Failed to remove folder' });
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
  getProjectFolders,
  addProjectFolder,
  updateProjectFolder,
  deleteProjectFolder,
};
