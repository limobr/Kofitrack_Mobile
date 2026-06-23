const babelTransformer = require('metro-react-native-babel-transformer');

module.exports.transform = function ({ src, filename, options }) {
  // Force Babel to process everything, including node_modules
  return babelTransformer.transform({
    src,
    filename,
    options: {
      ...options,
      babelrc: true,
      // This ensures Babel uses your project's .babelrc / babel.config.js
    },
  });
};