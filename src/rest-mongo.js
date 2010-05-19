/* 
   The rest module provides an easy way to manipulate objects
   and communicate with mongo db.

 */

var sys = require('sys');

var callbacks = require('nodetk/orchestration/callbacks');
var debug = require('nodetk/logging').debug;
var utils = require('nodetk/utils');

var mongo = require("mongodb/db");
utils.extend(mongo, require('mongodb/connection'));
var ObjectID = require('mongodb/bson/bson').ObjectID;


var init_connection_db = function(db) {
  /* Open connection with DB + returns a get_collection() fct.
   */
  var todo_once_db_opened = [];
  var client = null;

  var get_collection = function(args, callback, fallback) {
    /* Returns collection corresponding to RestClass given in args.
     *
     * Arguments:
     *  - args:
     *    - RestClass
     *  - callback
     *  - fallback
     */
    var name = args.RestClass.schema.id;
    client.collection(name, function(err, collection) {
      if(err == null) callback(collection);
      else {
        debug("\nError when getting collection:");
        debug(err.stack);
        fallback && fallback(err);
      }
    });
  };

  db.open(function(err, client_) {
    if (err) {
      debug('Error while opening connection with DB:')
      debug(err.stack);
      return;
    }
    client = client_;
    todo_once_db_opened.forEach(function(args) {
      get_collection.apply(this, args);
    });
    delete todo_once_db_opened;
  });

  return function() {
    if(client != null) get_collection.apply(this, arguments);
    else todo_once_db_opened.push(arguments);
  };
}


var isFunction = function(fct) {
  return typeof fct == 'function';
};

var isArray = function(obj) {
  return obj.constructor == Array;
};

var each = function(obj, callback) {
  obj.forEach(function(attr_name) {
    callback(attr_name, obj[attr_name]);
  });
};

var delegate = function(obj, args_sups, delegation_table) {
  /* Defines new methods in given obj such that methods call
   * the corresponding methods (in delegation table) with arguments
   * extended with args_sups (and made optional).
   *
   * Arguments:
   *  - obj:
   *  - args_sups: hash with arbitrary keys => values
   *  - delegation_table: hash {method_name: method}
   *
   */
  for(method_name in delegation_table) (function(method) {
    obj[method_name] = function(args, callback, fallback) {
      if(!fallback && (typeof args == "function")) {
        fallback = callback; callback = args;
        args = {};
      }
      var new_args = utils.extend({}, args_sups, args);
      return method(new_args, callback, fallback);
    };
  }(delegation_table[method_name]));
};


// ----------------------
/* The following functions:
 *    - index
 *    - get
 *    - update
 *    - delete_
 *    - insert
 * takes two more arguments (added in args):
 *  - RestClass: What the RestClass obj we are looking for ?
 *  - session: 
 *   - cache: cache where to look for objects
 *   - awaiting_get_callbacks: Callbacks to be called once an object is available
 *
 *   These arguments are added by the RestClass, so you should not worry about them
 *   if you are calling RestClass.method
 */

var index = function(args, callback, fallback) {
  /* Get array of objs corresponding to given query.
   *
   * Arguments:
   *  - args:
   *    - query: mongo query, default to {}
   *  - callback(objs): function to be called with result
   *  - fallback(err): function to be called in case of error
   * 
   * */
  var query = args.query;

  var RestClass = args.RestClass;
  var cache = args.session.cache;
  var awaiting_get_callbacks = args.session.awaiting_get_callbacks;

  var key = JSON.stringify(query);
  RestClass.get_collection(function(collection) {
    collection.find(query, function(err, cursor) {
      if(err != null) {
        debug("\nError while index:");
        debug(err.stack);
        fallback && fallback(err);
      }
      else cursor.toArray(function(err, data) {
        // TODO: handle err
        data = data.map(RestClass.qau);
        callback && callback(data);
      });
    });
  });
};


