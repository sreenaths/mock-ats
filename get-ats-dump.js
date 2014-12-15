"use strict"

var request = require("request"),
    fs = require("fs"),
    mkdirp = require("mkdirp"),
    progress = require('request-progress');

var namespacesToQuery = [
      "ws/v1/timeline/TEZ_DAG_ID",
      "ws/v1/timeline/TEZ_VERTEX_ID",
      "ws/v1/timeline/TEZ_TASK_ID",
      "ws/v1/timeline/TEZ_TASK_ATTEMPT_ID",
      "ws/v1/timeline/TEZ_APPLICATION",
      "ws/v1/applicationhistory/apps"
    ],
    formatters = {},
    downloadThreshold = 1024 * 1024 * parseInt(process.argv[3] || 5); // Default threshold 5 MB

formatters["ws/v1/applicationhistory/apps"] = function (filePath, callback) {
  fs.readFile(filePath, function(err, data) {
    if(err) callback(err, data);
    else {
      data = JSON.parse(data);

      data.entities = [];
      data.app.forEach(function (app) {
        app.entity = app.appId;
        data.entities.push(app);
      });

      delete data.app;

      fs.writeFile(filePath, JSON.stringify(data), {flag: 'w'}, callback);
    }
  });
};

function onError(error) {
  console.error(error);
  process.exit(1);
}

function fetchData(fromURL, toPath, onComplete) {
  progress(request(fromURL), {
    throttle: 100,
    delay: 100
  })
  .on('progress', function (state) {
    if(state.received > downloadThreshold) onError(toPath + 'exceeds download limit (5 MB)!');
    else process.stdout.write('.');
  })
  .pipe(fs.createWriteStream(toPath, {flag: 'r+'}))
  .on('error', onError)
  .on('close', onComplete);
}

function getDump(timelineBaseURL) {
  var successfulDumpCount = 0;

  function exitCheck() {
    if(++successfulDumpCount >= namespacesToQuery.length) {
      console.log('Downloaded all dump files.');
      process.exit(0);
    }
  }

  namespacesToQuery.forEach(function (namespace) {
    var path = 'data/' + namespace;

    mkdirp(path, function (err) {
      var toPath = path + '/index.json';

      if (err) onError(err);
      else fetchData(timelineBaseURL + '/' + namespace, toPath, function () {
        console.log('\nDumped : ' + path +'\n');

        if(formatters[namespace]) formatters[namespace](toPath, exitCheck);
        else exitCheck();
      });
    });
  });
}

if (process.argv.length > 2) {
  process.stdin.resume();

  console.log('\nDefault size threshold of a dump file is 5MB. You can customize it by passing the size in MBs as second argument.');
  console.log('Note: Mock ats is designed to work with small data sets!');
  console.log('\nPress any key to start downloading.');

  process.stdin.once("data", function (data) {
    getDump(process.argv[2]);
  });
} else onError("Timeline server url must be passed as first command line argument.");

