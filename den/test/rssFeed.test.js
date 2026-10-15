import test from 'node:test';
import assert from 'node:assert/strict';

const { parseFeedXml } = await import('../src/integrations/rss/rssService.js');

test('an address that is not a feed is said in plain words', () => {
  const notAFeed = "That address didn't return an RSS or Atom feed.";
  assert.throws(() => parseFeedXml('<html><body>Hello</body></html> trailing text', 'http://x'), { message: notAFeed });
  assert.throws(() => parseFeedXml('{"not":"xml"}', 'http://x'), { message: notAFeed });
  assert.throws(() => parseFeedXml('<page><title>Just XML</title></page>', 'http://x'), { message: notAFeed });
});

test('RSS and Atom feeds still parse', () => {
  const rss = parseFeedXml('<rss><channel><title>Birds</title><item><title>Herons</title><link>https://x/h</link></item></channel></rss>', 'http://x');
  assert.equal(rss.feed.title, 'Birds');
  assert.equal(rss.items[0].title, 'Herons');
  const atom = parseFeedXml('<feed xmlns="http://www.w3.org/2005/Atom"><title>Storks</title><entry><title>Nests</title><id>1</id></entry></feed>', 'http://x');
  assert.equal(atom.feed.title, 'Storks');
  assert.equal(atom.items.length, 1);
});
