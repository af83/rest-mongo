

var ajax = function(type, url, query, callback, fallback) {
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

var backend = {
  index: function(RestClass, query, callback, fallback) {
    ajax('GET', RestClass.resource, query, callback, fallback);
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
    ajax('PUT', RestClass.resource + '/' + ids.join(','), JSON.stringify(data),
         callback, fallback);
  },

  delete_: function(RestClass, ids, callback, fallback) {
    ajax('DELETE', RestClass.resource + '/' + ids.join(','), {}, 
         callback, fallback);
  },

  insert: function(RestClass, obj, callback, fallback) {
    ajax('POST', RestClass.resource, JSON.stringify(obj), callback, fallback);
  },

  clear_all: function(RestClass, callback, fallback) {
    ajax('DELETE', RestClass.resource, {}, callback, fallback);
  }
};


exports.get_backend = function() {
  return backend;
};

