"use strict"

/*
  A mock Timeline Server
*/

var http = require('http'),
  url = require('url'),
  path = require('path'),
  fs = require('fs'),
  qs = require('querystring'),

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

http.createServer(function(request, response) {
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

