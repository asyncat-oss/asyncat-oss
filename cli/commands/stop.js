'use strict';

const { stopAll } = require('../lib/procs');
const { info } = require('../lib/colors');

function run() {
  const stopped = stopAll();
  if (!stopped) info('Nothing running.');
}

module.exports = { run };
