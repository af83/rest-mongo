/* 
   The rest module provides an easy way to manipulate objects
   and communicate with backend db (mongo, rest server...).

 */

require.paths.unshift(__dirname + "/../vendor/nodetk/src");

var callbacks = require('nodetk/orchestration/callbacks');
var debug = require('nodetk/logging').debug;
var utils = require('nodetk/utils');


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
 *    - distinct
 *    - get
 *    - update
 *    - delete_
 *    - insert
 * takes two more arguments (added in args):
 *  - RestClass: What the RestClass obj we are looking for ?
 *  - session: 
 *   - cache: cache where to look for objects
 *   - awaiting_get_callbacks: Callbacks to be called once an object is available
 *   - backend: the store backend to make save/update... operations
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
  var query = args.query || {};

  var RestClass = args.RestClass;
  var cache = args.session.cache;
  var awaiting_get_callbacks = args.session.awaiting_get_callbacks;

  var key = JSON.stringify(query);
  args.backend.index(RestClass, query, function(objects) {
    objects = objects.map(RestClass.qau);
    callback && callback(objects);
  }, function(error) {
    debug("\nError while index:", error.message);
    debug(error.stack);
    fallback && fallback(error);
  });
};

var distinct = function(args, callback, fallback) {
  /* Get Array of values corresponding to given distinct query on object type.
   *
   * Arguments:
   *  - args:
   *    - key: what distincts values to we want
   *    - query: mongo query, default to {}
   *  - callback(values): function to be called with result
   *  - fallback(err): function to be called in case of error
   *
   * */
  var query = args.query || {}
    , key = args.key
    ;
  if(!key) return fallback(new Error('You should provide a key!'));
  args.backend.distinct(args.RestClass, key, query, callback, function(error) {
    debug("\nError while distinct:", error.message);
    debug(error.stack);
    fallback && fallback(error);
  });
};

