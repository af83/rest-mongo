var rest_mongo = require("rest-mongo/core");

var assert = require("nodetk/testing/custom_assert");
var debug = require('nodetk/logging').debug;
var utils = require('nodetk/utils');


var schema = require('./schema').schema;
var server_schema;
var backend;
if(process.browser) {
  var jbackend = require('rest-mongo/http_rest/jquery_backend');
  backend = jbackend.get_backend({additional_params: {token: "secret_token"}});
}
else {
  // Note: we can not use "XHR + eval" import on browser side
  // because of this conditionnal import
  var mongo_backend = require('rest-mongo/mongo_backend');
  backend = mongo_backend.get_backend({db_name: 'test-rest-mongo'});
  server_schema = require('./server_schema').schema
}

var R = rest_mongo.getRFactory(schema, backend, {
  additional_schema: server_schema
})();

exports.setup = function(callback) {
  R.Person.remove(callback);
};

exports.tests = [

['Create factory with bad args', 2, function() {
  assert.throws(function() {
    rest_mongo.getRFactory();
  });
  assert.throws(function() {
    rest_mongo.getRFactory(schema);
  });
}],

['An object can see its R', 1, function() {
  // 
  var p = new R.Person();
  assert.equal(p.R, R);
}],

['Create obj', 2, function() {
  // Create an object, check it has an id
  // Try to fetch it back, ensure it's the same
  var p1 = new R.Person();
  p1.firstname = "Pierre";
  p1.save(function(p) {
    assert.ok(Boolean(p.id));

    R.Person.get({ids: p.id}, function(data) {
      //console.log('Person back from db: ' + JSON.stringify(data));
      // TODO: check defaults are correctly sets, and eventual validation is done .
      assert.equal(data.firstname, 'Pierre');
    });
  });
}],

['Update one obj with save()', 6, function() {
  // Update an already existing object
  var p1 = new R.Person({firstname: 'Pierre'});
  p1.save(function(p) {
    assert.equal(p, p1); // really, p and p1 are the same references.
    assert.equal(p.firstname, 'Pierre');
    p.firstname = 'Ori';
    assert.equal(p.firstname, 'Ori'); // in case of getter/setter on the attribute
    p.save(function() {
      assert.equal(p.firstname, 'Ori'); // changed in current obj
      R.Person.get({ids: p.id}, function(p2) {
        assert.equal(p2.firstname, 'Ori'); // changed in DB
        assert.equal(p, p2); // Same reference is returned
      });
    });
  });
}],

['Update more than one object with RestClass.update()', 8, function() {
  var p1 = new R.Person({firstname: 'Pierre'});
  var p2 = new R.Person({firstname: 'Ori'});
  p1.save(function(p12) {
    p2.save(function(p22) {
      assert.equal(p1.firstname, 'Pierre');
      assert.equal(p2.firstname, 'Ori');
      assert.equal(p1, p12);
      assert.equal(p22, p22);
      R.Person.update({ids: [p1.id, p2.id], data: {firstname: 'anonyme'}}, function() {
        assert.equal(p1.firstname, 'anonyme');
        assert.equal(p2.firstname, 'anonyme');
        // Clear the cache and try again, to check db values are right:
        R.Person.clear_cache();
        R.Person.get({ids: [p1.id, p2.id]}, function(data) {
          assert.equal(data[0].firstname, 'anonyme');
          assert.equal(data[1].firstname, 'anonyme');
        });
      });
    });
  });
}],


['Index on RestClass', 4, function() {
  // Create a few objects, and try to get it back with index
  var p1 = new R.Person({firstname: 'Pierre'});
  var p2 = new R.Person({firstname: 'Ori'});
  R.Person.index({}, function(data) {
    assert.equal(data.length, 0);
    R.save([p1, p2], function() {
      R.Person.index({}, function(data) {
        assert.equal(data.length, 2);
      });
      R.Person.index({query: {firstname: 'Pierre'}}, function(data) {
        assert.equal(data.length, 1);
        assert.equal(data[0].firstname, 'Pierre');
      });
    });
  });
}],


['Index on RestClass with sort / limit / skip', 5, function() {
  var p1 = new R.Person({firstname: 'Pierre'});
  var p2 = new R.Person({firstname: 'Ori'});
  var p3 = new R.Person({firstname: 'Louis'});
  R.save([p1, p2, p3], function() {
    // sort:
    var sorting = [['firstname', 'descending']];
    R.Person.index({query: {_sort: sorting}}, function(data) {
      assert.deepEqual(data, [p1, p2, p3]);
    });
    // limit:
    R.Person.index({query: {_limit: 2, _sort: sorting}}, function(data) {
      assert.deepEqual(data, [p1, p2]);
    });
    // another limit:
    R.Person.index({query: {_limit: 1, _sort: sorting}}, function(data) {
      assert.deepEqual(data, [p1]);
    });
    // offset (skip):
    R.Person.index({query: {_skip: 2, _sort: sorting}}, function(data) {
      assert.deepEqual(data, [p3]);
    });
    // limit + skip:
    R.Person.index({query: {_skip: 1, _limit: 1, _sort: sorting}}, function(data) {
      assert.deepEqual(data, [p2]);
    });
  });
}],




['Delete obj', 2, function() {
  // Delete a particular object
  var p1 = new R.Person({firstname: 'Pierre'});
  p1.save(function(p1) {
    var id = p1.id;
    assert.ok(Boolean(id));
    p1.delete_(function(){
      R.Person.get({ids: id}, function(data) {
        assert.equal(data, null);
      });
    });
  });
}],

['Delete on collection with empty list', 1, function() {
  var _delete_ = backend.delete_;
  backend.delete_ = function() {
    assert.ok(false, "Should not be called");
  };
  R.Person.delete_({ids: []}, function() {
    assert.ok(true, 'Must be called.');
    backend.delete_ = _delete_;
  }, function(err) {
    assert.ok(false, "Should not be called:" + err);
  });
}],

['Remove with query', 4, function() {
  // Delete more than one object in once
  var p1 = new R.Person({firstname: 'to_remove'});
  var p2 = new R.Person({firstname: 'to_remove'});
  var p3 = new R.Person({firstname: 'Pierre'});
  R.save([p1, p2, p3], function() {
    // Check objects have been saved (have an id):
    assert.ok(p1.id); assert.ok(p2.id); assert.ok(p3.id);
    R.Person.remove({query: {firstname: 'to_remove'}}, function() {
      R.Person.index({}, function(persons) {
        assert.equal(persons.length, 1);
      });
    }, function(error) {
      assert.ok(false, 'Should not be called.');
    });
  });
}],


['Obj with simple reference at creation', 7, function() {
  var rhea = new R.Person({firstname: "Rhea"});
  rhea.save(function(rhea2) {
    assert.equal(rhea, rhea2);
    var zeus = new R.Person({firstname: "Zeus", mother: rhea});
    zeus.save(function() {
      assert.equal(zeus.mother, rhea);
      R.Person.clear_cache(); // to be sure data is now fetched from db.
      R.Person.index({query: {firstname: "Zeus"}}, function(data) {
        var zeus = data[0];
        assert.equal(zeus.firstname, 'Zeus');
        assert.equal(zeus.mother._pl, true);
        assert.equal(zeus.mother.firstname, undefined);
        R.Person.index({query: {firstname: 'Rhea'}}, function(data) {
          var rhea = data[0];
          assert.equal(zeus.mother, rhea);
          assert.equal(zeus.mother.firstname, 'Rhea');
        });
      });
    });
  });
}],


['Obj with simple reference at modification', 6, function() {
  var rhea = new R.Person({firstname: "Rhea"});
  var zeus = new R.Person({firstname: "Zeus"});
  rhea.save(function() {
    zeus.save(function() {
      zeus.mother = rhea;
      zeus.save(function() {
        assert.equal(zeus.mother, rhea);
        R.Person.clear_cache(); // to be sure data is now fetched from db.
        R.Person.index({query: {firstname: "Zeus"}}, function(data) {
          var zeus = data[0];
          assert.equal(zeus.firstname, 'Zeus');
          assert.equal(zeus.mother._pl, true);
          assert.equal(zeus.mother.firstname, undefined);
          R.Person.index({query: {firstname: 'Rhea'}}, function(data) {
            var rhea = data[0];
            assert.equal(zeus.mother, rhea);
            assert.equal(zeus.mother.firstname, 'Rhea');
          });
        });
      });
    });
  });
}],

['Create obj with no attributes', 9, function() {
  // When something is not set, it must be "undefined", not 'null'.
  var check_attributes = function(p) {
    assert.strictEqual(p.firstname, undefined);
    assert.strictEqual(p.mother, undefined);
    assert.strictEqual(p.friends, undefined);
  }
  var p = new R.Person();
  check_attributes(p);
  p.save(function() {
    check_attributes(p);
    R.Person.clear_cache();
    R.Person.get({ids: p.id}, function(p) {
      check_attributes(p);
    });
  });
}],

['json method on obj', 6, function() {
  var p = new R.Person();
  var count = utils.count_properties(p.json());
  assert.equal(count, 0);
  p.firstname = "Pierre";
  assert.deepEqual(p.json(), {firstname: "Pierre"});
  count = utils.count_properties(p.json());
  assert.equal(count, 1);
  p.save(function() {
    var data = p.json();
    assert.ok(Boolean(data.id));
    assert.equal(data.firstname, "Pierre");
    count = utils.count_properties(p.json());
    assert.equal(count, 2);
  });
}],


['Can add methods to schema', 1, function() {
  var p1 = new R.Person({firstname: 'Pierre'});
  assert.equal("Hello, Pierre", p1.sayHello());
}],

['Server property and method', 3, function() {
  var unexpected_error =  function() {assert.ok(false, "should not be called")};
  var p1 = new R.Person({firstname: 'Pierre', secret: 'somesecret'});
  var p2 = new R.Person({firstname: 'Ori', secret: 'somesecret'});
  R.save([p1, p2], function() {
    var pid1 = p1.id;
    var pid2 = p2.id;
    assert.equal(p1.secret, 'somesecret'); // always have it since we just set it
    R.Person.clear_cache();
    R.Person.get({ids: pid1}, function(p) {
      // if on browser, shouldn't be able to see the secret property:
      // (dropped when registered)
      if(process.browser) {
        assert.equal(p.secret, undefined);
        assert.equal(p.get_same_secret, undefined);
      }
      else {
        assert.equal(p.secret, 'somesecret');
        p.get_same_secrets(function(result) {
          result = result.map(function(p){return p.json()});
          assert.deepEqual(result, [p2.json(), p1.json()]);
        }, unexpected_error);
      }
    }, unexpected_error);
  }, unexpected_error)
}],

];




