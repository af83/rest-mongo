var URL = require('url');
var sys = require('sys');

var rest_mongo = require('rest-mongo/core');
var utils = require('nodetk/utils');
var debug = require('nodetk/logging').debug;

var head_ok = {
  'Transfer-Encoding': 'chunked',
  'Content-Type': 'application/json'
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
var get_body_json = exports.get_body_json = function(request, callback) {
  var body = '';
  request.addListener('data', function(chunk) {
    body += chunk;
  });
  request.addListener('end', function() {
    callback(JSON.parse(body));
  });
};


exports.plug = function(server, schema, RFactory) {
  /** Plug the HTTP Rest server to existing http server.
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
    var schema = data.schema;
    var route;

    // GET or POST to /resource
    routing.push([new RegExp('^' + resource + '$'), {

      // Index
      'GET': function(response) {
        var R = RFactory();
        R[class_name].index(function(objects) {
          send_objects(objects, response);
        });
      },

      // Create
      'POST': function(response, _, request) {
        var R = RFactory();
        get_body_json(request, function(data) {
          obj = new R[class_name](data);
          obj.save(function() {
            response.writeHead(201);
            response.end();
          });
        });
      }

    }]);

    // GET: /resource/id
    routing.push([new RegExp('^' + resource + "/(\\w+)$"), {
      'GET': function(response, match) {
        var id = match[1];
        var R = RFactory();
        R[class_name].get({ids: id}, function(obj) {
          if(obj) return send_object(obj, response);
          response.writeHead(404);
          response.end();
        });
      },
    }]);

    // GETs (more than one id asked in same request): /resource/id1,id2[...]
    routing.push([new RegExp('^' + resource + "/(\\w+(?:,\\w+)*)$"), {
      'GET': function(response, match) {
        // handle single and multiple gets (using previous regexp)
        var ids = match[1].split(",");
        var R = RFactory();
        R[class_name].get({ids: ids}, function(objects) {
          // XXX: handle 404 if missing one?
          objects = objects.filter(function(obj) {
            return obj != null;  
          });
          send_objects(objects, response);
        });
      },
    }]);



  });

  server.addListener('request', function(request, response) {
    var url = URL.parse(request.url);
    var method = request.method; // TODO: lookup for fake delete / update ...

    sys.puts('pathname: ' + url.pathname);
    for(var i=0; i<routing.length; i++) {
      var route = routing[i][0],
          action = routing[i][1][method],
          match;
      try {
        sys.puts('Try against ' + route);
        match = url.pathname.match(route);
      } catch(e) {sys.puts('error: ' + e);};
      if(match) {
        sys.puts('match!');
        return action && action(response, match, request);
      }
    }
  });

};

