/**
 * Conventional Commits — enforced on the monorepo (Handoff §7).
 * type(scope): subject
 * scopes map loosely to workspace packages: web, api, ai-svc, md-svc, core, db, ui, brokers, infra, ci, docs.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      ['web', 'api', 'ai-svc', 'md-svc', 'core', 'db', 'ui', 'brokers', 'infra', 'ci', 'docs', 'deps', 'release'],
    ],
    'body-max-line-length': [0, 'always'],
  },
};