if(!process.browser) exports.tests = exports.tests.concat([
  // These tests can not run on browser side (not implemented):

['Distinct on RestClass, without query', 1, function() {
  var p1 = new R.Person({firstname: 'Pierre'});
  var p2 = new R.Person({firstname: 'Ori'});
  var p3 = new R.Person({firstname: 'Pierre'});
  R.save([p1, p2, p3], function() {
    R.Person.distinct({key: 'firstname'}, function(vals) {
      var expected = ['Pierre', 'Ori'];
      assert.same_sets(vals, expected);
    });
  });
}],

['Distinct on RestClass, without query', 1, function() {
  var p1 = new R.Person({firstname: 'Pierre'});
  var p2 = new R.Person({firstname: 'Ori'});
  var p3 = new R.Person({firstname: 'Pierre'});
  var p4 = new R.Person({firstname: 'Albert'});
  R.save([p1, p2, p3, p4], function() {
    R.Person.distinct({key: 'firstname', query: {
      firstname: {'$in': ['Pierre', 'Ori', 'Jean']}
    }}, function(vals) {
      var expected = ['Pierre', 'Ori'];
      assert.same_sets(vals, expected);
    });
  });
}],

['Distinct on RestClass, bad key', 1, function() {
  R.Person.distinct({key: null}, function(vals) {
    assert.ok(false, "Should not be called");
  }, function(err) {
    assert.ok(err);
  });
}]

]);

