var express = require("express"),
    app = express(),
    http = require("http"),
    server = http.createServer(app),
    io = require("socket.io").listen(server),
    ply = require("./player.js"),
    gm = require("./game.js"),
    db = require("./db.js"),
    bcrypt = require("bcrypt"),
    players = {},
    games = [];
/* USE FOR Heroku until they support full websocket implementation */
io.configure(function() {
    io.set('transports', ['xhr-polling']);
    io.set('polling duration', 10);
    /* ACCORDING THE HEROKU WE DON'T NEED THIS io.set('log level', 1); */
});

server.listen(process.env.PORT || 8080); //8080

app.get("/", function( req, res ) {
    res.sendfile(__dirname + "/index.html");
});
app.get("/test", function(req, res) {
    res.sendfile(__dirname + req.url + "/index.html");
});

app.use(express.static(__dirname));

//initialize the db connection
db.initDB();
//init models?
var mongoose = require("mongoose"),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var oUser = new Schema({
    userid : ObjectId,
    username : String,
    pwHash : String
});

var User = mongoose.model("User", oUser);

io.sockets.on('connection', function (socket) {
    //intialize the players as they join the site
    //console.log(players);
    console.log("new socket - " + socket.id);
    //console.log(games);
    var player = new ply.Player(socket, "");
    players[socket.id] = player;
    //send the users the games
    var gms = [];
    for (var i in games) {
        gms.push(games[i].forClient());
    }
    socket.emit("gameList", { gms: gms });
    //this should work \/\/
    socket.broadcast.emit("playerCount", {cnt: 42});
    socket.on('disconnect', function () {
        for (var ii = 0; ii < games.length; ii++) {
            if (games[ii].members.indexOf(player) >= 0) {
                games[ii].emitToMembers("playerLeftGame", { id: socket.id });
            }
        }
        if (player.currentGame) {
            // TODO: this player was in a game! What do we do?!
            // Ask the other players if they want to continue the game? Just continue without asking?
            // At the very least, we need to see if it was this player's turn and update variables accordingly.
            // And delete the game if they were the last player to quit
            var game = player.currentGame;
            game.members.splice(game.members.indexOf(player), 1);
            if (game.members.length === 0) {
                games.splice(games.indexOf(game));
                socket.broadcast.emit("gameDestroyed", { game: game.forClient() });
            }
            socket.broadcast.emit("playerLeftGame", {
                "playerId": socket.id,
                "game": game.forClient()
            });
        }
        delete players[socket.id];
    });

    //  TODO:  since we can talk to our monogDB instance now we need ot use https://github.com/ncb000gt/node.bcrypt.js/
    //  or similar to encrypt our users pwd using the genSalt method that way we can get returning userz
    //  this also means we'll want to get rid of the prompt and make a login button (i think):w
    socket.on('nameChosen', function (data) {
        player.name = data.name;
        
        User.findOne({username: data.name}, function(err, usrData) {
                if (usrData === null) {
                    //create
                    bcrypt.genSalt(10, function(err, salt) {
                        
                        bcrypt.hash(data.pwd, salt, function(err, hash) {
                            console.log("hash: " + hash);
                            console.log("salt: " + salt);
                            console.log("usrnm:" + player.name);
                            var newUser = new User({ username: player.name, pwHash: hash });
                            newUser.save(function(err) {
                                if (err) {
                                    console.log("err: " + err);
                                    socket.emit("userAuthFailure", {name: player.name, message: err});
                                    return;
                                }
                                socket.emit("userAuthSuccess", {name: player.name});
                            });
                        });
                    });
                    
                } else {
                    console.log("this user exists: " + usrData);
                    //emit to client
                    socket.emit("userAuthFailure", {name: player.name, message: "User already exists"});
                }
        });


    });

    socket.on('signIn', function (data) {
        player.name = data.name;
        
        User.findOne({username: data.name}, function(err, usrData) {
                if (usrData === null) {
                    //user does not exist check username
                    console.log("user doesn't exist");
                    socket.emit("userAuthFailure", {name: player.name, message: "User does not exist"});

                } else {
                    //Check if pwd matches
                    bcrypt.compare(data.pwd, usrData.pwHash, function(err, res) {
                        if (res) {
                            //sign in success
                            socket.emit("userAuthSuccess", {name: player.name});
                        } else {
                            if (err) {
                                socket.emit("userAuthFailure", {name: player.name, message: err});
                            } else {
                                socket.emit("userAuthFailure", {name: player.name, message: "Invalid username or password"});
                            }
                        }

                        
                    });
                }
        });

    });
    
    //join a game
    socket.on("joinGame", function(data, callback) {
        console.log(data);
        game = getGameById(data.id);

        game.addPlayer(player);

        callback(game.id);
    });
    
    socket.on("createGame", function(callback) {
        var newGame = new gm.Game();
        console.log("WIZARD - " + 'created new game with id ' + newGame.id);
        games.push(newGame);
        newGame.addPlayer(player);
        callback(newGame.id);
        socket.broadcast.emit("gameCreated", { game: newGame.forClient() });
    });

    socket.on("deal", function() {
        console.log("WIZARD - " + 'dealing....');
        player.currentGame.startGame();
    });

    socket.on("bid", function(data) {
        player.currentGame.placeBid(player, data.bidAmount);
    });

    socket.on("playCard", function(data) {
        player.currentGame.playCard(player, data);
    });

    socket.on("trumpSelected", function(data) {
        if (player.currentGame) {
            game = player.currentGame;
            game.handTrump.rank = "W";
            game.handTrump.suit = data.trumpSuit;
            game.emitToMembers("trumpSuit", {suit: data.trumpSuit});
        }
    });
});

var getGameById = function(id) {
  for (var i in games) {
      if (games[i].id == id + '') {
          return games[i];
      }
  }
  return undefined;
};

