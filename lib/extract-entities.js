'use strict';

require('more-js');

var fs = require('fs'),
    os = require('os'),
    path = require('path'),

    unzip = require('unzip2'),
    rimraf = require('rimraf'),
    mkdirp = require('mkdirp'),
    RSVP = require('rsvp'),
    mkdirp = require('mkdirp');

var MAX_ENTITY_SEARCH_DEPTH = 5;

function getDirFiles (dirPath) {
  return new RSVP.Promise(function (resolve, reject) {
    fs.readdir(dirPath, function (err, files){
      if(err) reject(err);
      else resolve(files.map(function (file) {
        return path.join(dirPath, file);
      }));
    });
  });
}

function getZippedFiles (zipPath) {
  var unzipDir = path.join(os.tmpdir(), 'timeline-entities', path.basename(zipPath, '.zip'));

  return new RSVP.Promise(function (resolve, reject) {
    if(fs.existsSync(unzipDir)) {
      rimraf(unzipDir, function (err) {
        if(err) reject(err);
        else {
          fs.createReadStream(zipPath).
            pipe(unzip.Extract({ path: unzipDir })).
            on('error', reject).
            // TODO: Check for error event and call reject
            on('close', function () {
              getDirFiles(unzipDir).then(resolve, reject);
            });
        }
      });
    }
  });
}

// Recursively parse through the given object and collects all available entity blobs
function getEntities(object, depth) {
  var entities = [];

  // To escape from rabbit holes
  depth = depth == undefined ? 0 : depth++;

  if(depth < MAX_ENTITY_SEARCH_DEPTH) {
    if(object.hasOwnProperty('entity') && object.hasOwnProperty('entitytype')) {
      entities.push(object);
    }
    else if(Array.isArray(object)) {
      object.forEach(function (item) {
        entities.append(getEntities(item, depth));
      });
    }
    else if(typeof object == "object") {
      Object.keys(object).forEach(function (key) {
        entities.append(getEntities(object[key], depth));
      });
    }
  }

  return entities;
}

function mergeObjects(targetObj, sourceObj) {
  Object.keys(sourceObj).forEach(function (key) {
    if(Array.isArray(sourceObj[key])) {
      if(Array.isArray(targetObj[key])) targetObj[key].append(sourceObj[key]);
      else if(targetObj[key] == undefined) targetObj[key] = sourceObj[key];
      else throw new Error("Merge Failed: Cannot merge Array & Object");
    }
    else if(sourceObj[key]) {
      if(targetObj[key]) {
        mergeObjects(targetObj[key], sourceObj[key]);
      }
      else {
        targetObj[key] = sourceObj[key];
      }
    }
  });
  return targetObj;
}

function addEntities(data, entities) {
  entities.forEach(function (entity) {
    var entityTypeHash = data[entity.entitytype];

    if(!entityTypeHash) data[entity.entitytype] = entityTypeHash = {};

    if(!entityTypeHash[entity.entity]) entityTypeHash[entity.entity] = entity;
    else mergeObjects(entityTypeHash[entity.entity], entity);
  });

  return data;
}

function parseFile(filePath, targetData) {
  return new RSVP.Promise(function (resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf8' }, function (err, fileContent) {
      var multiLineJSON = [],
          error = null;

      try {
        resolve(addEntities(targetData, getEntities(JSON.parse(fileContent))));
      }
      catch(err) {
        fileContent.split('\n').forEach(function (line) {
          try {
            multiLineJSON.push(line);
            addEntities(targetData, getEntities(JSON.parse(multiLineJSON.join(''))));
            multiLineJSON = [],
            error = null;
          }
          catch(err) {
            error = err;
          }
        });

        if(error){
          error.message += " File path: " + filePath;
          reject(error);
        }
        else resolve(targetData);
      }
    });
  });
}

function extractFiles(filePaths, targetData) {
  //filePaths = filePaths.uniq(), TODO: Find nodejs alternative
  targetData = targetData || {};

  return new RSVP.all(filePaths.map(function (filePath) {
    var stat = fs.statSync(filePath),
        // Check if a throw here gets catched
        files;

    if(stat.isDirectory()) {
      files = getDirFiles(filePath);
    }
    else if(filePath.substr(-4) == '.zip') { // TODO: Change to file meta detection
      files = getZippedFiles(filePath);
    }
    else {
      return parseFile(filePath, targetData);
    }

    return files.then(function (files) {
      return extractFiles(files, targetData);
    });
  })).then(function () {
    // As single targetData object is passed around we need not merge anything here.
    return targetData;
  });
}

function saveData(dataDir, data) {
  var entityHash,
      dirPath,
      filePath,
      filesCreated = [];

  for(var entityType in data) {
    dirPath = path.join(dataDir, entityType);
    mkdirp.sync(dirPath);
    entityHash = data[entityType];
    for(var entityId in entityHash) {
      filePath = path.join(dirPath, entityId);
      filesCreated.push(filePath);
      fs.writeFile(
        filePath,
        JSON.stringify(entityHash[entityId]),
        {flags: 'r+'}
      );
    }
  }

  return filesCreated;
}

module.exports = function (filePaths, dataDir) {
  if(!Array.isArray(filePaths)) filePaths  = [filePaths];

  return new RSVP.Promise(function (resolve, reject) {
    extractFiles(filePaths).then(resolve, reject);
  }).then(function (data) {
    var filesCreated = saveData(dataDir, data);
    return {
      data: data,
      filesCreated: filesCreated
    };
  });
};
