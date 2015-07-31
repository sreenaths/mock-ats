"use strict"

/*
  A mock Timeline Server
*/

var http = require('http'),
  url = require('url'),
  path = require('path'),
  fs = require('fs'),
  qs = require('querystring'),
  formidable = require('formidable'),
  unzip = require('unzip2'),
  mkdirp = require('mkdirp'),

  cache = {},
  uiDomain = process.argv[2] || 'http://localhost:9001',
  port = parseInt(process.argv[3], 10) || 8188,
  
  ERROR_RESPONSE = '{"exception":"NotFoundException","message":"java.lang.Exception: Timeline entity { type: TEZ_DAG_ID } is not found","javaClassName":"org.apache.hadoop.yarn.webapp.NotFoundException"}',
  ENTITIES_SNIPPET = '{"entities"',
  FILE_NOT_FOUND_ERR = "File/Data Not Found!",
  NOT_CACHED = "Data Not Found/Caching Error!";

//Accepts JSON as data
function setCacheData(requestPath, data) {
  var parsedData = JSON.parse(data);

  if(parsedData.entities) {
    parsedData.entities.sort(function (a, b) { // Sorts data in descending order of startTime
      if(!a.otherinfo || !b.otherinfo) return 0;
      return b.otherinfo.startTime - a.otherinfo.startTime;
    });
    parsedData.entities.forEach(function (entity) { // Hash all entities for easy access, just a ref no much extra memory use.
      parsedData[entity.entity] = entity;
    });
  }

  cache[requestPath] = parsedData;
}

function getFilters(query) {
  var filters = [];

  if(query.primaryFilter) filters = filters.concat(query.primaryFilter.split(','));
  if(query.secondaryFilter) filters = filters.concat(query.secondaryFilter.split(','));

  if(!filters.length) return null;

  return filters.reduce(function (obj, val) {
    var delimIndex = val.indexOf(":");
    if(delimIndex > 0) obj[val.substr(0, delimIndex)] = val.substr(delimIndex + 1);
    return obj;
  }, {});
}

function filterCheck(entity, filters) {
  var filterValues;
  for(var filterName in filters){
    filterValues = entity.primaryfilters && entity.primaryfilters[filterName];
    if(!filterValues) return false;
    if(filterValues.indexOf(filters[filterName]) == -1) return false;
  }
  return true;
}

//Returns JSON/null
function getCacheData(requestPath, query) {
  var data = cache[requestPath],
      returnData,
      startIndex = 0,
      filters;

  if(!data || !data.entities) return null; // No data || No entities array, hence cannot return limit number of entities

  if(query.id) return JSON.stringify(data[query.id]) || null;

  if(data[query.fromId]) {
    startIndex = data.entities.indexOf(data[query.fromId]);
    if(startIndex == -1) return null; // Entity not found in the array
  }
  // else, No entity id/from id specified, so startIndex = 0

  filters = getFilters(query);
  if(filters) { // Filter
    returnData = [],
    data = data.entities;

    for(var i = startIndex, length = data.length; i < length && returnData.length < query.limit; i++) {
      if(filterCheck(data[i], filters)) returnData.push(data[i]);
    }
  }
  else {
    returnData = data.entities.slice(startIndex, startIndex + query.limit);
  }

  returnData = {
    entities: returnData
  };

  return JSON.stringify(returnData);
}

function readFile(filePath, callback) {
  fs.exists(filePath, function(exists) {
    if(exists) {
      if (fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, '/index.json');
      fs.readFile(filePath, callback);
    }
    else callback(FILE_NOT_FOUND_ERR);
  });
}

function readData(requestPath, query, callback) {
  var data = getCacheData(requestPath, query);

  if(data) callback(null, data);
  else readFile(requestPath, function (err, data) {
    if(!err) {
      setCacheData(requestPath, data);

      data = getCacheData(requestPath, query);
      if(data) callback(null, data);
      else callback(NOT_CACHED);
    }
    else if(!query.fromId && err == FILE_NOT_FOUND_ERR) { // Go one level deeper, to fetch entities from inside the index files
      query.id = path.basename(requestPath); // Use base name as the entity id
      readData(path.dirname(requestPath), query, callback);
    }
    else callback(err, data);
  });
}

function dagUpload(request, response) {
  response.writeHead(200, {'Content-Type': 'text/html'});
  response.end("<style>input{font-size:1.5em; padding: 1em;}</style>\
      <form action='/uploader' method='post' enctype='multipart/form-data' style='text-align:center;'>\
        </br><h1>Choose DAG zip file(s) to upload</h1>\
        <input type='file' name='upload' multiple='multiple' accept='.zip'>\
        <input type='submit' value='Upload'>\
      </form>");
}

