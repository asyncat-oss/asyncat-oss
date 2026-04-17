// controllers/profilePictureController.js
import Busboy from 'busboy';
import { BlobServiceClient, StorageSharedKeyCredential, BlobSASPermissions, generateBlobSASQueryParameters } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { verifyUser } from '../../auth/authMiddleware.js';

// File validation constants
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/webp'
];

// Azure Blob Storage configuration
const AZURE_STORAGE_ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT;
const AZURE_STORAGE_ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER || 'profile-pictures';
const USE_SAS_TOKENS = process.env.USE_SAS_TOKENS === 'true'; // Optional: use SAS tokens for private storage

// Initialize Azure Blob Storage
let blobServiceClient = null;
let containerClient = null;
let sharedKeyCredential = null;

const initializeAzureStorage = async () => {
  if (!AZURE_STORAGE_ACCOUNT || !AZURE_STORAGE_ACCOUNT_KEY) {
    throw new Error('Azure Storage account name and account key are required');
  }

  if (!blobServiceClient) {
    try {
      // Create StorageSharedKeyCredential for authentication
      sharedKeyCredential = new StorageSharedKeyCredential(
        AZURE_STORAGE_ACCOUNT,
        AZURE_STORAGE_ACCOUNT_KEY
      );

      // Create BlobServiceClient using the credential
      const blobServiceUrl = `https://${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`;
      blobServiceClient = new BlobServiceClient(blobServiceUrl, sharedKeyCredential);
      
      containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
      
      // Create container with appropriate access level
      const accessLevel = USE_SAS_TOKENS ? 'container' : 'blob';
      await containerClient.createIfNotExists({
        access: accessLevel
      });
      
      console.log(`✅ Azure Blob container "${CONTAINER_NAME}" is ready`);
      console.log(`📁 Storage Account: ${AZURE_STORAGE_ACCOUNT}`);
      console.log(`🔒 Access Mode: ${USE_SAS_TOKENS ? 'Private (SAS)' : 'Public'}`);
      
    } catch (error) {
      console.error('❌ Error initializing Azure Blob container:', error);
      throw error;
    }
  }
};

/**
 * Generate a SAS URL for a blob (for private storage accounts)
 * @param {string} blobName - Name of the blob
 * @param {number} expiryHours - Hours until the SAS token expires (default: 24)
 * @returns {string} - SAS URL
 */
const generateSASUrl = (blobName, expiryHours = 24) => {
  if (!USE_SAS_TOKENS) {
    // Return regular public URL for public storage
    return `https://${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER_NAME}/${blobName}`;
  }

  const sasOptions = {
    containerName: CONTAINER_NAME,
    blobName: blobName,
    permissions: BlobSASPermissions.parse('r'), // Read permission
    startsOn: new Date(),
    expiresOn: new Date(new Date().valueOf() + expiryHours * 60 * 60 * 1000), // 24 hours from now
  };

  const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
  return `https://${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER_NAME}/${blobName}?${sasToken}`;
};

/**
 * Process and upload image to Azure Blob Storage
 * @param {Buffer} imageBuffer - Raw image buffer
 * @param {string} userId - User ID for naming
 * @param {string} originalName - Original filename
 * @returns {Promise<string>} - Public URL or SAS URL of uploaded image
 */
