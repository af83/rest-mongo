

var run_tests = function() {
  var tests_runner = require('nodetk/testing/tests_runner');
  tests_runner.run([
    'rest-mongo/tests/test_rest-mongo',
  ]);
};

console.log('run tests...')
run_tests();

