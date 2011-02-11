/** Data schema used to test DB.
 */

exports.schema = {
    "Person": {
      resource: "/people",
      schema: {
        id: "Person",
        description: "someone, blablabla",
        type: "object",
       
        properties: {
          id: {type: "integer"},
          firstname: {type: "string"},
          friends: {type: "array", items: {"$ref": "Person"}},
          mother: {"$ref": "Person"}
        }
      },
      methods: {
        sayHello: function() {
          return "Hello, "+ this.firstname;
        }
      }
    },

    // This one is just here so we know there is no interference between objects
    "Animal": {
      resource: "/animals",
      schema: {
        id: "Animal",
        description: "Dogs, cats, ...",
        type: "object",

        properties: {
          name: {type: "string"},
          owner: {'$ref': 'Person'}
        }
      }
    }
};