const uploadImageToBlob = async (imageBuffer, userId, originalName) => {
  await initializeAzureStorage();

  try {
    // Process image with Sharp
    const processedImage = await sharp(imageBuffer)
      .resize(400, 400, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({
        quality: 85,
        progressive: true
      })
      .toBuffer();

    // Generate unique filename
    const fileExtension = 'jpg'; // Always convert to JPG
    const fileName = `${userId}-${uuidv4()}.${fileExtension}`;
    
    // Upload to Azure Blob
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    
    const uploadOptions = {
      blobHTTPHeaders: {
        blobContentType: 'image/jpeg',
        blobCacheControl: 'public, max-age=31536000' // 1 year cache
      },
      metadata: {
        userId: userId,
        uploadDate: new Date().toISOString(),
        originalName: originalName
      }
    };

    await blockBlobClient.upload(processedImage, processedImage.length, uploadOptions);
    
    // Return appropriate URL based on storage configuration
    if (USE_SAS_TOKENS) {
      // Generate SAS URL for private storage (expires in 8760 hours = 1 year)
      return generateSASUrl(fileName, 8760);
    } else {
      // Return direct public URL
      return blockBlobClient.url;
    }
  } catch (error) {
    console.error('Error uploading to Azure Blob:', error);
    throw new Error('Failed to upload profile picture');
  }
};

/**
 * Delete image from Azure Blob Storage
 * @param {string} imageUrl - URL of the image to delete
 */
const deleteImageFromBlob = async (imageUrl) => {
  await initializeAzureStorage();

  try {
    if (!imageUrl || !imageUrl.includes(CONTAINER_NAME)) {
      return; // Not an Azure blob URL or invalid
    }

    // Extract blob name from URL
    const urlParts = imageUrl.split('/');
    const blobName = urlParts[urlParts.length - 1];
    
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
    
    console.log(`Deleted profile picture: ${blobName}`);
  } catch (error) {
    console.error('Error deleting from Azure Blob:', error);
    // Don't throw error for deletion failures
  }
};

/**
 * Upload custom profile picture
 */
export async function uploadProfilePicture(req, res) {
  try {
    const { user, supabase } = await verifyUser(req);
    
    const busboy = Busboy({ 
      headers: req.headers,
      limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1 // Only allow one file
      }
    });

    let fileBuffer = null;
    let fileName = null;
    let mimeType = null;
    let uploadError = null;
    let fileSize = 0;

    // Handle file upload
    busboy.on('file', (fieldname, file, info) => {
      const { filename, mimeType: fileMimeType } = info;
      
      fileName = filename;
      mimeType = fileMimeType;
      
      // Validate file type
      if (!ALLOWED_MIME_TYPES.includes(fileMimeType)) {
        uploadError = 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.';
        file.resume(); // Discard the file
        return;
      }

      const chunks = [];
      
      file.on('data', (chunk) => {
        fileSize += chunk.length;
        
        // Check file size during upload
        if (fileSize > MAX_FILE_SIZE) {
          uploadError = 'File size exceeds 1MB limit.';
          file.resume(); // Discard remaining data
          return;
        }
        
        chunks.push(chunk);
      });

      file.on('end', () => {
        if (!uploadError) {
          fileBuffer = Buffer.concat(chunks);
        }
      });

      file.on('error', (err) => {
        uploadError = 'Error reading file: ' + err.message;
      });
    });

    // Handle busboy errors
    busboy.on('error', (err) => {
      uploadError = 'Upload error: ' + err.message;
    });

    // Handle upload completion
    busboy.on('finish', async () => {
      if (uploadError) {
        return res.status(400).json({
          success: false,
          error: uploadError
        });
      }

      if (!fileBuffer) {
        return res.status(400).json({
          success: false,
          error: 'No file received'
        });
      }

      try {
        // Get current user profile to check for existing custom image
        const { data: currentProfile } = await supabase
          .from('users')
          .select('profile_picture')
          .eq('id', user.id)
          .single();

        // If user has a custom profile picture, delete the old one
        if (currentProfile?.profile_picture && currentProfile.profile_picture.startsWith('https://')) {
          await deleteImageFromBlob(currentProfile.profile_picture);
        }

        // Upload new image to Azure Blob Storage
        const imageUrl = await uploadImageToBlob(
          fileBuffer,
          user.id,
          fileName
        );

        // Update user profile with new image URL
        const { data: updatedProfile, error: updateError } = await supabase
          .from('users')
          .update({
            profile_picture: imageUrl,
            updated_at: new Date()
          })
          .eq('id', user.id)
          .select()
          .single();

        if (updateError) {
          // If database update fails, try to clean up uploaded image
          await deleteImageFromBlob(imageUrl);
          throw updateError;
        }

        res.json({
          success: true,
          data: {
            profile_picture: imageUrl,
            user: updatedProfile
          },
          message: 'Profile picture uploaded successfully'
        });

      } catch (error) {
        console.error('Error processing profile picture upload:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to process profile picture upload'
        });
      }
    });

    // Handle busboy size limit exceeded
    busboy.on('filesLimit', () => {
      res.status(400).json({
        success: false,
        error: 'Too many files. Only one file is allowed.'
      });
    });

    busboy.on('fieldsLimit', () => {
      res.status(400).json({
        success: false,
        error: 'Too many fields in the request.'
      });
    });

    // Pipe request to busboy
    req.pipe(busboy);

  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(error.message === 'Invalid session' ? 401 : 500).json({
      success: false,
      error: error.message || 'Failed to upload profile picture'
    });
  }
}

