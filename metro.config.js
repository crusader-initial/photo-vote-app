const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

const cssInteropPkgRoot = fs.realpathSync(
  path.dirname(require.resolve("react-native-css-interop/package.json")),
);
const cssInteropCacheDir = path.join(cssInteropPkgRoot, ".cache");

// Nativewind may hoist its own copy; include that path too.
let nativewindCssInteropRoot = null;
try {
  nativewindCssInteropRoot = fs.realpathSync(
    path.dirname(require.resolve("nativewind/node_modules/react-native-css-interop/package.json")),
  );
} catch {
  nativewindCssInteropRoot = null;
}
const nativewindCssInteropCacheDir = nativewindCssInteropRoot
  ? path.join(nativewindCssInteropRoot, ".cache")
  : null;

fs.mkdirSync(cssInteropCacheDir, { recursive: true });
if (nativewindCssInteropCacheDir) {
  fs.mkdirSync(nativewindCssInteropCacheDir, { recursive: true });
}

config.watchFolders = [
  ...(config.watchFolders || []),
  cssInteropPkgRoot,
  cssInteropCacheDir,
  ...(nativewindCssInteropRoot ? [nativewindCssInteropRoot] : []),
  ...(nativewindCssInteropCacheDir ? [nativewindCssInteropCacheDir] : []),
];

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
