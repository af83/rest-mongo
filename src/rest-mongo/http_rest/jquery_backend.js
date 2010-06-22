
var backend = {};

backend.index = function(RestClass, query, callback, fallback) {
  console.log("index");
  $.ajax({
    url: RestClass.resource,
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
  console.log('gets');
  $.ajax({
    url: RestClass.resource + '/' + ids.join(','),
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

backend.update = function(RestClass, ids, data, callback, fallback) {
  console.log("update");
  $.ajax({
    url: RestClass.resource + '/' + ids.join(','),
    type: 'POST',
    data: data,
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
  console.log('delete');
};


backend.insert = function(RestClass, obj, callback, fallback) {
  console.log('insert');
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
  console.log('clear_all');
  callback();
};


exports.get_backend = function() {
  return backend;
};

