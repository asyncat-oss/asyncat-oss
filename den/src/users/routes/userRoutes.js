// routes/userRoutes.js
import express from 'express';
import { auth, optionalAuth } from '../middleware/auth.js';
import { 
  getCurrentUserProfile, 
  updateUserProfile, 
  getUserById, 
  getUsersByIds, 
  searchUsers 
} from '../controllers/userController.js';

const router = express.Router();

// Existing routes
router.get('/me', auth, getCurrentUserProfile);
router.put('/me', auth, updateUserProfile);
router.get('/:id', optionalAuth, getUserById);
router.post('/by-ids', optionalAuth, getUsersByIds);
router.get('/search', optionalAuth, searchUsers);

export default router;