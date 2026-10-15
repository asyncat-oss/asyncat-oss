// routes/userRoutes.js
import express from 'express';
import multer from 'multer';
import {
  getCurrentUserProfile,
  updateUserProfile,
  uploadProfilePicture,
  deleteProfilePicture,
} from '../controllers/userController.js';
import { PERSONALIZATION_LIMIT, getPersonalization, savePersonalization } from '../personalization.js';

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

// Settings → Personalization: { about, answerStyle, limit }.
router.get('/me/personalization', (req, res) => {
  res.json({ success: true, data: { ...getPersonalization(req.user.id), limit: PERSONALIZATION_LIMIT } });
});

// { about?, answerStyle? }: a field left out keeps its value.
router.put('/me/personalization', (req, res) => {
  try {
    const { about, answerStyle } = req.body || {};
    if (about === undefined && answerStyle === undefined) {
      return res.status(400).json({ success: false, error: 'Send about or answerStyle.' });
    }
    const saved = savePersonalization(req.user.id, { about, answerStyle });
    res.json({ success: true, data: { ...saved, limit: PERSONALIZATION_LIMIT } });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

export default router;
