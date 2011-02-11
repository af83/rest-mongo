// Here we test the authentication function is called as needed.

require.paths.unshift(__dirname + '/../../../');

var http = require("http"),
    querystring = require("querystring"),

    CLB = require("nodetk/orchestration/callbacks"),
    assert = require("nodetk/testing/custom_assert"),

    rest_server = require('rest-mongo/http_rest/server'),
    rest_mongo = require('rest-mongo/core'),
    mongo_backend = require('rest-mongo/mongo_backend'),
    schema = require('rest-mongo/tests/schema').schema;



var server;
var client;
var backend = mongo_backend.get_backend({db_name: 'test-rest-mongo'});
var RFactory = rest_mongo.getRFactory(schema, backend);


var auth_check = function(req, res, next, info) {
  if(info.pathname == '/animals') {
    if(info.method == 'GET') res.writeHead(401, {});
    else res.writeHead(403, {});
    res.end();
  }
  else {
    next();
  }
}


exports.module_init = function(callback) {
  // init some stuff
  var connector = rest_server.connector(RFactory, schema, {
    auth_check: auth_check
  });
  var next = function(req, res) {
    res.writeHead(404, {});
    res.end('next() called.');
  };
  server = http.createServer(function(req, resp) {
    connector(req, resp, function() {
      next(req, resp);
    });
  });
  server.listen(8555, function() {
    client = http.createClient(8555, '127.0.0.1');
    client.addListener('error', function(err) {
      console.log(err.message, err.stack);
    });
    callback();
  })
};

exports.module_close = function(callback) {
  server.close();
  callback();
};


exports.tests = [

['AUTH, GET authorized', 1, function() {
  var request = client.request('GET', '/people', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 200);
  });
  request.end();
}],

['AUTH, POST authorized', 1, function() {
  var request = client.request('POST', '/people', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 201);
  });
  request.end('{}');
}],

['AUTH, GET 401', 1, function() {
  var request = client.request('GET', '/animals', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 401);
  });
  request.end();
}],

['AUTH, POST 403', 1, function() {
  var request = client.request('POST', '/animals', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 403);
  });
  request.end('{}');
}],

];

