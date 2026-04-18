import readline from 'readline';

export const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
};

export const col = (color, str) => `${c[color] || ''}${str}${c.reset}`;

let _rl = null;
let _ll = null;   // LiveLine instance (replaces readline in interactive mode)

export const setRl  = (iface) => { _rl = iface; };
export const getRl  = () => _rl;
export const rlOpen = () => _rl && !_rl.closed;

export const setLl  = (ll) => { _ll = ll; };
export const getLl  = () => _ll;

export function log(msg) {
  if (_ll) {
    _ll.printAbove(msg);
    return;
  }
  if (!rlOpen()) { console.log(msg); return; }
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(msg);
  _rl.prompt(true);
}

export const ok   = (msg) => log(`  ${col('green',  '✔')}  ${msg}`);
export const err  = (msg) => log(`  ${col('red',    '✖')}  ${msg}`);
export const warn = (msg) => log(`  ${col('yellow', '⚠')}  ${msg}`);
export const info = (msg) => log(`  ${col('cyan',   '→')}  ${msg}`);

export function line(tag, text, color) {
  if (!rlOpen()) {
    process.stdout.write(`${col(color, '[' + tag + ']')} ${text}\n`);
    return;
  }
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(`${col(color, '[' + tag + ']')} ${text}\n`);
  _rl.prompt(true);
}

export function banner() {
  console.log('');
  console.log(col('magenta', '    /\\_____/\\ '));
  console.log(col('magenta', '   /  o   o  \\ ') + `   ${col('white', col('bold', 'asyncat'))}  ${col('dim', 'open-source AI workspace')}`);
  console.log(col('magenta', '  ( ==  ^  == )') + `   ${col('dim', '────────────────────────────')}`);
  console.log(col('magenta', '   )         ( ') + `   type ${col('cyan', 'help')} for commands`);
  console.log(col('magenta', '  (           )'));
  console.log(col('magenta', ' ( (  )   (  ) )'));
  console.log(col('magenta', '(__(__)___(__)__)'));
  console.log('');
}

export function spinner(msg) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const id = setInterval(() => {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`  ${col('cyan', frames[i++ % frames.length])}  ${msg}`);
  }, 80);
  return {
    stop(successMsg) {
      clearInterval(id);
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      if (successMsg !== undefined) ok(successMsg);
    },
    fail(failMsg) {
      clearInterval(id);
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      if (failMsg !== undefined) err(failMsg);
    },
  };
}
