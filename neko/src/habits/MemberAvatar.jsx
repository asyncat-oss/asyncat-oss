import { Check } from 'lucide-react';

const MemberAvatar = ({ member, size = "w-8 h-8", completed = false }) => {
  // Get user profile picture
  const getUserAvatar = (user) => {
    if (user?.profile_picture || user?.user?.profile_picture) {
      const profilePic = user.profile_picture || user.user.profile_picture;
      
      if (profilePic.startsWith('https://')) {
        return profilePic;
      }
      
      // Handle predefined avatars
      try {
        const avatarMap = {
          'CAT': new URL('../assets/dp/CAT.webp', import.meta.url).href,
          'DOG': new URL('../assets/dp/DOG.webp', import.meta.url).href,
          'DOLPHIN': new URL('../assets/dp/DOLPHIN.webp', import.meta.url).href,
          'DRAGON': new URL('../assets/dp/DRAGON.webp', import.meta.url).href,
          'ELEPHANT': new URL('../assets/dp/ELEPHANT.webp', import.meta.url).href,
          'FOX': new URL('../assets/dp/FOX.webp', import.meta.url).href,
          'LION': new URL('../assets/dp/LION.webp', import.meta.url).href,
          'OWL': new URL('../assets/dp/OWL.webp', import.meta.url).href,
          'PENGUIN': new URL('../assets/dp/PENGUIN.webp', import.meta.url).href,
          'WOLF': new URL('../assets/dp/WOLF.webp', import.meta.url).href
        };
        return avatarMap[profilePic] || null;
      } catch {
        return null;
      }
    }
    return null;
  };

  // Get user initials
  const getUserInitials = (user) => {
    const name = user?.users?.name || user?.user?.name || user?.name;
    const email = user?.users?.email || user?.user?.email || user?.email;
    
    if (name) return name.charAt(0).toUpperCase();
    if (email) return email.charAt(0).toUpperCase();
    return 'U';
  };

  const avatar = getUserAvatar(member);
  const initials = getUserInitials(member);

  return (
    <div className={`${size} relative flex-shrink-0`}>
      {avatar ? (
        <img
          src={avatar}
          alt="Profile"
          className={`${size} rounded-full object-cover ${completed ? 'ring-2 ring-green-500' : ''}`}
        />
      ) : (
        <div className={`${size} rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 text-gray-600 dark:text-gray-300 midnight:text-gray-300 text-xs font-medium ${completed ? 'ring-2 ring-green-500' : ''}`}>
          {initials}
        </div>
      )}
      {completed && (
        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-white" />
        </div>
      )}
    </div>
  );
};

export default MemberAvatar;