var get = function(args, callback, fallback) {
  // TODO: use the fallback!
  /* Get object(s) of RestClass having the requested id(s).
   * If only one requested id, will give an object to the callback, otherwise
   * it will give an array of objects.
   *
   * Arguments:
   *  - args:
   *    - ids: id(s) of the objects you want to get
   *    - force_reload: default to false, true if you don't want to 
   *      ignore an eventual cached value
   *  - callback(obj(s)): the fct to be called with the result
   *  - fallback(err): the fct to be called in case of error
   *
   */
  var ids = args.ids;
  var force_reload = args.force_reload || false;

  var RestClass = args.RestClass;
  var cache = args.session.cache;
  var awaiting_get_callbacks = args.session.awaiting_get_callbacks;

  if(!isArray(ids)) ids = [ids];

  // We do accept ids as hexa strings
  if(typeof ids[0] == 'string') {
    ids = ids.map(function(id) {
      return ObjectID.createFromHexString(id);
    });
  }

  debug("Get objects of rest class " + RestClass.schema.id + 
        " having ids " + ids.map(function(id){return id.toHexString()}));

  var to_wait_for = [],
      to_get = [],
      all_objects,
      obj,
      waiter;

  all_objects = ids.map(function(id){
    if(obj = cache[id]){
      if(awaiting_get_callbacks[id]) to_wait_for.push(id);
      else if(force_reload || obj._pl) to_get.push(id);
    }
    else {
      obj = new RestClass({_id:id});
      to_get.push(id);
    }
    return obj;
  });

  if(all_objects.length == 1) all_objects = all_objects[0];
  waiter = callbacks.get_waiter(to_wait_for.length + to_get.length, function(){
    //callback && callback(all_objects);
    var res = ids.map(function(id){return cache[id]});
    if (ids.length == 1) res = res[0];
    callback && callback(res);
  });

  to_wait_for.map(function(id){
    awaiting_get_callbacks[id].push(waiter);
  });

  to_get.map(function(id){
    awaiting_get_callbacks[id] = [waiter];
  });

  debug('to get: ' + to_get.map(function(id){return id.toHexString()}));
  debug('to wait for: ' + to_wait_for.map(function(id){return id.toHexString()}));

  to_get.length && RestClass.get_collection(function(collection) {
    collection.find({_id: {'$in': to_get}}, function(err, cursor) {
      if(err != null) {
        debug("Error on RestClass.get: " + err.stack);
        all_objects = null;
        to_get.forEach(function(id){
          delete cache[id].id;
          delete cache[id];
          callbacks.empty_awaiting_callbacks(awaiting_get_callbacks, id);
        });
        return;
      }
      cursor.toArray(function(err, data) {
        if(err != null) {
          debug("Error while converting get result from cursor to array");
        }
        var got = {};
        data.forEach(function(obj) {
          got[obj._id] = true;
        }); // for missing objects:
        to_get.filter(function(id) {return !got[id]})
              .forEach(function(missing) {
          cache[missing] = null;
          callbacks.empty_awaiting_callbacks(awaiting_get_callbacks, missing);
        });
        data.forEach(function(obj){
          var id = obj._id;
          cache[id]._update(obj);
          if(cache[id]._pl) delete cache[id]._pl;
          callbacks.empty_awaiting_callbacks(awaiting_get_callbacks, id);
        });
      });
    });
  });
};


var update = function(args, callback, fallback) {
  /* Update a bunch of RestClass ids.
   *
   * Arguments:
   *  - args:
   *    - ids: array of ids (or ONE id) of the objs you want to update.
   *    - data: a hash with the data you want to set in ALL the objs to update.
   *  - callback: a function to call if the update was successfull.
   *  - fallback: a function to call if the update was not successfull.
   *
   * Checking for the success of an update take one more request.
   * This check won't be done if you don't provide a callback, nor a fallback. 
   * */
  var ids = args.ids;
  var data = args.data;

  var RestClass = args.RestClass;
  var cache = args.session.cache;
  var awaiting_get_callbacks = args.session.awaiting_get_callbacks;

  if(!isArray(ids)) ids = [ids];
  debug("Update objects of rest class " + RestClass.schema.id +
           " having ids " + ids.map(function(id){return id.toHexString()}));
  RestClass.get_collection(function(collection) {
    var options = {upsert: false, safe: Boolean(callback), multi: true};
    collection.update({_id: {'$in': ids}}, 
                      {'$set': data},
                      options, 
                      function(err, document) {
      if(err != null) {
        debug("Error when updating a doc:", err.stack);
        return fallback && fallback();
      }
      ids.map(function(id) {
        cache[id] && cache[id]._update(data);
      });
      callback && callback();
    });
  });
};


