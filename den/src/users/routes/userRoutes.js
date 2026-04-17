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
import { 
  uploadProfilePicture, 
  deleteCustomProfilePicture,
  regenerateProfilePictureUrl,
  checkBlobStorageHealth
} from '../controllers/profilePictureController.js';

const router = express.Router();

// Existing routes
router.get('/me', auth, getCurrentUserProfile);
router.put('/me', auth, updateUserProfile);
router.get('/:id', optionalAuth, getUserById);
router.post('/by-ids', optionalAuth, getUsersByIds);
router.get('/search', optionalAuth, searchUsers);

// New profile picture upload routes
router.post('/me/profile-picture', auth, uploadProfilePicture);
router.delete('/me/profile-picture', auth, deleteCustomProfilePicture);
router.patch('/me/profile-picture/regenerate-url', auth, regenerateProfilePictureUrl);

// Health check for Azure Blob Storage
router.get('/health/blob-storage', checkBlobStorageHealth);

export default router;