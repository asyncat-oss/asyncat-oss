// Built-in profile avatars. A profile picture is either one of these ids or the
// URL of an uploaded image.
import catDP from './CAT.webp';
import dogDP from './DOG.webp';
import dolphinDP from './DOLPHIN.webp';
import dragonDP from './DRAGON.webp';
import elephantDP from './ELEPHANT.webp';
import foxDP from './FOX.webp';
import lionDP from './LION.webp';
import owlDP from './OWL.webp';
import penguinDP from './PENGUIN.webp';
import wolfDP from './WOLF.webp';

export const AVATARS = [
  { id: 'CAT', src: catDP, name: 'Cat' },
  { id: 'DOG', src: dogDP, name: 'Dog' },
  { id: 'DOLPHIN', src: dolphinDP, name: 'Dolphin' },
  { id: 'DRAGON', src: dragonDP, name: 'Dragon' },
  { id: 'ELEPHANT', src: elephantDP, name: 'Elephant' },
  { id: 'FOX', src: foxDP, name: 'Fox' },
  { id: 'LION', src: lionDP, name: 'Lion' },
  { id: 'OWL', src: owlDP, name: 'Owl' },
  { id: 'PENGUIN', src: penguinDP, name: 'Penguin' },
  { id: 'WOLF', src: wolfDP, name: 'Wolf' },
];

export const isCustomImageUrl = (value) =>
  value && /^https?:\/\//.test(value) && /\/files\/profile-pictures\//.test(value);

/** Image URL for a stored profile picture; the cat when unset or unknown. */
export function avatarSrc(profilePicture) {
  if (isCustomImageUrl(profilePicture)) return profilePicture;
  return (AVATARS.find((avatar) => avatar.id === profilePicture) || AVATARS[0]).src;
}
