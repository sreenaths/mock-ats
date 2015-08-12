'use strict';

var httpProxy = require('http-proxy'),
    allowedHeaders = [
      'authorization',
      'content-length',
      'content-type',
      'if-match',
      'if-none-match',
      'origin',
      'x-requested-with'
    ];

function onProxyReq(proxyReq, req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('access-control-allow-headers', allowedHeaders.join(','));
  res.setHeader('access-control-expose-headers', 'content-type, content-length, etag');
  res.setHeader('access-control-allow-methods', 'GET, PUT, POST, DELETE');
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