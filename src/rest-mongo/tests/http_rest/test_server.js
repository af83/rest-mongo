
require.paths.unshift(__dirname + '/../../../../vendor/nodetk/src');
require.paths.unshift(__dirname + '/../../../');

var http = require("http"),
    sys = require("sys"),

    CLB = require("nodetk/orchestration/callbacks");
    assert = require("nodetk/testing/custom_assert");

    rest_server = require('rest-mongo/http_rest/server'),
    rest_mongo = require('rest-mongo/core'),
    schema = require('rest-mongo/tests/schema').schema;



var server;
var client;
var RFactory = rest_mongo.getRFactory(schema, {db_name: 'test-rest-mongo'});


(function() {
  // init some stuff
  server = http.createServer();
  rest_server.plug(server, schema, RFactory);
  server.listen(8555);
  // TODO: close the server at the end of the tests.
  client = http.createClient(8555, '127.0.0.1');
  client.addListener('error', function(err) {
    sys.puts(err.message, err.stack);
  });
})();


var DATA = {},
    R;
exports.setup = function(callback) {
  R = RFactory();
  var waiter_clear = CLB.get_waiter(2, function() {
    DATA.p1 = new R.Person({firstname: "Pierre"});
    DATA.p2 = new R.Person({firstname: "Kevin"});

    // TODO: make something in core to do that easily
    // like R.save([p1, p2], callback, fallback)
    var waiter = CLB.get_waiter(2, callback);
    DATA.p1.save(waiter);
    DATA.p2.save(waiter);
  });
  R.Person.clear_all(waiter_clear);
  R.Animal.clear_all(waiter_clear);
};


var expected_header = {
  'transfer-encoding': 'chunked',
  'connection': 'close'
};

var expected_header_json = {
  'content-type': 'application/json',
  'transfer-encoding': 'chunked',
  "connection": "close"
};


exports.tests = [


['Index on Person', 3, function() {
  var request = client.request('GET', '/people', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header_json);
    rest_server.get_body_json(response, function(data) {
      assert.deepEqual(data, [DATA.p1.json(), DATA.p2.json()]);
    });
  });
  request.end();
}],


['Index on Animals (no data)', 3, function() {
  var request = client.request('GET', '/animals', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header_json);
    rest_server.get_body_json(response, function(data) {
      assert.deepEqual(data, []);
    });
  });
  request.end();
}],


['GET existing obj', 3, function() {
  var request = client.request('GET', '/people/' + DATA.p1.id, {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header_json);
    rest_server.get_body_json(response, function(data) {
      assert.deepEqual(data, DATA.p1.json());
    });
  });
  request.end();
}],


['GET non existing obj', 2, function() {
  var request = client.request('GET', '/people/A000000000000000000001', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.headers, expected_header);
  });
  request.end();
}],


['GET non existing obj bad id format', 2, function() {
  var request = client.request('GET', '/people/titi', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.headers, expected_header);
  });
  request.end();
}],


['GETs all existing obj', 3, function() {
  var url = '/people/' + DATA.p1.id + ',' + DATA.p2.id;
  var request = client.request('GET', url, {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header_json);
    rest_server.get_body_json(response, function(data) {
      assert.deepEqual(data, [DATA.p1.json(), DATA.p2.json()]);
    });
  });
  request.end();
}],


['GETs missing obj', 3, function() {
  var url = '/people/' + DATA.p1.id + ',toto';
  var request = client.request('GET', url, {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header_json);
    rest_server.get_body_json(response, function(data) {
      assert.deepEqual(data, [DATA.p1.json()]);
    });
  });
  request.end();
}],


['POST /people', 4,function() {
  var request = client.request('POST', '/people', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.headers, expected_header);
    R.Person.index(function(data) {
      assert.equal(data.length, 3);
      var p = data.filter(function(obj){return obj.firstname == 'Luc'})[0];
      assert.ok(p.id);
    });
  });
  request.write(JSON.stringify({firstname: 'Luc'}));
  request.end();
}],


['POST /people + irrelevant data', 5,function() {
  var request = client.request('POST', '/people', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.headers, expected_header);
    R.Person.index(function(data) {
      assert.equal(data.length, 3);
      var p = data.filter(function(obj){return obj.firstname == 'Luc'})[0];
      assert.ok(p.id);
      // Check irrelevant data is not kept:
      assert.ok(!p.weapon);
    });
  });
  request.write(JSON.stringify({firstname: 'Luc', weapon: 'knife'}));
  request.end();
}],


];


