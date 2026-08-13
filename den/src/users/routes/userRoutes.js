// routes/userRoutes.js
import express from 'express';
import multer from 'multer';
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

router.get('/me', getCurrentUserProfile);
router.put('/me', updateUserProfile);
router.post('/me/profile-picture', upload.single('profilePicture'), uploadProfilePicture);
router.delete('/me/profile-picture', deleteProfilePicture);
router.get('/:id', getUserById);
router.post('/by-ids', getUsersByIds);
router.get('/search', searchUsers);

export default router;
