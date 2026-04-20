import fs from 'fs';
import path from 'path';
import { log, info, col, ok, err, warn } from '../lib/colors.js';

function getSkillsDir() {
  const cwd = process.cwd();
  const fromCwd = path.join(cwd, 'cli', 'skills');
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromParent = path.join(cwd, '..', 'cli', 'skills');
  if (fs.existsSync(fromParent)) return fromParent;
  return path.join(__dirname, '..', 'cli', 'skills');
}

const SKILLS_DIR = getSkillsDir();

function loadSkill(name) {
  const skillPath = path.join(SKILLS_DIR, name + '.md');
  if (!fs.existsSync(skillPath)) return null;
  
  const content = fs.readFileSync(skillPath, 'utf8');
  const lines = content.split('\n');
  
  // Parse frontmatter
  const frontmatter = {};
  let inFrontmatter = false;
  let bodyStart = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
      } else {
        bodyStart = i + 1;
        break;
      }
      continue;
    }
    if (inFrontmatter && line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      frontmatter[key.trim()] = valueParts.join(':').trim();
    }
  }
  
  // Extract body
  const body = lines.slice(bodyStart).join('\n').trim();
  
  return { frontmatter, body };
}

function listSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  
  const files = fs.readdirSync(SKILLS_DIR);
  const skills = files
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .map(f => {
      const name = f.replace('.md', '');
      const skill = loadSkill(name);
      return {
        name,
        description: skill?.frontmatter?.description || 'No description',
        tags: skill?.frontmatter?.tags || '',
        brain_region: skill?.frontmatter?.brain_region || 'unknown',
      };
    });
  
  return skills;
}

export function run(args = []) {
  const sub = args[0];
  
  if (!sub || sub === 'list') {
    log('');
    log(col('bold', '  ╭───────────────────────────────────╮'));
    log(col('bold', '  │     Asyncat Skills (Cerebellum)     │'));
    log(col('bold', '  ╰───────────────────────────────────╯'));
    log('');
    
    const skills = listSkills();
    
    // Group by brain region
    const byRegion = {};
    for (const skill of skills) {
      const region = skill.brain_region || 'unknown';
      if (!byRegion[region]) byRegion[region] = [];
      byRegion[region].push(skill);
    }
    
    for (const [region, regionSkills] of Object.entries(byRegion)) {
      log(col('bold', `  ${region.toUpperCase()}`));
      for (const s of regionSkills) {
        log(`    ${col('cyan', s.name.padEnd(18))} ${s.description.slice(0, 40)}`);
      }
      log('');
    }
    
    if (skills.length === 0) {
      warn('No skills found. Skills are muscle memory — they help the agent act automatically.');
    }
    
    log('  ' + col('dim', 'Usage:'));
    log('    ' + col('gray', 'asyncat skills list'));
    log('    ' + col('gray', 'asyncat skills show <name>'));
    log('');
    return;
  }
  
  if (sub === 'show' || sub === 'view') {
    const skillName = args[1];
    if (!skillName) {
      err('Usage: asyncat skills show <name>'); return;
    }
    
    const skill = loadSkill(skillName);
    if (!skill) {
      err(`Skill not found: ${skillName}`);
      log('  Run ' + col('cyan', 'asyncat skills list') + ' to see all skills.');
      return;
    }
    
    log('');
    log(col('bold', `  Skill: ${skillName}`));
    log('');
    log('  ' + col('dim', 'Description:'));
    log(`    ${skill.frontmatter.description || '(no description)'}`);
    log('');
    log('  ' + col('dim', 'Brain Region:'));
    log(`    ${skill.frontmatter.brain_region || 'unknown'}`);
    log('');
    log('  ' + col('dim', 'Tags:'));
    log(`    ${skill.frontmatter.tags || 'none'}`);
    log('');
    log('  ' + col('dim', 'Body:'));
    log('  ' + '-'.repeat(40));
    log(skill.body.slice(0, 500) + (skill.body.length > 500 ? '...' : ''));
    log('');
    return;
  }
  
  err(`Unknown subcommand: ${sub}`);
  log('  Run ' + col('cyan', 'asyncat skills list') + ' to see available commands.');
}

export { loadSkill, listSkills };