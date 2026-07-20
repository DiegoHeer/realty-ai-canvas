// Dynamic Expo config. The static base lives in app.json; this file computes the
// version fields fresh on every build/export so they always reflect the current code.
//
//   version         "0.1.<latest-merged-PR>"  — the human-readable number you read
//                                                before a deploy (About screen, user-agent).
//   android.versionCode / ios.buildNumber      — strictly monotonic store build counter
//                                                (git commit count), required to be
//                                                ever-increasing for store uploads.
const { execSync } = require('node:child_process');
const appJson = require('./app.json');

function tryExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// Latest merged PR number reachable from HEAD.
// Priority: explicit env (CI / deploy scripts) → highest #N in recent git subjects → 0.
// Uses the max (not the newest commit) because merge history is non-linear, so the
// topmost merge commit isn't necessarily the highest PR number.
function latestPrNumber() {
  const fromEnv = process.env.APP_PR_NUMBER;
  if (fromEnv && /^\d+$/.test(fromEnv)) return Number(fromEnv);

  const subjects = tryExec('git log --max-count=300 --format=%s');
  const numbers = [...subjects.matchAll(/(?:Merge pull request #|\(#)(\d+)/g)].map((m) =>
    Number(m[1]),
  );
  return numbers.length ? Math.max(...numbers) : 0;
}

// Strictly monotonic build counter (Android versionCode / iOS buildNumber).
// Priority: explicit env → git commit count → 1.
function buildNumber() {
  const fromEnv = process.env.APP_BUILD_NUMBER;
  if (fromEnv && /^\d+$/.test(fromEnv)) return Number(fromEnv);

  const count = tryExec('git rev-list --count HEAD');
  return /^\d+$/.test(count) ? Number(count) : 1;
}

module.exports = () => {
  const build = buildNumber();
  const { expo } = appJson;

  return {
    ...expo,
    version: `0.1.${latestPrNumber()}`,
    android: { ...expo.android, versionCode: build },
    ios: { ...expo.ios, buildNumber: String(build) },
  };
};