/**
 * Delete custom profile picture and revert to default
 */
export async function deleteCustomProfilePicture(req, res) {
  try {
    const { user, supabase } = await verifyUser(req);
    
    // Get current user profile
    const { data: currentProfile, error: fetchError } = await supabase
      .from('users')
      .select('profile_picture')
      .eq('id', user.id)
      .single();

    if (fetchError) throw fetchError;

    // Check if user has a custom profile picture (URL starts with https://)
    if (currentProfile?.profile_picture && currentProfile.profile_picture.startsWith('https://')) {
      // Delete from Azure Blob Storage
      await deleteImageFromBlob(currentProfile.profile_picture);
      
      // Update user profile to default avatar
      const { data: updatedProfile, error: updateError } = await supabase
        .from('users')
        .update({
          profile_picture: 'CAT', // Default to CAT avatar
          updated_at: new Date()
        })
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      res.json({
        success: true,
        data: updatedProfile,
        message: 'Custom profile picture deleted successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'No custom profile picture to delete'
      });
    }

  } catch (error) {
    console.error('Delete custom profile picture error:', error);
    res.status(error.message === 'Invalid session' ? 401 : 500).json({
      success: false,
      error: error.message || 'Failed to delete custom profile picture'
    });
  }
}

/**
 * Regenerate SAS URL for existing profile picture (for SAS token renewal)
 */
export async function regenerateProfilePictureUrl(req, res) {
  try {
    const { user, supabase } = await verifyUser(req);
    
    // Get current user profile
    const { data: currentProfile, error: fetchError } = await supabase
      .from('users')
      .select('profile_picture')
      .eq('id', user.id)
      .single();

    if (fetchError) throw fetchError;

    // Check if user has a custom profile picture stored in blob
    if (!currentProfile?.profile_picture || !currentProfile.profile_picture.includes(AZURE_STORAGE_ACCOUNT)) {
      return res.status(400).json({
        success: false,
        error: 'No custom profile picture found in blob storage'
      });
    }

    // Extract blob name from existing URL
    const urlParts = currentProfile.profile_picture.split('/');
    const blobNameWithQuery = urlParts[urlParts.length - 1];
    const blobName = blobNameWithQuery.split('?')[0]; // Remove SAS query if present

    await initializeAzureStorage();

    // Check if blob exists
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const exists = await blockBlobClient.exists();
    
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'Profile picture file not found in storage'
      });
    }

    // Generate new URL (SAS or public based on configuration)
    const newUrl = USE_SAS_TOKENS ? generateSASUrl(blobName, 8760) : blockBlobClient.url;

    // Update database with new URL
    const { data: updatedProfile, error: updateError } = await supabase
      .from('users')
      .update({
        profile_picture: newUrl,
        updated_at: new Date()
      })
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      success: true,
      data: {
        profile_picture: newUrl,
        user: updatedProfile,
        urlType: USE_SAS_TOKENS ? 'SAS' : 'Public'
      },
      message: 'Profile picture URL regenerated successfully'
    });

  } catch (error) {
    console.error('Regenerate profile picture URL error:', error);
    res.status(error.message === 'Invalid session' ? 401 : 500).json({
      success: false,
      error: error.message || 'Failed to regenerate profile picture URL'
    });
  }
}

