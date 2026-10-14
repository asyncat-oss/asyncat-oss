import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from './player.js';

// Fake <audio> elements: they note whether they play, and end when told.
function fakes() {
  const sounds = [];
  const revoked = [];
  const player = createPlayer({
    createAudio(url) {
      const sound = {
        src: url,
        state: 'new',
        onended: null,
        async play() { sound.state = 'playing'; },
        pause() { sound.state = 'paused'; },
        end() { sound.state = 'ended'; sound.onended?.(); },
      };
      sounds.push(sound);
      return sound;
    },
    revoke: (url) => revoked.push(url),
  });
  return { player, sounds, revoked };
}

const playingNow = (sounds) => sounds.filter((sound) => sound.state === 'playing').map((sound) => sound.src);

test('a sound started anywhere stops the one playing elsewhere', async () => {
  const { player, sounds } = fakes();
  await player.play('row', 'voice', 'blob:row');
  assert.equal(player.snapshot().owner, 'row');
  assert.equal(player.snapshot().playing, true);

  await player.play('try-it', 'speak', 'blob:try');
  assert.deepEqual(playingNow(sounds), ['blob:try']);
  assert.equal(sounds[0].state, 'paused');
  // Only the newer caller's button reads Stop.
  assert.equal(player.snapshot().owner, 'try-it');
  assert.equal(player.snapshot().key, 'speak');
});

test('stop only stops the caller’s own sound', async () => {
  const { player, sounds, revoked } = fakes();
  await player.play('row', 'voice', 'blob:row');
  player.stop('chooser');
  assert.deepEqual(playingNow(sounds), ['blob:row']);
  player.stop('row');
  assert.deepEqual(playingNow(sounds), []);
  assert.equal(player.snapshot().owner, null);
  assert.deepEqual(revoked, ['blob:row']);
});

test('a sound still loading never starts after a newer one, or after a stop', async () => {
  const { player, sounds, revoked } = fakes();
  let finishSlow;
  const slow = player.play('chooser', 'amy', () => new Promise((resolve) => { finishSlow = resolve; }));
  assert.equal(player.snapshot().loading, true);
  await player.play('row', 'voice', 'blob:row');
  finishSlow('blob:amy');
  await slow;
  assert.deepEqual(playingNow(sounds), ['blob:row']);
  assert.ok(revoked.includes('blob:amy'), 'its unused sound is let go');

  let finishLate;
  const late = player.play('files', 'lessac', () => new Promise((resolve) => { finishLate = resolve; }));
  player.stop('files');
  finishLate('blob:late');
  await late;
  assert.deepEqual(playingNow(sounds), []);
  assert.equal(player.snapshot().owner, null);
});

test('a sound that ends frees its button, and a failure is told to its own caller', async () => {
  const { player, sounds } = fakes();
  let changes = 0;
  const unsubscribe = player.subscribe(() => { changes += 1; });
  await player.play('row', 'voice', 'blob:row');
  sounds[0].end();
  assert.equal(player.snapshot().owner, null);
  assert.ok(changes >= 3);
  unsubscribe();

  await player.play('try-it', 'speak', () => Promise.reject(new Error('Piper is not installed.')));
  assert.equal(player.snapshot().error, 'Piper is not installed.');
  assert.equal(player.snapshot().errorOwner, 'try-it');
  assert.equal(player.snapshot().loading, false);
  // The next play clears it.
  await player.play('row', 'voice', 'blob:again');
  assert.equal(player.snapshot().error, '');
});