function extractData(dest, src) {
  if(src.application) dest.applications.push(src.application);
  if(src.dag) dest.dags.push(src.dag);

  if(src.vertices) dest.vertices = dest.vertices.concat(src.vertices);
  if(src.tasks) dest.tasks = dest.tasks.concat(src.tasks);
  if(src.task_attempts) dest.task_attempts = dest.task_attempts.concat(src.task_attempts);
}

function extractFiles(zipFiles, callback) {
  var data = {
    applications: [],
    dags: [],
    vertices: [],
    tasks: [],
    task_attempts: []
  },
  completeCount = 0;

  if(!zipFiles.upload) throw new Error();
  if(!Array.isArray(zipFiles.upload)) zipFiles.upload = [zipFiles.upload];

  zipFiles.upload.forEach(function (file){
    var unzipDir = file.path + "_dir/";

    fs.createReadStream(file.path).
    pipe(unzip.Extract({ path: unzipDir }).
      on('close', function() {
        fs.readdir(unzipDir, function(err, files){
          if (err) throw err;
          files.forEach(function(file){
              var json = JSON.parse(fs.readFileSync(unzipDir + file, 'utf8'));
              extractData(data, json);
          });

          completeCount++;

          if(completeCount == zipFiles.upload.length) {
            callback(data);
          }
        });
      })
    );
  });
}

function appendJSONEntities(path, data) {
  var json = {entities: []},
      file = path + '/index.json';

  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  catch(e){}

  json.entities = json.entities.concat(data);

  mkdirp(path, function (err) {
    fs.writeFile(file, JSON.stringify(json), {flags: 'r+'});
  });
}

function saveData(data) {
  appendJSONEntities('data/ws/v1/timeline/TEZ_DAG_ID', data.dags);
  appendJSONEntities('data/ws/v1/timeline/TEZ_APPLICATION', data.applications);

  appendJSONEntities('data/ws/v1/timeline/TEZ_VERTEX_ID', data.vertices);
  appendJSONEntities('data/ws/v1/timeline/TEZ_TASK_ID', data.tasks);
  appendJSONEntities('data/ws/v1/timeline/TEZ_TASK_ATTEMPT_ID', data.task_attempts);
}

function sendResponse(response, statusMsg) {
  response.writeHead(200, {'content-type': 'text/html'});
  response.write("<body style='text-align:center'></br>\
      <h1>Dag(s) " + statusMsg + "</h1>\
      <a href='dagupload'><h4>Back to DAG upload page</h4></a>\
    </body>");
  response.end();
}

function uploader(request, response) {
  var form = new formidable.IncomingForm();

  form.multiples = true;

  form.parse(request, function(err, fields, files) {
    if(err) sendResponse(response, "upload failed!");

    try {
      extractFiles(files, function (data) {
        try {
          saveData(data);
          cache = {};
          sendResponse(response, "uploaded successfully.");
        }
        catch(e) {
          sendResponse(response, "save failed!");
        }
      });
     }
     catch(e) {
       sendResponse(response, "extraction failed!");
     }
  });
}

function webService(request, response) {
  var parsedUrl = url.parse(request.url),
      requestPath = path.join(process.cwd(), 'data/', parsedUrl.pathname),
      query = qs.parse(parsedUrl.query);

  query.limit = parseInt(query.limit) || 100;

  readData(requestPath, query, function (err, data) {
    var status, log;

    if(err) status = 404, data = ERROR_RESPONSE, log = "Err:" + err;
    else status = 200, log = "Success!";

    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Credentials': true,
      'Access-Control-Allow-Headers': 'X-Requested-With,Content-Type,Accept,Origin',
      'Access-Control-Allow-Methods': 'GET,POST,HEAD',
      'Access-Control-Allow-Origin': request.headers.origin,
      'Access-Control-Max-Age': 1800,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Transfer-Encoding': 'chunked'
    });

    response.write(data);
    console.log("Rquested for " + requestPath + " : " + log);
    response.end();
  });
}

http.createServer(function(request, response) {
  var pathname = url.parse(request.url, true).pathname;

  switch (true) {
    case /\/dagupload/.test(pathname):
      dagUpload(request, response);
      break;

    case /\/uploader/.test(pathname):
      uploader(request, response);
      break;

    default:
      webService(request, response);
  }
}).listen(port, function(err){
  if(err) {
    console.log("Unable to listen : ", err);
  }
  else {
    console.log(
        "Timeline Server running at http://localhost:" +
        port +
        "/ expecting requests from " +
        uiDomain +
        "\nUse CTRL+C to shutdown");
  }
});

