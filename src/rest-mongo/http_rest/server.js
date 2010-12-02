var URL = require('url');

var rest_mongo = require('rest-mongo/core');
var utils = require('nodetk/utils');
var debug = require('nodetk/logging').debug;
//debug.on();

var index_options = {};
require('rest-mongo/backend_interface').index_options.forEach(function(option) {
  index_options[option] = true;
});

var head_ok = {
  'Content-Type': 'application/json; charset=utf-8'
};


var send_objects = function(objects, response) {
  /* Send JSON representation of a list of mongo-rest objects to response.
   */
  response.writeHead(200, head_ok);
  response.write('[');
  // TODO: use a cursor here
  if(objects.length > 0) {
    response.write(JSON.stringify(objects[0].json()), 'utf-8');
  }
  objects.slice(1).forEach(function(obj) {
    response.write(',' + JSON.stringify(obj.json()), 'utf-8');
  });
  response.write(']');
  response.end();
};


var send_object = function(obj, response) {
  /* Send JSON representation of one mongo-rest object to response.
   */
  response.writeHead(200, head_ok);
  response.write(JSON.stringify(obj.json()), 'utf-8');
  response.end();
};


// TODO: move this out of here?
var get_body = exports.get_body = function(request, callback) {
  var body = '';
  request.addListener('data', function(chunk) {
    body += chunk;
  });
  request.addListener('end', function() {
    callback(body);
  });
};

var get_body_json = exports.get_body_json = function(request, callback) {
  get_body(request, function(body) {
    callback(JSON.parse(body));
  });
};

// --------------------------------------------------------------

var Server = function(RFactory, class_name, schema) {
  /* Class to hold context info about a particular resource.
   *
   * Arguments:
   *  - RFactory: R factory function to user at each request.
   *  - class_name: the class name of the resource to serve.
   *  - schema: the schema corresponding to the resource.
   *
   */
  var self = this;
  this.RFactory = RFactory;
  this.class_name = class_name;
  this.schema = schema;
  var proto = Server.prototype;
  // Here we make the functions "bindable":
  // we can call them directly, will be called on the this (Server) object.
  for(var fct_name in proto) (function(fct_name, fct){
    self[fct_name] = function() {
      fct.apply(self, arguments);
    };
  })(fct_name, proto[fct_name]);
};
Server.prototype = {};

Server.prototype.GET = function(response, _, data) {
  /* GET on /resource where resource correspond to class_name.
   */
  var R = this.RFactory();
  var u_query = {}; 
  if (data && data.query != undefined) try {
    u_query = JSON.parse(data.query);
  } catch(e) {
    response.writeHead(400);
    response.end();
  }
  var query = {};
  debug(u_query);
  for(var criteria in u_query) { 
    if (criteria in this.schema.properties || criteria in index_options) {
      query[criteria] = u_query[criteria];
    }
  }
  R[this.class_name].index({query: query}, function(objects) {
    send_objects(objects, response);
  });
};

Server.prototype.POST = function(response, _, data) {
  // TODO: check data more carefully (handle mandatory stuff)
  var R = this.RFactory();
  obj = new R[this.class_name](data);
  obj.save(function() {
    response.writeHead(201);
    response.write(JSON.stringify(obj.json()));
    response.end();
  });
};

Server.prototype.DELETE_ = function(response) {
  var R = this.RFactory();
  R[this.class_name].clear_all(function() {
     response.writeHead(200);
     response.end();
  }, function(error) {
    response.writeHead(500);
    response.end();
  });
};

Server.prototype.GETs = function(response, match) {
  var ids = match[1].split(",");
  var R = this.RFactory();
  R[this.class_name].get({ids: ids}, function(objects) {
    if(ids.length == 1) {
      if(objects) return send_object(objects, response);
      response.writeHead(404);
      response.end();
    }
    else {
      // XXX: handle 404 if missing one?
      objects = objects.filter(function(obj) {
        return obj != null;  
      });
      send_objects(objects, response);
    }
  });
};

Server.prototype.PUT = function(response, match, data) {
  var ids = match[1].split(",");
  var R = this.RFactory();
  R[this.class_name].update({ids: ids, data: data}, function(objects) {
    response.writeHead(200);
    response.end();
  }, function(error) {
    response.writeHead(500);
    response.end();
  });
};

Server.prototype.DELETEs = function(response, match) {
  var ids = match[1].split(",");
  var R = this.RFactory();
  R[this.class_name].delete_({ids: ids}, function() {
    response.writeHead(200);
    response.end();
  }, function(err) {
    response.writeHead(500);
    response.end();
  });
};

// --------------------------------------------------------------

exports.connector = function(RFactory, schema, auth_check) {
  /** Returns a connect composant answering REST API calls.
   *
   * Arguments:
   *  - RFactory
   *  - schema
   *  - auth_check: optional, function to be called in case you want to ensure
   *    authentication / authorization before serving any resource:
   *      auth_check(req, res, next, info)
   *        - req: nodejs req obj.
   *        - res: nodejs res obj.
   *        - next: to be called if ok to continue serving the request.
   *        - info: hash containing 'pathname', 'method', and 'data' attrs.
   *
   */
  var routing = [];
  /*
    [
      [pathname_str_or_re, {
        'GET': callback,
        'PUT': callback,
        'POST': callback,
        'DELETE': calback,
       }]
      ...
     ]
   */

  utils.each(schema, function(class_name, data) {
    var resource = data.resource;
    var escaped_resource = RegExp.escape(resource);
    var schema = data.schema;
    var route;

    var server = new Server(RFactory, class_name, schema);

    // GET or POST to /resource (collection)
    routing.push([new RegExp('^' + resource + '$'), 
    { 'GET': server.GET // index
    , 'POST': server.POST // Create
    , 'DELETE': server.DELETE_ // Delete whole collection
    }]);

    // /resource/id1[,id2[,...]]
    routing.push([new RegExp('^' + resource + "/(\\w+(?:,\\w+)*)$"),
    { 'GET': server.GETs // GETs /resource/id1[,id2[,...]]
    , 'PUT': server.PUT // Update
    , 'DELETE': server.DELETEs // DELETE /resource/id1,id2[...] 
    }]);
  });

  return function(request, response, next) {
    var url = URL.parse(request.url, true);
    var method = request.method; // TODO: lookup for fake delete / update ...
    var info = {};

    debug(method + ':' + url.pathname);
    for(var i=0; i<routing.length; i++) {
      var route = routing[i][0],
          action = routing[i][1][method],
          match;
      try {
        match = url.pathname.match(route);
      } catch(e) {console.log('error: ' + e);};
      if(match && action) {
        var info = {pathname:url.pathname, method: method}
        var data;
        if({'POST': true, 'PUT': true}[request.method]) {
          get_body_json(request, function(data) {
            info.data = data;
            var next = function() {
              action(response, match, data);
            };
            if(auth_check) auth_check(request, response, next, info);
            else next();
          });
        }
        else {
          info.data = url.query;
          var next = function() {
            action(response, match, url.query);
          };
          if(auth_check) auth_check(request, response, next, info);
          else next();
        }
        return;
      }
    }
    next();
  };

};

