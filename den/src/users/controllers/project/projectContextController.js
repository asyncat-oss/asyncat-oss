// Project home: one project with its instructions, knowledge files, chats
// and how all of that fits the current model. See knowledge/.
import multer from 'multer';
import localDb from '../../../db/client.js';
import {
	addKnowledgeFile, deleteKnowledgeFile, listKnowledgeFiles, MAX_FILE_BYTES,
} from '../../../knowledge/knowledgeStore.js';
import { knowledgeFitReport } from '../../../knowledge/contextBuilder.js';
import { getActiveModelProfile } from '../../../ai/controllers/ai/modelProfile.js';

export const MAX_INSTRUCTIONS_CHARS = 20000;

export const knowledgeUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_FILE_BYTES, files: 20 },
}).array('files', 20);

function ownedProjectRow(projectId, userId) {
	return localDb.prepare(`
		SELECT id, name, description, emoji, instructions, created_at, updated_at
		FROM projects WHERE id = ? AND owner_id = ? AND is_archived = 0
	`).get(projectId, userId);
}

function requireProject(req, res) {
	const project = ownedProjectRow(req.params.id, req.user.id);
	if (!project) {
		res.status(404).json({ success: false, error: 'Project not found' });
		return null;
	}
	return project;
}

/** Chats that belong to a project (newest first). */
export function projectChats(projectId, userId, limit = 200) {
	return localDb.prepare(`
		SELECT id, title, message_count, last_message_at, updated_at, created_at, metadata
		FROM conversations
		WHERE user_id = ? AND deleted_at IS NULL AND is_archived = 0
			AND EXISTS (SELECT 1 FROM json_each(conversations.project_ids) WHERE value = ?)
		ORDER BY COALESCE(last_message_at, updated_at) DESC
		LIMIT ?
	`).all(userId, projectId, limit).map((row) => {
		let engine = null;
		try { engine = JSON.parse(row.metadata || '{}').engine || null; } catch { /* ignore */ }
		return {
			id: row.id,
			title: row.title,
			message_count: row.message_count,
			last_message_at: row.last_message_at || row.updated_at,
			created_at: row.created_at,
			engine,
		};
	});
}

/** GET /api/projects/:id/chats */
export function getProjectChats(req, res) {
	const project = requireProject(req, res);
	if (!project) return;
	res.json({ success: true, data: projectChats(project.id, req.user.id) });
}

/** PATCH /api/projects/:id/instructions */
export function updateProjectInstructions(req, res) {
	const project = requireProject(req, res);
	if (!project) return;
	const instructions = String(req.body?.instructions ?? '');
	if (instructions.length > MAX_INSTRUCTIONS_CHARS) {
		return res.status(400).json({ success: false, error: `Instructions can be up to ${MAX_INSTRUCTIONS_CHARS.toLocaleString()} characters.` });
	}
	localDb.prepare("UPDATE projects SET instructions = ?, updated_at = datetime('now') WHERE id = ?").run(instructions, project.id);
	return res.json({ success: true, data: { instructions } });
}

/** GET /api/projects/:id/knowledge */
export function getProjectKnowledge(req, res) {
	const project = requireProject(req, res);
	if (!project) return;
	res.json({ success: true, data: listKnowledgeFiles('project', project.id) });
}

/** POST /api/projects/:id/knowledge (multipart, field "files") */
export async function addProjectKnowledge(req, res) {
	const project = requireProject(req, res);
	if (!project) return;
	const files = Array.isArray(req.files) ? req.files : [];
	if (!files.length) return res.status(400).json({ success: false, error: 'Choose at least one file.' });
	const added = [];
	const errors = [];
	for (const file of files) {
		try {
			added.push(await addKnowledgeFile({
				ownerType: 'project',
				ownerId: project.id,
				userId: req.user.id,
				fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
				mimeType: file.mimetype,
				buffer: file.buffer,
			}));
		} catch (err) {
			errors.push({ name: file.originalname, error: err.message });
		}
	}
	if (added.length) localDb.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(project.id);
	res.status(added.length ? 200 : 422).json({ success: added.length > 0, data: added, errors });
}

/** DELETE /api/projects/:id/knowledge/:fileId */
export function deleteProjectKnowledge(req, res) {
	const project = requireProject(req, res);
	if (!project) return;
	const removed = deleteKnowledgeFile('project', project.id, req.params.fileId);
	res.status(removed ? 200 : 404).json({ success: removed });
}

/** GET /api/projects/:id/context — how instructions + knowledge fit the current model. */
export function getProjectContextFit(req, res) {
	const project = requireProject(req, res);
	if (!project) return;
	res.json({
		success: true,
		data: knowledgeFitReport({
			ownerType: 'project',
			ownerId: project.id,
			instructions: project.instructions,
			profile: getActiveModelProfile(req.user.id),
		}),
	});
}
