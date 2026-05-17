// routes/userRoutes.js
import express from 'express';
import multer from 'multer';
import { auth, optionalAuth } from '../middleware/auth.js';
import {
  getCurrentUserProfile,
  updateUserProfile,
  getUserById,
  getUsersByIds,
  searchUsers,
  uploadProfilePicture,
  deleteProfilePicture,
} from '../controllers/userController.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'));
  },
});

router.get('/me', auth, getCurrentUserProfile);
router.put('/me', auth, updateUserProfile);
router.post('/me/profile-picture', auth, upload.single('profilePicture'), uploadProfilePicture);
router.delete('/me/profile-picture', auth, deleteProfilePicture);
router.get('/:id', optionalAuth, getUserById);
router.post('/by-ids', optionalAuth, getUsersByIds);
router.get('/search', optionalAuth, searchUsers);

export default router;