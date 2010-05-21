# rest-mongo
A JS ORM for nodejs and mongo-db

## Intro

rest-js is a wrapper around node-mongodb-native for easier use of MongoDB from nodejs.
It provides high level functions to interact with your objects, which are generated from a JSON schema.

## Examples

### A Schema describing a person
<pre><code>
var schema = {
  "Person": {
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

### Update more than one field in once:
<pre><code>
R.Person.update({
  ids: [lilly.id(), harry.id()], 
  data: {firstname: 'anonymous'}
}, function() {
  sys.puts("Voldemort cannot find them anymore...");
});
</code></pre>


## Installation

This version needs: 

  * [node-mongodb-native](http://github.com/christkv/node-mongodb-native/) (at the exact version V0.7.1 - V0.7.2 to V0.7.4 are not working)
  * [mongodb](http://www.mongodb.org/display/DOCS/Downloads) (1.4.2 - The 1.5 serie doesn't seem to work fine yet...)
  * [nodetk](http://github.com/AF83/nodetk)

node-mongodb-native and nodetk are vendorized through git submodules:
  $ git submodule update --init

To run the tests:
  nodetests
Please have a look at the nodetk README file to instlal nodetk.



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