/**
 * Get blob metadata (utility function)
 * @param {string} imageUrl - URL of the image
 */
export const getBlobMetadata = async (imageUrl) => {
  await initializeAzureStorage();

  try {
    const urlParts = imageUrl.split('/');
    const blobNameWithQuery = urlParts[urlParts.length - 1];
    const blobName = blobNameWithQuery.split('?')[0]; // Remove SAS query if present
    
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const response = await blockBlobClient.getProperties();
    
    return response.metadata;
  } catch (error) {
    console.error('Error getting blob metadata:', error);
    return null;
  }
};
/**
 * Health check for Azure Blob Storage connection
 */
export async function checkBlobStorageHealth(req, res) {
  try {
    // Check if environment variables are set
    if (!AZURE_STORAGE_ACCOUNT || !AZURE_STORAGE_ACCOUNT_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Missing Azure Storage credentials',
        config: {
          storageAccount: AZURE_STORAGE_ACCOUNT || 'NOT_SET',
          containerName: CONTAINER_NAME,
          accountKeySet: !!AZURE_STORAGE_ACCOUNT_KEY,
          accountKeyLength: AZURE_STORAGE_ACCOUNT_KEY ? AZURE_STORAGE_ACCOUNT_KEY.length : 0,
          useSasTokens: USE_SAS_TOKENS
        }
      });
    }

    await initializeAzureStorage();
    
    // Try to check if container exists to verify connection
    const containerExists = await containerClient.exists();
    
    // Get container properties for additional info
    let containerInfo = null;
    if (containerExists) {
      try {
        const properties = await containerClient.getProperties();
        containerInfo = {
          lastModified: properties.lastModified,
          etag: properties.etag,
          publicAccess: properties.blobPublicAccess
        };
      } catch (propError) {
        console.warn('Could not get container properties:', propError.message);
      }
    }
    
    res.json({
      success: true,
      data: {
        storageAccount: AZURE_STORAGE_ACCOUNT,
        containerName: CONTAINER_NAME,
        containerExists: containerExists,
        containerInfo: containerInfo,
        blobServiceUrl: `https://${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,
        authentication: 'StorageSharedKeyCredential',
        accessMode: USE_SAS_TOKENS ? 'Private (SAS)' : 'Public',
        useSasTokens: USE_SAS_TOKENS,
        timestamp: new Date().toISOString()
      },
      message: 'Azure Blob Storage connection is healthy'
    });
  } catch (error) {
    console.error('Blob storage health check failed:', error);
    
    // Provide more detailed error information
    let errorDetails = {
      message: error.message,
      code: error.code || 'UNKNOWN',
      statusCode: error.statusCode || 'UNKNOWN'
    };
    
    // Check for common authentication errors
    if (error.code === 'NoAuthenticationInformation' || error.statusCode === 401) {
      errorDetails.suggestion = 'Check if your AZURE_STORAGE_ACCOUNT_KEY is correct and not expired';
    } else if (error.code === 'AccountNotFound' || error.statusCode === 404) {
      errorDetails.suggestion = 'Check if your AZURE_STORAGE_ACCOUNT name is correct';
    } else if (error.statusCode === 409 && error.message.includes('Public access is not permitted')) {
      errorDetails.suggestion = 'Enable public access in your storage account settings or set USE_SAS_TOKENS=true';
    }
    
    res.status(500).json({
      success: false,
      error: 'Azure Blob Storage connection failed',
      details: errorDetails,
      config: {
        storageAccount: AZURE_STORAGE_ACCOUNT || 'NOT_SET',
        containerName: CONTAINER_NAME,
        accountKeySet: !!AZURE_STORAGE_ACCOUNT_KEY,
        accountKeyLength: AZURE_STORAGE_ACCOUNT_KEY ? AZURE_STORAGE_ACCOUNT_KEY.length : 0,
        blobServiceUrl: AZURE_STORAGE_ACCOUNT ? `https://${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net` : 'NOT_AVAILABLE',
        useSasTokens: USE_SAS_TOKENS
      }
    });
  }
}