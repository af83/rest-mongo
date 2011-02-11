// Here we test the authentication function is called as needed.

require.paths.unshift(__dirname + '/../../../');

var events = require('events'),
    http = require("http"),

    assert = require("nodetk/testing/custom_assert"),

    rest_server = require('rest-mongo/http_rest/server'),
    rest_mongo = require('rest-mongo/core'),
    mongo_backend = require('rest-mongo/mongo_backend'),
    schema = require('rest-mongo/tests/schema').schema;



var server;
var client;
var backend = mongo_backend.get_backend({db_name: 'test-rest-mongo'});
var RFactory = rest_mongo.getRFactory(schema, backend);

// Create an emitter which will assert.ok(false) if action not expected
// or call the callback set in emitter_actions (only once).
var emitter = new events.EventEmitter();
var emitter_actions = {};
[ 'CREATE:Person'
, 'REMOVE:Person'
, 'UPDATE:Person'
, 'DELETE:Person'
].forEach(function(action) {
  emitter.on(action, function(){
    var callback = emitter_actions[action];
    if(!callback) assert.ok(false, 'Event '+ action + ' not expexted.');
    delete emitter_actions[action];
    callback.apply(this, arguments);
  });
});

exports.module_init = function(callback) {
  // init some stuff
  var connector = rest_server.connector(RFactory, schema, {
    eventEmitter: emitter
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

exports.setup = function(callback) {
  var R = RFactory();
  R.Person.remove({}, callback);
};


exports.tests = [

['CREATE', 2, function() {
  emitter_actions['CREATE:Person'] = function(obj) {
    assert.equal(obj.firstname, 'Pierre');
    assert.ok(obj.id);
  };
  var request = client.request('POST', '/people', {});
  request.end('{"firstname": "Pierre"}');
}],

['REMOVE', 1, function() {
  emitter_actions['REMOVE:Person'] = function(query) {
    assert.deepEqual(query, {firstname: 'Pierre'});
  };
  var request = client.request('DELETE', '/people?firstname=Pierre', {});
  request.end();
}],

['UPDATE', 2, function() {
  var R = RFactory();
  var p = new R.Person({firstname: 'Pierre'});
  p.save(function() {
    var id = p.id;
    emitter_actions['UPDATE:Person'] = function(ids, data) {
      assert.deepEqual(ids, [id]);
      assert.deepEqual(data, {firstname: 'Toto'});
    };
    var request = client.request('PUT', '/people/'+id, {});
    request.end('{"firstname": "Toto"}');
  });
}],

['DELETE', 1, function() {
  var R = RFactory();
  var p = new R.Person({firstname: 'Pierre'});
  p.save(function() {
    var id = p.id;
    emitter_actions['DELETE:Person'] = function(ids) {
      assert.deepEqual(ids, [id]);
    };
    var request = client.request('DELETE', '/people/'+id, {});
    request.end();
  });
}],

];