var delete_ = function(args, callback, fallback) {
  /* Delete a list of (or one) object(s), given the id(s).
   *
   * Arguments:
   *  - args:
   *    - ids: array of ids to delete, or ONE id.
   *      The id might either be hexa strings or ObjectID obj.
   *  - callback: a function to be called once the obj 
   *    has been successfully deleted.
   *  - fallback: a function to be called in case of error
   *    (the object could not be deleted).
   */
  var ids = args.ids;

  var RestClass = args.RestClass;
  var cache = args.session.cache;
  var awaiting_get_callbacks = args.session.awaiting_get_callbacks;

  if(!isArray(ids)) ids = [ids];
  debug("Delete object of rest class " + RestClass.schema.id +
           " having id " + ids.map(function(id){return id.toHexString()}));
  RestClass.get_collection(function(collection) {
    collection.remove({_id: {'$in': ids}}, function(err, _) {
      if(err != null) { // as of 10/03/10, err is always null
        debug("Error while deleting");
        debug(err.stack);
      }
      ids.map(function(id) {delete cache[id]});
      callback && callback(err);
    });
  });
};

var insert = function(args, callback, fallback) {
  /* Insert ONE object in DB (it must not have an id).
   * Once inserted, the object will have an id.
   *
   * Arguments:
   *  - args:
   *    - obj: the object to insert in DB.
   *    - RestClass: the RestClass of the obj
   *    - session: the session in which we are working
   *  - callback(obj): to be called once the object has been successfully inserted.
   *  - fallback(err): to be called in case of error.
   */
  var obj = args.obj;
  var RestClass = args.RestClass;
  var cache = args.session.cache;
  var awaiting_get_callbacks = args.session.awaiting_get_callbacks;

  RestClass.get_collection(function(collection) {
    collection.insert(obj.unlink(), function(err, objs) {
      if(err != null) {
        debug("\nError when inserting:");
        debug(err.stack);
        return fallback && fallback(err);
      }
      cache[objs[0]._id] = obj._update(objs[0]);
      callback && callback(obj);
    });
  });
};


var clear_cache = function(args) {
  /* Clear the session cache.
   *
   * Arguments:
   *  - args:
   *    - session
   */
  args.session.cache = {};
  args.session.awaiting_get_callbacks = {};
};


var clear_all = function(args, callback, fallback) {
  /* Delete ALL objects of RestClass from DB.
   *
   * Arguments:
   *  - args:
   *    - RestClass
   *    - session
   *  - callback(): to be called once the objects have been removed from DB.
   *  - fallback: to be called in case of error.
   */
  clear_cache(args);
  var RestClass = args.RestClass;
  RestClass.get_collection(function(collection) {
    collection.remove({}, function(err) {
      if(err == null) return callback && callback();
      debug("Error while removing collection " + RestClass.schema.id);
      debug(err.stack);
      fallback && fallback(err);
    });
  }, fallback);
};
// ----------------------

// Holds for each RestClass attributes being [lists of] references:
// {RestClassId: {dict_ref_lists: {attrName: [list of RestClassIds]},
//                dict_refs: {attrName: [list of RestClassIds]},
//                }}
var REFS_LISTS = {};

var unlink_references = function(obj) {
  /* Returns simplified copy of the given obj:
   * references to other objects are replaced by {id:2}.
   * Attributes not in the schema are not kept.
   * Kind of the opposite of link.
   *
   * Arguments:
   *  - obj: the object you want to "unlink".
   * */
  var refs = REFS_LISTS[obj.Class.schema.id];
  var res = {}; 
  for(var key in obj.Class.schema.properties) {
    if(key in refs.dict_ref_lists) 
      res[key] = obj[key] && obj[key].map(function(elmt) {
        return {_id: elmt._id};
      }) || [];
    else if(key in refs.dict_refs)
      res[key] = obj[key] && {_id: obj[key]._id} || null;
    else res[key] = obj[key];
  }
  return res;
};


var link_references = function(obj, restClassId, rest_classes) {
  /* Given an object following the schema defined for rest_class,
   * replace attributes being [list of] references by links
   * to real objects.
   *
   * Arguments:
   *  - obj: the object you want to "unlink".
   *  - restClassId: name of the RestClass of obj.
   *  - rest_classes: hash associating restClassId with RestClass.
   */
  var refs = REFS_LISTS[restClassId];
  for(var key in refs.dict_ref_lists){
    var OtherClass = rest_classes[refs.dict_ref_lists[key]];
    obj[key] = obj[key] && obj[key].map(OtherClass.qau);
  }
  for(var key in refs.dict_refs){
    var OtherClass = rest_classes[refs.dict_refs[key]];
    obj[key] = obj[key] && OtherClass.qau(obj[key]);
  }
};

var build_ref_lists = function(schema) {
  /* From a schema, build REFS_LISTS.
   */
  for(var class_name in schema){
    var dict_ref_lists = {};
    var dict_refs = {};
    var class_schema = schema[class_name].schema;
    var properties = class_schema.properties;
    for(var key in properties){
      var val = properties[key];
      if(val.type == 'array' && val.items['$ref']){
        dict_ref_lists[key] = val.items['$ref'];
      }
      else if(val['$ref']){
        dict_refs[key] = val['$ref'];
      }
    }
    REFS_LISTS[class_name] = {
      dict_ref_lists: dict_ref_lists,
      dict_refs: dict_refs,
    };
  }
  debug('REFS_LISTS:', REFS_LISTS);
};


