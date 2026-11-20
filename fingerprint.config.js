/**
 * Controls the `fingerprint` runtimeVersion (app.json). An OTA update (`npm run update`) is only
 * delivered to installed builds whose fingerprint matches, so anything hashed here that does not
 * actually change native code needlessly cuts installed builds off from updates.
 *
 * - PackageJsonScriptsAll: npm scripts never change the native app.
 * - GitIgnore: only matters for bare projects; android/ and ios/ are generated here (CNG).
 *
 * @type {import('expo/fingerprint').Config}
 */
const config = {
  sourceSkips: ['PackageJsonScriptsAll', 'GitIgnore'],
};

module.exports = config;
