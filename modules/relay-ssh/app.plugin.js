// BouncyCastle's bcprov and bcpkix jars both ship this OSGi manifest, which makes Android packaging fail on duplicates.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// relay-ssh: bouncycastle packaging';

module.exports = function withRelaySsh(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `
${MARKER}
android {
    packaging {
        resources {
            excludes += ['META-INF/versions/9/OSGI-INF/MANIFEST.MF']
        }
    }
}
`;
    }
    return cfg;
  });
};