// ----------------------


var setRestClassProto = function(RestClass, rest_classes) {
  /* Given a RestClass, set its prototype */
  RestClass.prototype = {
    Class: RestClass,
    delete_: function(callback, fallback){
      RestClass.delete_({ids: [this._id]}, callback, fallback);
    },
    update: function(args) {
      args.ids = [this._id];
      RestClass.update(args);
    },
    unlink: function(){return unlink_references(this)},
    save: function(callback, fallback) {
      /* Save the obj to DB, creating it if necessary.
       *
       * Arguments:
       *  - callback(obj): to be called once the object has been saved/inserted.
       *  - fallback(err): to be called in case of error.
       */
      var obj = this;
      if('_id' in obj) { // The object already exist: use update
        return RestClass.update({ids: [obj._id],
                                 data: obj.unlink()
                                 }, callback, fallback);
      }
      // The object has no id, it really is a new one, so insert:
      RestClass.insert({obj: obj}, callback, fallback);
    },
    _update: function(data){
      /* Update the object with the given data, no request is made: no save.
       * The [list of] references are changed for references to real objects
       * */
      link_references(data, RestClass.schema.id, rest_classes);
      return utils.extend(this, data);
    },
    refresh: function(callback, fallback){
      /* Reload the object with values from DB.
       * Current values won't be saved.
       *
       * Arguments:
       *  - callback(obj): function to be called once the obj has been reloaded
       *  - fallback(err): function to be called in case of error
       */
      RestClass.get({ids: [this.id],
                     force_reload: true
                     }, callback, fallback);
    },
    id: function() {
      return this._id.toHexString();
    }
  }
};

exports.getRFactory = function(schema, db_name, db_host, db_port) {
  /* Returns a R factory.
   * This factory return a R object at every call. Each R as its own "session",
   * meaning that two subsequent calls of R.Toto.get(2) will return the same object.
   * If the same object is retrieved from two different R, then the results are
   * not the same instances (modify one won't modify the second).
   *
   * The typical use is to do:
   *  var RFactory = getRFactory();
   *
   * and then for every request (or unit of work): var R = RFactory();
   *
   * Arguments:
   *  - schema: schema describing the nature of your data
   *  - db_name: name of the DB you want to connect to
   *  - db_host: optional, default to "localhost"
   *  - db_port: optional, default to 27017
   */
  db_host = db_host || "localhost";
  db_port = db_port || 27017;
  if (!schema) throw('You must specify a schema');
  if (!db_name) throw('You must specify a DB name!'); 
  var mongo_server = new mongo.Server(db_host, db_port, {auto_reconnect: true}, {});
  var db = new mongo.Db(db_name, mongo_server);
  var get_collection = init_connection_db(db);

  build_ref_lists(schema);
  return function() {
    var rest_classes = {};

    for(var class_name in schema){
      debug("Create the rest class " + class_name);

      var session = {
        cache: {},  // cache where are stored the objects of class_name, indexed by id
        awaiting_get_callbacks: {}, // Callbacks to be called once an object is available
      };

      var RestClass = function(data, partially_loaded) {
        data = data || {};
        debug("Create a new object of rest class " + class_name +
                    " with data ", data);
        data._id && (session.cache[data._id] = this);
        this._update(data);
        if(partially_loaded) this._pl = true;
      };
      rest_classes[class_name] = RestClass;

      setRestClassProto(RestClass, rest_classes);

      delegate(RestClass, {session: session, RestClass: RestClass}, {
        index: index,
        get: get,
        update: update,
        delete_: delete_,
        insert: insert,
        clear_cache: clear_cache,
        clear_all: clear_all,
        get_collection: get_collection,
      });

      RestClass.schema = schema[class_name].schema;
      RestClass.resource = schema[class_name].resource;

      RestClass.qau = function(data){
        debug("qau on " + RestClass.schema.id + " with data: ", data);
        return session.cache[data._id] && session.cache[data._id]._update(data)
               || new RestClass(data, 1);
      };
    }

    return utils.extend({
      clear_caches: function() {
        debug("Clear the caches");
        each(rest_classes, function(name, RestClass){
          RestClass.clear_cache();
        });
      }
    }, rest_classes);
  };
};

