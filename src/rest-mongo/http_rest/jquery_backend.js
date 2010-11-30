
var additional_params;

var ajax = function(type, url, query, callback, fallback) {
  if(typeof query == 'object') {
    // if query is a string, the additional params have already been added.
    query = $.extend({}, query, additional_params);
  }
  $.ajax({
    url: url,
    type: type,
    data: query,
    dataType: 'json',
    cache: false,
    success: function(data) {
      callback && callback(data)
    },
    error: function(req){
      fallback && fallback(req);
    }
  });
};

var stringify = function(data) {
  /* A function to stringify data.
   * Will add additional parameters
   */
  var data2 =  $.extend({}, data, additional_params);
  return JSON.stringify(data2);
};

var backend = {
  index: function(RestClass, query, callback, fallback) {
    var query2 = {query: stringify(query)};
    ajax('GET', RestClass.resource, query2, callback, fallback);
  },
 
  distinct: function(RestClass, key, query, callback, fallback) {
    fallback(new Error('Not implemented'));
  },

  gets: function(RestClass, ids, callback, fallback) {
    ajax('GET', RestClass.resource + '/' + ids.join(','), {}, function(data) {
      if(ids.length == 1) data = [data];
      callback && callback(data);
    }, function(request) {
      if(request.status == 404) return callback && callback([]);
      fallback && fallback();
    });
  },

  update: function(RestClass, ids, data, callback, fallback) {
    ajax('PUT', RestClass.resource + '/' + ids.join(','), stringify(data),
         callback, fallback);
  },

  delete_: function(RestClass, ids, callback, fallback) {
    ajax('DELETE', RestClass.resource + '/' + ids.join(','), {}, 
         callback, fallback);
  },

  insert: function(RestClass, obj, callback, fallback) {
    ajax('POST', RestClass.resource, stringify(obj), callback, fallback);
  },

  clear_all: function(RestClass, callback, fallback) {
    ajax('DELETE', RestClass.resource, {}, callback, fallback);
  }
};


exports.get_backend = function(options) {
  options = options || {};
  additional_params = options.additional_params || {};
  return backend;
};

