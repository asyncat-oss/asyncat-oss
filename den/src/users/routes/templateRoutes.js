// templateRoutes.js - Template management routes
import express from 'express';
import { verifyUser, optionalAuth } from '../middleware/auth.js';

// Import template controllers
import {
  getTemplates,
  getTemplate,
  createTemplate,
  applyTemplate,
  saveProjectAsTemplate,
  updateTemplate,
  deleteTemplate
} from '../controllers/templateController.js';

const router = express.Router();

// =====================================================
// TEMPLATE BROWSING AND DISCOVERY
// =====================================================

// Get available templates
// Query params: team_id, category, purpose
router.get('/', optionalAuth, getTemplates);

// Get specific template with content
router.get('/:id', optionalAuth, getTemplate);

// =====================================================
// TEMPLATE CREATION AND MANAGEMENT
// =====================================================

// Create new template
router.post('/', auth, createTemplate);

// Update existing template (creator only)
router.put('/:id', auth, updateTemplate);

// Delete template (creator only) - soft delete
router.delete('/:id', auth, deleteTemplate);

// =====================================================
// TEMPLATE APPLICATION
// =====================================================

// Apply template to create new project
router.post('/:id/apply', auth, applyTemplate);

// =====================================================
// PROJECT TO TEMPLATE CONVERSION
// =====================================================

// Save existing project as template
router.post('/from-project/:id', auth, saveProjectAsTemplate);

// =====================================================
// TEMPLATE CONTENT MANAGEMENT (Future Enhancement)
// =====================================================

// Get template content (included in getTemplate for now)
// router.get('/:id/content', getTemplateContent);

// Add content to template
// router.post('/:id/content', addTemplateContent);

// Update template content item
// router.put('/:id/content/:contentId', updateTemplateContent);

// Delete template content item
// router.delete('/:id/content/:contentId', deleteTemplateContent);

// =====================================================
// TEMPLATE ANALYTICS (Future Enhancement)
// =====================================================

// Get template usage statistics
// router.get('/:id/analytics', getTemplateAnalytics);

export default router;