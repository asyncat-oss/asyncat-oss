// den/src/agent/learningRoutes.js
// /api/learning: Settings → Privacy & safety → Learning from chats, and the
// "Save this as a skill?" drafts waiting in chats (see skillSuggestions.js).

import express from 'express';
import { learningSettings, setLearningSettings } from './learningSettings.js';
import { dismissSkillSuggestion, dropSkillSuggestions, listSkillSuggestions, saveSkillSuggestion } from './skillSuggestions.js';

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ success: true, settings: learningSettings() });
});

// { rememberChats?: boolean, suggestSkills?: boolean }
router.put('/', (req, res) => {
  try {
    const { rememberChats, suggestSkills } = req.body || {};
    if (typeof rememberChats !== 'boolean' && typeof suggestSkills !== 'boolean') {
      return res.status(400).json({ success: false, error: 'rememberChats or suggestSkills must be true or false' });
    }
    const settings = setLearningSettings({ rememberChats, suggestSkills });
    if (suggestSkills === false) dropSkillSuggestions(req.user.id);
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/suggestions', (req, res) => {
  try {
    const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId : '';
    res.json({ success: true, suggestions: listSkillSuggestions(req.user.id, conversationId) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/suggestions/:id/save', (req, res) => {
  try {
    const skill = saveSkillSuggestion(req.user.id, req.params.id);
    if (!skill) return res.status(404).json({ success: false, error: 'That suggestion is gone.' });
    res.json({ success: true, skill: { name: skill.name, filename: skill.filename } });
  } catch (err) {
    const exists = /already exists/.test(err.message);
    res.status(exists ? 409 : 500).json({ success: false, error: exists ? 'You already have a skill with that name.' : err.message });
  }
});

router.delete('/suggestions/:id', (req, res) => {
  try {
    dismissSkillSuggestion(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
