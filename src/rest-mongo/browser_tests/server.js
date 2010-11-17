
require.paths.unshift(__dirname + '/../../../vendor/nodetk/src');
require.paths.unshift(__dirname + '/../../');


var http = require("http"),
    bserver = require('nodetk/browser/server'),
    rest_server = require('rest-mongo/http_rest/server');

serve_modules_connector = bserver.serve_modules_connector({
  modules: ['assert', 'util'],
  packages: ['nodetk', 'rest-mongo'],
  additional_files: {
    '/tests.html': __dirname + '/tests.html',
    '/tests.js': __dirname + '/tests.js',
    '/demo.html': __dirname + '/demo.html',
    '/demo.js': __dirname + '/demo.js',
    '/jquery.js': __dirname + '/jquery-1.4.2.min.js',
  }
});

var rest_mongo = require('rest-mongo/core');
var mongo_backend = require('rest-mongo/mongo_backend');
var backend = mongo_backend.get_backend({db_name: 'test-rest-mongo'});


var schema = require('rest-mongo/tests/schema').schema;
var RFactory = rest_mongo.getRFactory(schema, backend);
rest_server_connector = rest_server.connector(RFactory, schema);


var server = http.createServer(function(req, res) {
  serve_modules_connector(req, res, function() {
    rest_server_connector(req, res, function(){});
  });
});


server.listen(8549, function() {
  console.log('Server listning...' +
              '\nGo on http://localhost:8549/tests.html to run browsers tests.');
});

