'use strict';

var httpProxy = require('http-proxy');

function onProxyReq(proxyReq, req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', true);
}

module.exports = function (target, port) {
  var proxy;

  if(!target) {
    throw new Error("Invalid proxy target!");
  }
  else if(!port) {
    throw new Error("Invalid proxy port!");
  }

  proxy = httpProxy.createProxyServer({
    target: target
  });
  proxy.on('proxyReq', onProxyReq);
  proxy.listen(port);

  return proxy;
};