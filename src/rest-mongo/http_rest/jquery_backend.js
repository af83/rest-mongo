
var backend = {};

backend.index = function(RestClass, query, callback, fallback) {
  $.ajax({
    url: RestClass.resource,
    type: 'GET',
    data: query,
    dataType: 'json',
    cache: false,
    success: callback,
    error: function(){
      fallback && fallback();
    }
  });

};


backend.gets = function(RestClass, ids, callback, fallback) {
  $.ajax({
    url: RestClass.resource + '/' + ids.join(','),
    dataType: 'json',
    cache: false,
    success: function(data) {
      if(ids.length == 1) data = [data];
      callback && callback(data);
    },
    error: function(request) {
      if(request.status == 404) return callback && callback([]);
      fallback && fallback();
    }
  });

};


backend.update = function(RestClass, ids, data, callback, fallback) {
  $.ajax({
    url: RestClass.resource + '/' + ids.join(','),
    type: 'PUT',
    data: JSON.stringify(data),
    dataType: 'json',
    cache: false,
    success: function(data) {
      callback && callback();
    },
    error: function(){
      fallback && fallback();
    }
  });
};


backend.delete_ = function(RestClass, ids, callback, fallback) {
  $.ajax({
    url: RestClass.resource + '/' + ids.join(','),
    type: 'DELETE',
    cache: false,
    success: function(data) {
      callback && callback();
    },
    error: function(){
      fallback && fallback();
    }
  });
};


backend.insert = function(RestClass, obj, callback, fallback) {
  $.ajax({
    url: RestClass.resource,
    type: 'POST',
    data: JSON.stringify(obj),
    dataType: 'json',
    cache: false,
    success: function(data) {
      callback && callback(data);
    },
    error: function(){
      fallback && fallback();
    }
  });
};


backend.clear_all = function(RestClass, callback, fallback) {
  $.ajax({
    url: RestClass.resource,
    type: 'DELETE',
    cache: false,
    success: function() {
      callback && callback();
    },
    error: function(){
      fallback && fallback();
    }
  });
};


exports.get_backend = function() {
  return backend;
};

