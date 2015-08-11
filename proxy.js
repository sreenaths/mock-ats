"use strict"

/*
  proxy.js
  A simple proxy implementation in Nodejs
  - Quick-fix for CORS
  - By default the proxy starts on port 8088

  Start proxy:
  node proxy.js target_url [listening_port]

  Start in background:
  forever proxy.js target_url [listening_port]
*/

var args = process.argv.splice(2),
    target = args[0],
    port = parseInt(args[1], 10) || 8188,

    proxy = require('./lib/proxy');

if(target) {
  proxy(target, port);
  console.log("Proxy started on port " + port + " targeting " + target);
}
else {
  console.log("Enter a target URL as command line argument. Eg: http://foo.bar:8188");
}
