import { useState, useEffect } from 'react';
import { AtSign, Check } from 'lucide-react';
import { profileApi, apiUtils } from './settingApi';
import eventBus from '../utils/eventBus.js';

// Import profile pictures
import catDP from '../assets/dp/CAT.webp';
import dogDP from '../assets/dp/DOG.webp';
import dolphinDP from '../assets/dp/DOLPHIN.webp';
import dragonDP from '../assets/dp/DRAGON.webp';
import elephantDP from '../assets/dp/ELEPHANT.webp';
import foxDP from '../assets/dp/FOX.webp';
import lionDP from '../assets/dp/LION.webp';
import owlDP from '../assets/dp/OWL.webp';
import penguinDP from '../assets/dp/PENGUIN.webp';
import wolfDP from '../assets/dp/WOLF.webp';

// Constants for validation
const MAX_NAME_LENGTH = 50;

const soraFontBase = "font-sora"; // Added Sora font

// Skeleton Loading Component
const ProfileSkeleton = () => {
  return (
    <div className={`space-y-4 animate-pulse ${soraFontBase}`}>
      <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 p-5 rounded-xl border border-gray-200/60 dark:border-gray-700/40 midnight:border-gray-800/40">
        {/* Header Skeleton */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800"></div>
          <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
        </div>
        
        <div className="space-y-4">
          {/* Fields Skeleton */}
          <div className="space-y-1.5">
            <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
            <div className="h-9 w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg"></div>
          </div>
          
          <div className="space-y-1.5">
            <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
            <div className="h-9 w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg"></div>
          </div>

          {/* Avatar Section Skeleton */}
          <div className="space-y-3">
            <div className="h-3 w-28 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
            <div className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700/40 midnight:bg-gray-800/40 rounded-lg">
              <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800"></div>
              <div className="space-y-1.5">
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
                <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
              </div>
            </div>
          </div>
          
          {/* Button Skeleton */}
          <div className="pt-3">
            <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProfileSection = ({ session: _session }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    profilePicture: 'CAT'
  });
  
  const profilePictures = [
    { id: 'CAT', src: catDP, name: 'Cat' },
    { id: 'DOG', src: dogDP, name: 'Dog' },
    { id: 'DOLPHIN', src: dolphinDP, name: 'Dolphin' },
    { id: 'DRAGON', src: dragonDP, name: 'Dragon' },
    { id: 'ELEPHANT', src: elephantDP, name: 'Elephant' },
    { id: 'FOX', src: foxDP, name: 'Fox' },
    { id: 'LION', src: lionDP, name: 'Lion' },
    { id: 'OWL', src: owlDP, name: 'Owl' },
    { id: 'PENGUIN', src: penguinDP, name: 'Penguin' },
    { id: 'WOLF', src: wolfDP, name: 'Wolf' }
  ];
  
  const [localMessage, setLocalMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllAvatars, setShowAllAvatars] = useState(false);
  

  // Fetch user profile data
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const data = await profileApi.fetchProfile();
        
        if (data.success && data.data) {
          setUserData(data.data);
          
          // Check if profile_picture is a predefined avatar
          let pictureValue = 'CAT'; // default

          if (data.data.profile_picture && profilePictures.some(pic => pic.id === data.data.profile_picture)) {
            pictureValue = data.data.profile_picture;
          }
            
          setFormData({
            name: data.data.name || '',
            email: data.data.email || '',
            profilePicture: pictureValue
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        setLocalMessage({ 
          type: 'error', 
          text: apiUtils.handleError(error, 'Could not load profile data. Please try again later.')
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'name' && value.length > MAX_NAME_LENGTH) {
      return;
    }
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleProfilePictureChange = (pictureId) => {
    setFormData(prev => ({
      ...prev,
      profilePicture: pictureId
    }));
  };


  // Get current profile picture source
  const getCurrentProfilePicture = () => {
    return profilePictures.find(pic => pic.id === formData.profilePicture) || profilePictures[0];
  };

  const currentProfilePicture = getCurrentProfilePicture();

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLocalMessage(null);

    try {
      let updateData = {};

      // Handle predefined avatar selection
      if (formData.profilePicture !== userData?.profile_picture) {
        updateData.profile_picture = formData.profilePicture;
      }

      if (formData.name !== userData?.name) {
        updateData.name = formData.name;
      }

      // Only make API call if there are updates
      if (Object.keys(updateData).length === 0) {
        setLocalMessage({ type: 'success', text: 'No changes to save' });
        return;
      }

      const data = await profileApi.updateProfile(updateData);

      if (!data.success) {
        throw new Error(data.error || 'Failed to update profile');
      }

      // Update the userData state with the new values
      setUserData(data.data);

      // Notify other components about the profile update
      eventBus.emit('profile-updated', {
        profilePicture: updateData.profile_picture || formData.profilePicture,
        name: formData.name,
      });

      setLocalMessage({ type: 'success', text: 'Profile updated successfully' });
    } catch (error) {
      setLocalMessage({
        type: 'error',
        text: apiUtils.handleError(error, 'An error occurred while updating your profile')
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  // Input field classes with improved styling
  const inputClasses = `w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800/80 midnight:border-gray-800/80
    bg-transparent text-gray-800 dark:text-gray-200 midnight:text-gray-100
    focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600 focus:border-gray-300 dark:focus:border-gray-600 
    transition-all duration-150 text-sm`;

  const readOnlyClasses = `flex items-center px-3 py-2 rounded-lg border border-gray-200/60 dark:border-gray-800/60 midnight:border-gray-800/60 
    bg-gray-50/30 dark:bg-gray-800/30 midnight:bg-gray-900/30 text-sm text-gray-500`;

  const buttonClasses = {
    primary: `px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white 
      midnight:bg-gray-100 midnight:hover:bg-white text-white dark:text-gray-900 midnight:text-gray-900 rounded-lg
      transition-all duration-150 font-medium text-sm
      focus:outline-none focus:ring-2 focus:ring-gray-500/50 focus:ring-offset-1
      disabled:opacity-60 disabled:cursor-not-allowed`,
    secondary: `px-3 py-1.5 bg-gray-100/50 hover:bg-gray-200/50 dark:bg-gray-800/50 dark:hover:bg-gray-700/50 
      midnight:bg-gray-800/50 midnight:hover:bg-gray-700/50 
      text-gray-700 dark:text-gray-300 midnight:text-gray-200 rounded-lg 
      transition-all duration-150 font-medium text-sm
      focus:outline-none focus:ring-2 focus:ring-gray-400/50 focus:ring-offset-1`,
    danger: `px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 rounded-lg 
      transition-all duration-150 font-medium text-sm`
  };

  // Show skeleton loader while loading
  if (loading) {
    return <ProfileSkeleton />;
  }
  return (
    <div className={`space-y-4 ${soraFontBase}`}>
      {localMessage && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${
          localMessage.type === 'success' ? 
            'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/30 midnight:bg-green-900/30 midnight:text-green-200 midnight:border-green-700/30' : 
            'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/30 midnight:bg-red-900/30 midnight:text-red-200 midnight:border-red-700/30'
        }`}>
          {localMessage.text}
        </div>
      )}
      
      {/* Profile Card */}
      <div className="bg-transparent border-0 overflow-hidden">
        {/* Card Content - Left to Right Layout */}
        <div className="py-2">
          <div className="flex flex-col md:flex-row gap-12">
            {/* Left Side - Avatar Card */}
            <div className="flex-shrink-0 w-64">
              {/* Avatar Display Card */}
              <div className="mb-4">
                <div className="text-center mb-4">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-2">
                    Profile Picture
                  </h3>
                </div>

                {/* Large Avatar Display */}
                <div className="flex flex-col items-center mb-6">
                  <div className="relative mb-4">
                    <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 p-1">
                      <img
                        src={currentProfilePicture.src}
                        alt={currentProfilePicture.name}
                        className="w-full h-full rounded-full object-cover"
                      />
                    </div>
                  </div>

                  {/* Avatar Info */}
                  <div className="text-center">
                    <div className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                      {currentProfilePicture.name}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAllAvatars(!showAllAvatars)}
                    className="flex-1 px-3 py-2 bg-gray-900 dark:bg-white midnight:bg-gray-100 text-white dark:text-gray-900 midnight:text-gray-900 rounded-lg text-sm transition-all duration-150"
                  >
                    {showAllAvatars ? 'Hide Options' : 'Change Picture'}
                  </button>
                </div>
              </div>

              {/* Avatar Selection Menu */}
              {showAllAvatars && (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-200">
                      Choose Avatar
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {profilePictures.map((picture) => (
                      <button
                        key={picture.id}
                        type="button"
                        onClick={() => handleProfilePictureChange(picture.id)}
                        aria-label={`Select ${picture.name} avatar`}
                        className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all duration-200
                          ${formData.profilePicture === picture.id
                            ? 'border-gray-900 dark:border-white midnight:border-gray-100'
                            : 'border-gray-200 dark:border-gray-700 midnight:border-gray-800 hover:border-gray-400'}`}
                      >
                        <img
                          src={picture.src}
                          alt={picture.name}
                          className="w-full h-full object-cover"
                        />
                        {formData.profilePicture === picture.id && (
                          <div className="absolute top-1 right-1 w-4 h-4 bg-gray-900 dark:bg-white midnight:bg-gray-100 rounded-full flex items-center justify-center">
                            <Check size={10} className="text-white dark:text-gray-900 midnight:text-gray-900" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Side - Form Fields */}
            <div className="flex-1">
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                {/* Name Field */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-100">
                    Full Name
                    <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-300 ml-2 font-normal">
                      ({formData.name.length}/{MAX_NAME_LENGTH})
                    </span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className={inputClasses}
                    placeholder="Enter your full name"
                    maxLength={MAX_NAME_LENGTH}
                  />
                </div>
                
                {/* Email Field */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-100">
                    Email
                  </label>
                  <div className={readOnlyClasses}>
                    <AtSign size={14} className="text-gray-400 dark:text-gray-500 midnight:text-gray-400 mr-2" />
                    <span className="text-gray-600 dark:text-gray-300 midnight:text-gray-200">{formData.email}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-300">
                    Email address cannot be changed
                  </p>
                </div>
                
                {/* Submit Button */}
                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={buttonClasses.primary}
                  >
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default ProfileSection;