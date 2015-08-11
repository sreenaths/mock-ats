"use strict"

/*
  Node script to extract entity JSON
*/

var args = process.argv.splice(2),
    dataDir = args.pop(),
    files = args,

    extractor = require('./lib/extract-entities');

function isDirectory(path) {
  try {
    return fs.stat(path).isDirectory();
  }
  catch(e) {
    return false;
  }
}

if(!files.length) {
  console.log("Please enter a valid list of source files/directories.");
}
else if(isDirectory(dataDir)) {
  console.log("Please enter a valid destination directory as last argument");
}
else {
  extractor(files, dataDir).then(function (data) {
    console.log("Files were successfully extracted.", "\n\nFiles created:\n", data.filesCreated.join('\n'));
  }).catch(function (err) {
    console.log("Extraction Failed:\n", err.stack);
  });
}