var get = function(args, callback, fallback) {
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

  if(!utils.isArray(ids)) ids = [ids];
  debug("Get objects of rest class", RestClass.schema.id, "having ids", ids);

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
      obj = new RestClass({id:id});
      to_get.push(id);
    }
    return obj;
  });

  if(all_objects.length == 1) all_objects = all_objects[0];
  waiter = callbacks.get_waiter(to_wait_for.length + to_get.length, function(){
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

  debug('to get:', to_get);
  debug('to wait for:', to_wait_for)

  to_get.length && args.backend.gets(RestClass, to_get, function(objects) {
    var got = {};
    objects.forEach(function(obj) {
      got[obj.id] = true;
    }); // for missing objects:
    to_get.filter(function(id) {return !got[id]})
          .forEach(function(missing) {
      cache[missing] = null;
      callbacks.empty_awaiting_callbacks(awaiting_get_callbacks, missing);
    });
    objects.forEach(function(obj){
      var id = obj.id;
      cache[id]._update(obj);
      if(cache[id]._pl) delete cache[id]._pl;
      callbacks.empty_awaiting_callbacks(awaiting_get_callbacks, id);
    });
  }, function(error) {
    debug("Error on RestClass.get: " + error.stack);
    all_objects = null;
    to_get.forEach(function(id){
      delete cache[id].id;
      delete cache[id];
      callbacks.empty_awaiting_callbacks(awaiting_get_callbacks, id);
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

  if(!utils.isArray(ids)) ids = [ids];
  debug("Update objects of rest class", RestClass.schema.id, "having ids", ids);
  
  var update_local_data = function() {
     ids.map(function(id) {
      cache[id] && cache[id]._update(data);
    });
  };
  // If no callback, just update local data and run the update
  if (!callback) {
    args.backend.update(RestClass, ids, data);
    update_local_data();
  }
  // otherwise wait for return before updating local data
  else args.backend.update(RestClass, ids, data, function() {
    update_local_data();
    callback && callback();
  }, function(error) {
    debug("Error when updating a doc:", error.stack);
    fallback && fallback(error);
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

  if(!utils.isArray(ids)) ids = [ids];
  debug("Delete object of rest class", RestClass.schema.id, "having id", ids);
  args.backend.delete_(RestClass, ids, function() {
    ids.map(function(id) {delete cache[id]});
    callback && callback();
  }, function(error) {
    debug("Error while deleting:", error.message);
    debug(error.stack);
    fallback && fallback(error);
  });
};

var insert = function(args, callback, fallback) {
  /* Insert ONE object in DB (it must not have an id).
   * Once inserted, the object will have an id.
   *
   * Arguments:
   *  - args:
   *    - obj: the object to insert in DB.
   *  - callback(obj): to be called once the object has been successfully inserted.
   *  - fallback(err): to be called in case of error.
   */
  var obj = args.obj;
  var RestClass = args.RestClass;
  var cache = args.session.cache;
  var awaiting_get_callbacks = args.session.awaiting_get_callbacks;

  args.backend.insert(RestClass, obj.unlink(), function(new_obj) {
    cache[new_obj.id] = obj._update(new_obj);
    callback && callback(obj);
  }, function(error) {
    debug("\nError when inserting:", error.message);
    debug(error.stack);
    fallback && fallback(error);
  });
};


var clear_cache = function(args) {
  /* Clear the session cache.
   *
   * Arguments:
   *  - args:
   */
  args.session.cache = {};
  args.session.awaiting_get_callbacks = {};
};


var clear_all = function(args, callback, fallback) {
  /* Delete ALL objects of RestClass from DB.
   *
   * Arguments:
   *  - args:
   *  - callback(): to be called once the objects have been removed from DB.
   *  - fallback: to be called in case of error.
   */
  clear_cache(args);
  var RestClass = args.RestClass;
  args.backend.clear_all(RestClass, callback, function(error) {
    debug("Error while removing objects", RestClass.schema.id, ':', error.message);
    debug(error.stack);
    fallback && fallback(error);
  });
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
        return {id: elmt.id};
      }) || undefined;
    else if(key in refs.dict_refs)
      res[key] = obj[key] && {id: obj[key].id} || undefined;
    else res[key] = obj[key];
    if(res[key] === undefined) delete res[key];
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
      RestClass.delete_({ids: [this.id]}, callback, fallback);
    },
    update: function(args) {
      args.ids = [this.id];
      RestClass.update(args);
    },
    unlink: function(){return unlink_references(this)},
    json: function() {
      var base = {};
      utils.extend(base, this.unlink());
      return base;
    },
    save: function(callback, fallback) {
      /* Save the obj to DB, creating it if necessary.
       *
       * Arguments:
       *  - callback(obj): to be called once the object has been saved/inserted.
       *  - fallback(err): to be called in case of error.
       */
      var obj = this;
      if('id' in obj) { // The object already exist: use update
        return RestClass.update({ids: [obj.id],
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
  }
};

var save = function(objects, callback, fallback) {
  /* Save the given objects and call callback once all saved, 
   * or fallback if one fail to be saved.
   *
   * Arguments:
   *  - objects: list of RestClass objects to be saved
   *  - callback: optional, success callback fct.
   *  - fallback(err): optional, failure calback fct.
   */
  var waiter = callbacks.get_waiter(objects.length, function() {
    callback && callback();  
  }, fallback);
  objects.forEach(function(obj) {
    obj.save(waiter, function(){waiter.fall()});
  });
};


exports.getRFactory = function(schema, backend) {
  /* Returns a R factory.
   * This factory return a R object at every call. Each R as its own "session",
   * meaning that two subsequent calls of R.Toto.get(2) will return the same object.
   * If the same object is retrieved from two different R, then the results are
   * not the same instances (modify one won't modify the second).
   *
   * The typical use is to do:
   *  var RFactory = getRFactory(schema, backend);
   *
   * and then for every request (or unit of work): var R = RFactory();
   *
   * Arguments:
   *  - schema: schema describing the nature of your data.
   *  - backend: backend to use for storage. See backend_interface.js to know
   *    what methods a backend should define.
   *
   */
  if (!schema) throw('You must specify a schema');
  if (!backend) throw('You must give a backend');

  build_ref_lists(schema);
  return function() {
    var rest_classes = {};

    for(var prop_name in schema) (function(class_name) {
      debug("Create the rest class " + class_name);

      var session = {
        cache: {},  // cache where are stored the objects of class_name, indexed by id
        awaiting_get_callbacks: {}, // Callbacks to be called once an object is available
      };

      var RestClass = function(data, partially_loaded) {
        data = data || {};
        debug("Create a new object of rest class " + class_name +
                    " with data ", data);
        data.id && (session.cache[data.id] = this);
        this._update(data);
        if(partially_loaded) this._pl = true;
      };
      rest_classes[class_name] = RestClass;

      setRestClassProto(RestClass, rest_classes);

      delegate(RestClass, {
        session: session, 
        RestClass: RestClass, 
        backend: backend
      }, {
        index: index,
        distinct: distinct,
        get: get,
        update: update,
        delete_: delete_,
        insert: insert,
        clear_cache: clear_cache,
        clear_all: clear_all,
      });

      RestClass.schema = schema[class_name].schema;
      RestClass.resource = schema[class_name].resource;

      RestClass.qau = function(data){
        debug("qau on " + RestClass.schema.id + " with data: ", data);
        return session.cache[data.id] && session.cache[data.id]._update(data)
               || new RestClass(data, 1);
      };
    })(prop_name);

    return utils.extend({
      clear_caches: function() {
        debug("Clear the caches");
        utils.each(rest_classes, function(name, RestClass){
          RestClass.clear_cache();
        });
      },
      save: save
    }, rest_classes);
  };
};

