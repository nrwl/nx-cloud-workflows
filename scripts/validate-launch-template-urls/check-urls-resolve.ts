import { ConformanceViolation, createConformanceRule } from '@nx/conformance';
import { workspaceRoot } from '@nx/devkit';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { parse } from 'yaml';

const allowed_ext = ['.yaml', '.yml'];

function relativeToWorkspaceRoot(path: string) {
  return relative(workspaceRoot, path);
}
export default createConformanceRule({
  name: 'validate-launch-template-urls',
  category: 'reliability',
  description: 'Make sure all launch template steps resolve to valid URLs',
  implementation: async () => {
    const launchTemplateDir = join(workspaceRoot, 'launch-templates');

    const templates = getLaunchTemplatesInDir(launchTemplateDir);
    if (templates.length === 0) {
      return {
        severity: 'high',
        details: {
          violations: [
            {
              file: launchTemplateDir,
              message: `No launch templates found in ${relativeToWorkspaceRoot(
                launchTemplateDir,
              )}`,
            },
          ],
        },
      };
    }

    const violations: ConformanceViolation[] = [];

    for (const template of templates) {
      const maybeViolations = await checkTemplateStepsUrl(template);
      if (maybeViolations.length > 0) {
        violations.push(...maybeViolations);
      }
    }

    return { severity: 'high', details: { violations } };
  },
});

/**
 * get yaml based lauch templates from a give directory
 **/
function getLaunchTemplatesInDir(dir: string) {
  if (!existsSync(dir) || !lstatSync(dir).isDirectory()) {
    return [];
  }

  const files = readdirSync(dir);
  const found_files: Array<{ path: string; content: Record<any, any> }> = [];

  for (const file of files) {
    const ext = extname(file);
    if (allowed_ext.includes(ext.toLowerCase())) {
      const path = join(dir, file);
      found_files.push({ path, content: parse(readFileSync(path, 'utf8')) });
    }
  }

  return found_files;
}

/**
 * check step urls resolve to 200 OK
 **/
async function checkTemplateStepsUrl({
  content,
  path,
}: {
  path: string;
  content: Record<any, any>;
}): Promise<ConformanceViolation[]> {
  if (!content?.['launch-templates']) {
    return [
      {
        file: relativeToWorkspaceRoot(path),
        message: 'launch-templates key is missing',
      },
    ];
  }

  const seen_urls = new Set();
  const violation: ConformanceViolation[] = [];

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
          violation.push({
            file: relativeToWorkspaceRoot(path),
            message: `Step "${step['name']}" has invalid url, "${step['uses']}". Expected 200 Ok response, but got ${r.status} ${r.statusText}`,
          });
        }
        seen_urls.add(step['uses']);
      }
    }
  }

  return violation;
}
