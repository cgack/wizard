;(function(window, socket, undefined) {
    window.Wiz = {};

    Wiz = {
        currentGames: [],
        curGame: null,
        readyForCard: false,
        playerName: "",
        init: function() {
            $("#nameModal").modal({ keyboard: false });
            $("#nameChoice").focus();
            $("#nameChoice").keyup(function(event){
                if(event.keyCode == 13){
                    $("#submitName").click();
                }
            });
            $("#bid").keyup(function(event){
                if(event.keyCode == 13){
                    $("#submitBid").click();
                }
            });
        },
        renderGameList: function () {
            if (Wiz.currentGames) {
                var gamesList = $("#gamesList");
                gamesList.empty();
                if (Wiz.currentGames.length === 0){
                    gamesList.append("<div class='alert alert-info'>No games to join</div>");
                } else {
                    for (var i = 0; i < Wiz.currentGames.length; i++){
                        var gameString = "<div class='alert alert-info'><button href='#' data-gameid='" + Wiz.currentGames[i].id + "' id='game" + Wiz.currentGames[i].id + "' class='join btn btn-primary'>Join</button>game with ";
                        for (var jj = 0; jj < Wiz.currentGames[i].members.length; jj++) {
                            gameString += "<span class='gamePlayer label label-info'>" + Wiz.currentGames[i].members[jj].name + "</span>";
                        }
                        gameString += "</div>";
                        gamesList.append(gameString);
                    }
                }
            }
        },
        getSuitSymbol: function (suitLetter) {
            if (suitLetter == "s") {
                return "\u2660";
            } else if (suitLetter == "c") {
                return "\u2663";
            } else if (suitLetter == "h") {
                return "\u2665";
            } else if (suitLetter == "d") {
                return "\u2666";
            }
        },
        setReadyForCard: function (val) {
            Wiz.readyForCard = val;
            $('.card').toggleClass('card-clickable', val);
        },
        showHand: function(hand) {
            $("#hand").empty();
            for (var ii = 0; ii < hand.length; ii++) {
                var card = hand[ii];
                var cardText = Wiz.getCardText(card);
                var crd = $("<span class='card' id='" + cardText + "'>" + cardText + "</span>")
                            .data(card)
                            .bind("click", (function(cardToPlay) {
                                return function() {
                                    if (Wiz.readyForCard) {
                                        socket.emit("playCard", cardToPlay);
                                        $(this).hide();
                                        Wiz.setReadyForCard(false);
                                    }
                                };
                            })(card));
                $('#hand').append(crd);

            }
            },
        showTrump: function(trump, isDealer) {
            var cardText;
            if (!trump || trump.rank == "X") {
                cardText = "no trump";
            } else if (trump.rank == "W" && isDealer) {
                cardText = trump.rank;
                // TODO: prompt user for trump choice
            } else {
                cardText = trump.rank + Wiz.getSuitSymbol(trump.suit);
            }
            $("#trump").html(cardText);
        },
        getCardText: function(card) {
            if (card.rank == "W" || card.rank == "X") {
                return card.rank;
            } else {
                return card.rank + Wiz.getSuitSymbol(card.suit);
            }
        },
        addActivity: function(msg) {
            $("#activityLog").prepend('<div class="alert">' + msg + '</div>');
        },
        updateGameList: function(game) {
            for (var ii in Wiz.currentGames) {
                if (Wiz.currentGames[ii].id == game.id) {
                    Wiz.currentGames[ii] = game;
                    Wiz.renderGameList();
                    break;
                }
            }
        },
        setStatus: function (msg) {
            $("#statusMsg").removeClass("alert-error").addClass("alert-info").html(msg);
        },
        setStatusAlert: function (msg) {
            $("#statusMsg").removeClass("alert-info").addClass("alert-error").html(msg);
        },
        checkGameStartability: function() {
            if ($("#gameMembers").children().length > 2) {
                $("#shuffle").show();
                $("#shuffleMsg").hide();
            } else {
                $("#shuffle").hide();
                $("#shuffleMsg").show();
            }
        },
        addNameToList: function(name, klass) {
            $("#gameMembers").append("<div class='" + klass + "'>" + name + "</div>");
            Wiz.checkGameStartability();
        },
        removeNameFromList: function(klass) {
            $("#gameMembers").children().each(function() {
                if ($(this).hasClass(klass)) {
                    $(this).remove();
                }
            });
        }

    };

    // Socket io events
    socket.on('news', function (data) {
         if (data.alert === "too many players") {
                alert("This game is full.  Please choose another game.");
            } else if (data.alert === "game already started") {
                alert("This game is in progress.  Choose another game or start a new one.");
            }
        });
      
    socket.on("cards", function( data ) {
        //TODO: remove this?
    });

    socket.on("playerCount", function ( data ) {
        //TODO: remove this?
    });

    socket.on("gameList", function(data) {
        Wiz.currentGames = data.gms;
        Wiz.renderGameList();
    });

    socket.on("reneg", function(data) {
        var cardText = Wiz.getCardText(data.card);
        $("#" + cardText).show();
        alert("You must follow suit");
        Wiz.setReadyForCard(true);
    });

    socket.on("gameInfo", function(data) {
        if (data.joined) {
            $("#home").hide();
            $("#game").show();
            $("#gm-id").html("Game: " + data.joined);
        }
    });

    socket.on("hand", function(data) {
        Wiz.showHand(data.hand);
    });

    socket.on("roundStarted", function(data) {
        console.log(data);
        Wiz.addActivity("round " + data.roundNum + " started, " + data.dealer + " is dealing");
        Wiz.showHand(data.hand);
        Wiz.showTrump(data.trump, (data.dealer === Wiz.playerName));
        $('#shuffle').hide();
        $('#handArea').show();
        $("#trumpArea").show();
    });

    socket.on("waitingForBid", function(data) {
        Wiz.setStatus("waiting for " + data.player + " to bid");
    });

    socket.on("waitingForCard", function(data) {
        Wiz.setStatus("waiting for " + data.player + " to play");
    });

    socket.on("readyForBid", function(data) {
        $("#bidArea").show();
        $("#bid").val("").focus();
        Wiz.setStatusAlert("Your turn to bid");
    });

    socket.on("bidPlaced", function(data) {
       Wiz.addActivity(data.player + " bid " + data.bid);
    });

    socket.on("cardPlayed", function(data){
        var card = data.card;
        var cardText = Wiz.getCardText(card);
        var winnerMsg = ', but ' + data.winner.player + ' is still winning with ' + Wiz.getCardText(data.winner.card);
        if (data.player == data.winner.player) {
            winnerMsg = " and is now winning the hand";
        }
        Wiz.addActivity(data.player + " played card: " + cardText + winnerMsg);
    });

    socket.on("handOver", function(data) {
        Wiz.addActivity(data.winner + " won the hand");
    });

    socket.on("gameOver", function(data) {
        if (data.winners.length == 1) {
            Wiz.addActivity(data.winner[0] + " won the game!");
        } else {
            var nameString = "";
            for (var ii = 0; ii < data.winners.length; ii++) {
                nameString += ", " + data.winners[ii];
            }
            nameString = nameString.substring(2);
            Wiz.addActivity("It's a tie between these players: " + nameString);
        }
    });

    socket.on("readyForCard", function(data) {
        Wiz.setReadyForCard(true);
        Wiz.setStatusAlert("Your turn to play (click a card)");
    });

    socket.on("status", function(data) {
        if (data.msg) {
            $('#statusMsg').html(data.msg);
        }
    });

    socket.on("playerJoinedGame", function(data) {
        Wiz.updateGameList(data.game);
    });

    socket.on("otherPlayerJoined", function(data) {
        Wiz.addNameToList(data.name, data.id);
    });

    socket.on("playerLeftGame", function (data) {
        Wiz.removeNameFromList(data.playerId);
        Wiz.checkGameStartability();
        Wiz.updateGameList(data.game);
    });

    socket.on("gameDestroyed", function (data) {
        Wiz.currentGames.splice(Wiz.currentGames.indexOf(data.game));
        Wiz.renderGameList();
    });

    socket.on("gameCreated", function (data) {
        Wiz.currentGames.push(data.game);
        Wiz.renderGameList();
    });

    socket.on("scoreUpdate", function(data) {
      for (var i = 0; i < data.scores.length; i++) {
            $("." + data.scores[i].id).children().remove();
            $("." + data.scores[i].id).append("<span> score: " + data.scores[i].score);
        }
    });

    socket.on("pickTrump", function(data) {
        $("#trumpModal").modal();
    });

    socket.on("trumpSuit", function(data) {
        Wiz.addActivity("Trump has been choosen to be: " + Wiz.getSuitSymbol(data.suit));
    });
    // EVENTS, etc.

    $(document).on( 'click', '#submitBid' , function() {
        var bidAmount = $("#bid").val();
        if (bidAmount >= 0) {
            socket.emit( 'bid' , { "bidAmount": bidAmount});
            $("#bidArea").hide();
        }
        return false;
    });

    $(document).on("click", ".join", function(){
        Wiz.curGame = $(this).attr("data-gameid");
        socket.emit('joinGame', {id: Wiz.curGame}, function(gameId) {
            $("#home").hide();
            $("#game").show();
            $("#gm-id").html("Game: " + gameId);
            Wiz.curGame = gameId;
        });
    });

    var shuf = document.getElementById( 'shuffle' );
    shuf.addEventListener( 'click' , function() {
        socket.emit( 'deal' );
    }, false);

    document.getElementById( 'createGame' ).addEventListener( 'click' , function() {
        socket.emit('createGame', function(gameId) {
           $("#home").hide();
           $("#game").show();
           $("#gm-id").html("Game: " + gameId);
           Wiz.curGame = gameId;
        });
    });


    $(document).on("click", "#submitName", function(){
        var nameChoice = $("#nameChoice").val();
        if (nameChoice !== "") {
            $("#nameModal").modal("hide");
            Wiz.playerName = nameChoice;
            socket.emit('nameChosen', { name: nameChoice });
            Wiz.addNameToList(nameChoice, socket.socket.sessionid);
        }
    });

    $("[id^=pickSuit]").click(function() {
        var suit = $(this).attr("id").split("_")[1];
        socket.emit("trumpSelected", {trumpSuit: suit});
        $("#trumpModal").modal("hide");
    });


}(window, io.connect()));



$(document).ready(function() {
    Wiz.init();
});