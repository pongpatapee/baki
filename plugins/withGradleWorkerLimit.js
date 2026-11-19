/**
 * Caps concurrent Gradle workers for Android builds.
 *
 * EAS's free-tier Android workers (4 vCPU / 16 GB) run Gradle with parallel=true; with several
 * native C++ modules (Skia, Reanimated, Worklets) each CMake task spawns its own pool of clang
 * processes, and together they exhaust RAM and the OOM killer takes out the Gradle daemon
 * ("Gradle build daemon disappeared unexpectedly"). Two workers keeps peak memory in check.
 */
const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'org.gradle.workers.max';

module.exports = function withGradleWorkerLimit(config, { maxWorkers = 2 } = {}) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === KEY));
    cfg.modResults.push({ type: 'property', key: KEY, value: String(maxWorkers) });
    return cfg;
  });
};
