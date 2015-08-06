"use strict"

/*
  A simple proxy implementation in Nodejs
  - Quick-fix for CORS
  - By default the proxy starts on port 8088

  Start proxy:
  node proxy.js target_url [listening_port]

  Start in background:
  forever proxy.js target_url [listening_port]
*/

var httpProxy = require('http-proxy'),

    target = process.argv[2],
    port = parseInt(process.argv[3], 10) || 8188,

    proxy;

function onProxyReq(proxyReq, req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '');
  res.setHeader('Access-Control-Allow-Credentials', true);
}

if(target) {
  proxy = httpProxy.createProxyServer({
    target: target
  });
  proxy.on('proxyReq', onProxyReq);
  proxy.listen(port);

  console.log("Proxy started on port " + port + " targeting " + target);
}
else {
  console.log("Enter a target URL as command line argument. Eg: http://foo.bar:8188");
}
