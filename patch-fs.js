const fs = require('fs');

// Patch para Node 24 en Windows donde readlink devuelve EISDIR en lugar de EINVAL para archivos regulares
const origReadlinkSync = fs.readlinkSync;
fs.readlinkSync = function(path, options) {
  try {
    return origReadlinkSync.call(fs, path, options);
  } catch (err) {
    if (err && (err.code === 'EISDIR' || err.code === 'UNKNOWN')) {
      err.code = 'EINVAL';
    }
    throw err;
  }
};

const origReadlink = fs.readlink;
fs.readlink = function(path, options, callback) {
  let cb = callback;
  let opts = options;
  if (typeof opts === 'function') {
    cb = opts;
    opts = undefined;
  }
  return origReadlink.call(fs, path, opts, (err, linkString) => {
    if (err && (err.code === 'EISDIR' || err.code === 'UNKNOWN')) {
      err.code = 'EINVAL';
    }
    if (cb) cb(err, linkString);
  });
};

if (fs.promises && fs.promises.readlink) {
  const origPromisesReadlink = fs.promises.readlink;
  fs.promises.readlink = async function(path, options) {
    try {
      return await origPromisesReadlink.call(fs.promises, path, options);
    } catch (err) {
      if (err && (err.code === 'EISDIR' || err.code === 'UNKNOWN')) {
        err.code = 'EINVAL';
      }
      throw err;
    }
  };
}
