
var rest_mongo = require("rest-mongo/core")
  , schema = require('rest-mongo/tests/schema').schema
  , jbackend = require('rest-mongo/http_rest/jquery_backend')
  ;

var backend = jbackend.get_backend();

// For demo purpose, let's make it global:
RFactory = rest_mongo.getRFactory(schema, backend)
R = RFactory();

console.log('Demo ready (R set).');

