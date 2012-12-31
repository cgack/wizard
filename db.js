//mongodb://<user>:<password>@linus.mongohq.com:10046/wizard

var mongoose = require("mongoose"),
	config = require("./config.js").settings,
	databaseUrl = config.databaseUrl,
	databaseName = config.databaseName,
	username = config.username,
	password = config.password,
	Schema = mongoose.Schema;


var dbLogin = username + ":" + password;
var dbUrl = databaseUrl;
var dbName = databaseName;

exports.initDB = function()  {
	mongoose.connection.on( "open" , function(){
		console.log("mongoose init");
	});
		mongoose.connect("mongodb://" + dbLogin + "@" + dbUrl + "/" + dbName);
};



// Many thanks to the mongoLab Demo Here
// Queries a MongoDB collection to retrieve data based on
// properties supplied by json parameter.
//
exports.query =  function(collectionIdent, json, callback) {
    mongoose.connection.db.collection(collectionIdent, function (err, collection) {
        collection.find(json).toArray(callback);
    });
};


//
// Inserts into a MongoDB collection and returns inserted data
//
exports.insert = function(collectionIdent, json, callback) {
    mongoose.connection.db.collection(collectionIdent, function (err, collection) {
        collection.insert(json);
	});
};