# rest-mongo
A JS ORM for nodejs / mongo-db and/or the browser.

## Intro

RestMongo works by letting you describe your data using a JSON schema and then 
provides you high level objects which can be created / updated / deleted /
retrieved using an easy-to-use API.
The core functionalities work on both node and the browser. There are different 
backends, wether you want to plug to a mongodb, a REST API, etc.

## Examples

### A Schema describing a person
<pre><code>
var schema = {
  "Person": {
    resource: '/people',
    schema: {
      id: "Person",
      description: "someone, blablabla",
      type: "object",
       
      properties: {
        firstname: {type: "string"},
        friends: {type: "array", items: {"$ref": "Person"}},
        mother: {"$ref": "Person"}
      }
    }
  }
};
</code></pre>

The schema describes a document. It can have references or list of references to
other documents.

### Get a unit of work (we call it 'R'):
<pre><code>
var rest_mongo = require("rest-mongo");
var RFactory = rest_mongo.getRFactory(schema, "db_name");
var R = RFactory();
</code></pre>

Get a new R every time you need to get a new context to work in (at every client request for example).

### Create and save an object into the DB
<pre><code>
var lilly = new R.Person({firstname: "Lilly"});
lilly.save(function() {
  sys.puts("Lilly saved in DB with id " + lilly.id());
});
</code></pre>

### Get one or more objects from DB
<pre><code>
R.Person.get({
 ids: lilly.id()
}, function(lilly2){
  // lilly and lilly2 are the same
});
</code></pre>

### Search in DB
<pre><code>
R.Person.index({
 query: {firstname: "Lilly"}
}, function(data){
  var lilly = data[0];
});
</code></pre>

### Delete an object
<pre><code>
lilly.delete_(function(){
  sys.puts('Lilly deleted from DB!');
}, function() {
  sys.puts('You can not delete Lily!');
});
</code></pre>

### Usage of references:
<pre><code>
var harry = new R.Person({firstname: "Harry", mother: lilly});
harry.save(function() {
  sys.puts('Only the id of Lilly has been saved in harry.mother in DB.');
});
</code></pre>

### Update more than one object in once:
<pre><code>
R.Person.update({
  ids: [lilly.id(), harry.id()], 
  data: {firstname: 'anonymous'}
}, function() {
  sys.puts("Voldemort cannot find them anymore...");
});
</code></pre>


### Save more than one object in once:
<pre><code>
var p1 = new R.Person({firstname: 'Hermione'});
var p2 = new R.Person({firstname: 'Ron'});
R.save([p1, p2], function() {
  console.log('Now Harry has friends.')
}, function(error) {
  console.log('Harry has no friends, because of ', error);
});
</code></pre>


### Delete more than one object in once:
<pre><code>
R.Person.remove({
  firstname: 'anonymous'
}, function() {
  console.log('There is no more anonymous person in DB.');
});

R.Person.remove({}, function() {
  console.log('No more person object in DB.');
}, function(error) {
  console.error('Could not remove all persons from DB.');
});
</code></pre>


## Connect middleware

rest-mongo also provides you with a connect middleware which can serve your data over
a REST API using the provided schema.

### Starting a REST server on the port 8888
<pre><code>
var connector = rest_server.connector(RFactory, schema);
server = http.createServer(function(req, resp) {
  connector(req, resp, function() {
    res.writeHead(404, {}); res.end();
  });
});
server.listen(8888);
</code></pre>

If is now possible to get the list of Person objects doing a GET HTTP request on localhost:8888/people


### Authorization
It is possible to specify a third argument auth_check when calling the connector 
function.
This argument should be a function. If provided, it will be called to check
if rest-mongo can reply to the request or not. The function signature is:

  auth_check(req, res, next, info)

  - req: nodejs req obj.
  - res: nodejs res obj.
  - next: to be called if ok to continue serving the request.
  - info: hash containing 'pathname', 'method', and 'data' attrs.



## Installation

This version has been tested on: 

  * [node](http://nodejs.org/) (v0.3.0)
  * [node-mongodb-native](http://github.com/christkv/node-mongodb-native/)
  * [mongodb](http://www.mongodb.org/display/DOCS/Downloads) (1.6.1 and 1.4.2)
  * [nodetk](http://github.com/AF83/nodetk)

node-mongodb-native and nodetk are vendorized through git submodules:
`$ git submodule update --init`

To run the tests: `nodetests`
Please have a look at the nodetk README file to install nodetk.



## License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see [http://www.fsf.org/licensing/licenses/agpl-3.0.html](http://www.fsf.org/licensing/licenses/agpl-3.0.html)

