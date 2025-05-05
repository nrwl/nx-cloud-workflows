// @ts-check
const { parse } = require('yaml');
const { readFileSync, readdirSync, lstatSync, existsSync } = require('node:fs');
const { join, extname } = require('node:path');
const { workspaceRoot } = require('@nx/devkit');

const allowed_ext = ['.yaml', '.yml'];
const launchTemplateDir = join(workspaceRoot, 'launch-templates');

async function main() {
  console.log(`🔎  Checking launch templates in ${launchTemplateDir}`);

  const launchTemplates = getLaunchTemplatesInDir(launchTemplateDir);

  if (launchTemplates.length === 0) {
    throw new Error(`No launch templates found in ${launchTemplateDir}`);
  }

  console.log(`🔎  Found ${launchTemplates.length} launch template files`);

  let valid = true;
  for (const template of launchTemplates) {
    console.log(`🔎  Checking template: ${template.path}`);
    const url_check = await checkTemplateStepsUrl(template);

    if (!url_check.valid) {
      console.error('❌  ', url_check.message, ' in ', url_check.path);
      valid = false;
    }
  }

  return valid;
}

main().then((v) => {
  if (v) {
    console.log('✅  All step urls are valid');
  } else {
    console.error('❌  Some step urls are invalid. See errors above.');
    process.exit(1);
  }
});

/**
 * get yaml based lauch templates from a give directory
 *
 * @param {string} dir
 **/
function getLaunchTemplatesInDir(dir) {
  if (!existsSync(dir) || !lstatSync(dir).isDirectory()) {
    return [];
  }

  const files = readdirSync(dir);
  const found_files = [];

  for (const file of files) {
    const ext = extname(file);
    if (allowed_ext.includes(ext.toLowerCase())) {
      const path = join(dir, file);
      found_files.push({
        path,
        content: parse(readFileSync(path, 'utf8'), 'utf8'),
      });
    }
  }

  return found_files;
}

/**
 * check step urls
 * @param {{path: string, content: string}} template
 * @returns {{valid: boolean, message: string, path: string, content: string}}
 **/
async function checkTemplateStepsUrl({ content, path }) {
  if (!content?.['launch-templates']) {
    return {
      valid: false,
      message: 'launch-templates key is missing',
      path,
      content,
    };
  }

  const seen_urls = new Set();

  const ret = {
    valid: true,
    message: '',
    path,
    content,
  };
  for (const template of Object.values(content['launch-templates'])) {
    for (const step of template['init-steps']) {
      // no need to report on the same URL or non `uses` step
      if (seen_urls.has(step['uses']) || !step['uses']) {
        continue;
      }

      if (step['uses'].startsWith('nrwl/nx-cloud-workflows')) {
        const r = await fetch(
          `https://raw.githubusercontent.com/${step['uses']}`,
        );
        if (r.status !== 200) {
          ret.valid = false;
          ret.message += `Step "${step['name']}" has invalid url, ${step['uses']}. Expected 200 Ok response, but got ${r.status} ${r.statusText}\n`;
        }
        seen_urls.add(step['uses']);
      }
    }
  }

  return ret;
}
