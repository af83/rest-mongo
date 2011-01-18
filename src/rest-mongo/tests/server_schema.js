/** Data schema and methods to be present only on server side.
 * It will extend the base schema.
 * Any method and property declared here wont be vizible on the client side.
 */

exports.schema = {
  "Person": {
    schema: {
      properties: {
        secret: {type: "string"}
      }
    },
    methods: {
      get_same_secrets: function(callback, fallback) {
        // Returns Persons with the same secret as me.
        this.R.Person.index({query: {secret: this.secret}},
                            callback, fallback);
      }
    }
  }
};
