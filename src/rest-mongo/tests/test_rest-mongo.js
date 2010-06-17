require.paths.unshift(__dirname + '/../../');

var rest_mongo = require("rest-mongo/core");

var sys = require("sys");
var assert = require("nodetk/testing/custom_assert");
var debug = require('nodetk/logging').debug;
var utils = require('nodetk/utils');


var schema = require('rest-mongo/tests/schema').schema;
var R = rest_mongo.getRFactory(schema, {db_name: 'test-rest-mongo'})();

exports.setup = function(callback) {
  R.Person.clear_all(callback);
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

['Create obj', 2, function() {
  // Create an object, check it has an id
  // Try to fetch it back, ensure it's the same
  var p1 = new R.Person();
  p1.firstname = "Pierre";
  p1.save(function(p) {
    assert.ok(Boolean(p.id));

    R.Person.get({ids: p.id}, function(data) {
      //sys.debug('Person back from db: ' + JSON.stringify(data));
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
  // using offset, limit and search params
  var p1 = new R.Person({firstname: 'Pierre'});
  var p2 = new R.Person({firstname: 'Ori'});
  R.Person.index({}, function(data) {
    assert.equal(data.length, 0);
    p1.save(function() {
      p2.save(function() {
        R.Person.index({}, function(data) {
          assert.equal(data.length, 2);
        });
        R.Person.index({query: {firstname: 'Pierre'}}, function(data) {
          assert.equal(data.length, 1);
          assert.equal(data[0].firstname, 'Pierre');
        });
      });
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

];

