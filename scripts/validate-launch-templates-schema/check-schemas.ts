import {
  createConformanceRule,
  NonProjectFilesViolation,
} from '@nx/conformance';
import { extname, join, relative } from 'node:path';
import { workspaceRoot } from '@nx/devkit';
import { existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const allowed_ext = ['.yaml', '.yml'];
export default createConformanceRule({
  name: 'validate-launch-templates-schema',
  category: 'reliability',
  description:
    'Make sure launch template files are structurally correct with Nx Cloud',
  reporter: 'non-project-files-reporter',
  implementation: async (context) => {
    const violations: NonProjectFilesViolation[] = [];

    const launchTemplateDir = join(workspaceRoot, 'launch-templates');

    if (!existsSync(launchTemplateDir)) {
      violations.push({
        file: relative(workspaceRoot, launchTemplateDir),
        message: `No launch templates found in directory`,
      });
    } else {
      const templates = readdirSync(launchTemplateDir);

      for (const template of templates) {
        const relativePath = join('launch-templates', template);
        try {
          // this will throw locally bc needs to be ran in CI
          execSync(`npx nx-cloud validate --workflow-file=./${relativePath}`, {
            stdio: 'inherit',
            encoding: 'utf-8',
            cwd: workspaceRoot,
          });
        } catch (e) {
          console.error(e);
          violations.push({
            file: relativePath,
            message: e.message,
          });
        }
      }
    }

    const workflowStepsDir = join(workspaceRoot, 'workflow-steps');

    if (!existsSync(workflowStepsDir)) {
      violations.push({
        file: relative(workspaceRoot, workflowStepsDir),
        message: `No workflow steps found in directory`,
      });
    } else {
      const steps = readdirSync(workflowStepsDir);

      for (const step of steps) {
        if (!allowed_ext.includes(extname(step))) {
          continue;
        }

        const relativePath = join('workflow-steps', step);
        try {
          // this will throw locally bc needs to be ran in CI
          execSync(
            `npx nx-cloud validate --workflow-file=./${relativePath} --step-file`,
            {
              stdio: 'inherit',
              encoding: 'utf-8',
              cwd: workspaceRoot,
            },
          );
        } catch (e) {
          console.error(e);
          violations.push({
            file: relativePath,
            message: e.message,
          });
        }
      }
    }

    return {
      severity: 'high',
      details: {
        violations,
      },
    };
  },
});
