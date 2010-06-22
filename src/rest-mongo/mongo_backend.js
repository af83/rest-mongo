
require.paths.unshift(__dirname + "/../vendor/node-mongodb-native/lib")

var debug = require('nodetk/logging').debug;
var utils = require('nodetk/utils');

var mongo = require("mongodb/db");
utils.extend(mongo, require('mongodb/connection'));
var ObjectID = require('mongodb/bson/bson').ObjectID;


var init_connection_db = function(db) {
  /* Open connection with DB + Returns obj definig get_collection() fct.
   *
   * The get_collection fct is changed once the connexion is effective, and
   * requests made so far are run.
   */
  var todo_once_db_opened = [];
  var client = null;
  var collector = {
    // before the connection with DB is done:
    get_collection: function() {todo_once_db_opened.push(arguments);}
  };

  var get_collection_opendb = function(RestClass, callback, fallback) {
    /* Returns collection corresponding to RestClass given in args.
     *
     * Arguments:
     *  - RestClass
     *  - callback
     *  - fallback
     */
    var name = RestClass.schema.id;
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
    delete todo_once_db_opened;
    collector.get_collection = get_collection_opendb;
    todo_once_db_opened.forEach(function(args) {
      get_collection_opendb.apply(this, args);
    });
  });
  return collector;
};


var stringids_to_bsonids = function(ids) {
  /* Returns list of bson ids corresponding to given ids.
   * Ids with wrong formats (not /\w{24}/) are removed from the list
   * (and so their bson representation won't appear in result)
   */
  return ids.map(function(id) {
    if(id.match(/^\w{24}$/)) return ObjectID.createFromHexString(id);
  });
};

var bsonid_to_stringid = function(obj) {
  /* convert bson obj._id to string obj.id
   */
  obj.id = obj._id.toHexString(),
  delete obj._id;
};


var collection_wrapper = function(collector, wrapped, fallback_position) {
  /* Wraps the given fct 'wrapped' 
   * to replace the RestClass first argument by the corresponding collection.
   *
   * Arguments:
   *  - wrapped: the fct to be wrapped
   *  - fallback_position: the position of an eventual fallback given 
   *    to wrapped function (starting at 0).
   */
  return function() {
    var arguments_wrapped = arguments;
    collector.get_collection(arguments[0], function(collection) {
      arguments_wrapped[0] = collection;
      wrapped.apply(this, arguments_wrapped);
    }, arguments_wrapped[fallback_position]);
  }
}

//-----------------------------------------------------------------------------



var get_backend = exports.get_backend = function(params) {
  /* Returns backend object as specified in backend_interface.
   *
   * Arguments:
   *  - params:
   *    - db_name: name of the mongo db.
   *    - host: where is the DB, default to 'localhost'.
   *    - port: which port, default to 27017.
   *
   */
  params = utils.extend({
    host: "localhost",
    port: 27017
  }, params);
  if (!params.db_name) throw('You must specify a DB name!'); 
  var mongo_server = new mongo.Server(params.host, params.port, 
                                      {auto_reconnect: true}, {});
  var db = new mongo.Db(params.db_name, mongo_server);
  collector = init_connection_db(db);

  return {
    index: collection_wrapper(collector, index, 3),
    gets: collection_wrapper(collector, gets, 3),
    update: collection_wrapper(collector, update, 4),
    delete_: collection_wrapper(collector, delete_, 3),
    insert: collection_wrapper(collector, insert, 3),
    clear_all: collection_wrapper(collector, clear_all, 2)
  }
}


var index = exports.index = function(collection, query, callback, fallback) {
  collection.find(query, {sort: [['_id', 'descending']]}, function(err, cursor) {
    if(err != null) return fallback(err);
    else cursor.toArray(function(err, objects) {
      if(err != null) return fallback(err);
      objects.forEach(bsonid_to_stringid);
      callback(objects);
    });
  });
};


var gets = exports.gets = function(collection, ids, callback, fallback) {
  ids = stringids_to_bsonids(ids);
  collection.find({_id: {'$in': ids}}, function(err, cursor) {
    if(err != null) return fallback && fallback(err);
    cursor.toArray(function(err, objects) {
      if(err != null) return fallback && fallback(err);
      objects.forEach(bsonid_to_stringid);
      callback && callback(objects);
    });
  });
};


var update = exports.update = function(collection, ids, data, callback, fallback) {
  ids = stringids_to_bsonids(ids);
  var options = {upsert: false, safe: Boolean(callback), multi: true};
  collection.update({_id: {'$in': ids}}, {'$set': data}, options, 
                    function(err, document) {
    if(err != null) return fallback && fallback(err);
    callback && callback();
  });
};


var delete_ = exports.delete_ = function(collection, ids, callback, fallback) {
  ids = stringids_to_bsonids(ids);
  collection.remove({_id: {'$in': ids}}, function(err, _) {
    if(err != null) return fallback && fallback(err);
    callback && callback();
  }, fallback);
};


var insert = exports.insert = function(collection, json_obj, callback, fallback) {
  collection.insert(json_obj, function(error, objects) {
    if(error != null) return fallback && fallback(error);
    objects.forEach(bsonid_to_stringid);
    callback && callback(objects[0]);
  });
};


var clear_all = exports.clear_all = function(collection, callback, fallback) {
  collection.remove({}, function(err, _) {
    if(err != null) return fallback && fallback(err);
    callback && callback();
  }, fallback);
};

