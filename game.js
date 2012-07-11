var _ = require("underscore");

exports.Game = (function() {
    
    var dck = require("./deck.js");

    var nextGameId = 0;

    var Game = function() {
        //constructor
        this.id = nextGameId++;
        this.members = [];
        this.deck = new dck.Deck();
        this.round = 0; // 0 == not started
        this.dealer = null;

        this.roundState = Game.RoundState.Bidding;
        this.handLeader = null;
        this.handLeadSuit = null;
        this.handNumber = 0; // 0 == not started
        this.handTrump = null;

        this.currentPlayerTurn = null;
        // this is the current hand winner, not the person with the most points
        this.winning = {
            player: null,
            card: null
        };

        this.forClient = function() {
            return {
                "id": this.id,
                "members": _.map(this.members, function(m){ return m.forClient(); })
            };
        };

        this.addPlayer = function(player) {
            if (this.members.length >= this.maxPlayers) {
                player.socket.emit('news', { alert: 'too many players'});
								return;
						} else if (this.round !== 0) {
								player.socket.emit('news', { alert: 'game already started'});
								return;
            } else {
                for (var ii in this.members) {
                    this.members[ii].socket.emit("otherPlayerJoined", { name: player.name, id: player.socket.id });
                    console.log(this.members[ii].name);
                    player.socket.emit("otherPlayerJoined", {name: this.members[ii].name, id: this.members[ii].socket.id});
                }

                this.members.push(player);

                player.socket.broadcast.emit("playerJoinedGame", {
                    "game": this.forClient()
                });
                player.currentGame = this;
                player.socket.emit("joined", { joined: this.id });
                player.socket.emit("status", { msg: "Joined game " + this.id });
            }

        };

        this.startRound = function(roundNum) {
            console.log("starting round " + roundNum);
            this.round = roundNum;
            this.deck.renew();
            this.deck.shuffle(1);
            this.winning.player = null;
            this.winning.card = null;
            this.currentPlayerTurn = this.dealer;
            this.handNumber = 1;
            this.roundState = Game.RoundState.Bidding;
            advanceTurn(this);
            this.handLeader = this.currentPlayerTurn;

            if (!isFinalRound(this)) {
                this.handTrump = this.deck.deal(1)[0];
            } else {
                this.handTrump = null;
            }
            if (this.handTrump.rank === "W") {
                //Prompt Dealer for trump
                this.dealer.socket.emit("pickTrump", { currentTrump: "W"});
            }
            for (var ii = 0; ii < this.members.length; ii++) {
                this.members[ii].cards = this.deck.deal(roundNum);
                this.members[ii].socket.emit("roundStarted", {
                    dealer: this.dealer.name,
                    roundNum: roundNum,
                    hand: this.members[ii].cards,
                    trump: this.handTrump
                });
            }

            promptNextAction(this);
        };

        this.startGame = function() {
            console.log("starting game");
            this.dealer = this.members[0];
            this.startRound(1);
        };
        
        this.placeBid = function(player, bidAmount) {
            if (this.roundState == Game.RoundState.Bidding) {
                if (this.currentPlayerTurn == player) {
                    console.log("placing bid of " + bidAmount + " for player " + player.name);
                    player.currentRoundBid = bidAmount;
                    
                    if (this.currentPlayerTurn == this.dealer) {
                        this.roundState = Game.RoundState.Playing;
                    }

                    advanceTurn(this);

                    this.emitToMembers("bidPlaced", {
                        "player": player.name,
                        "bid": bidAmount,
                        "biddingOver": this.roundState == Game.RoundState.Playing
                    });

                    promptNextAction(this);
                }
            }
        };
        
        this.emitToMembers = function(eventName, data) {
            for (var ii = 0; ii < this.members.length; ii++) {
                this.members[ii].socket.emit(eventName, data);
            }
        };

        this.playCard = function(player, card) {
            // a few sanity checks first, to prevent malicious cheaters :)
            if (this.roundState == Game.RoundState.Playing) {

                if (this.currentPlayerTurn == player) {
                    var playerHasCard = false;
                    var cardPosInHand = -1;
                    var crds = player.cards;
                    for (var i = 0; i < crds.length; i++) {
                        if (crds[i].rank == card.rank && crds[i].suit == card.suit) {
                            playerHasCard = true;
                            cardPosInHand = i;
                            break;
                        } 
                    }
                    if (playerHasCard) {
                        crds.splice(cardPosInHand, 1); // remove the card from the player's hand
                        console.log("WIZARD - " + "card " + card.rank + card.suit + " played by " + player.name);
                        player.currentCardPlayed = card;
                        if (!getCurrentWinner( this, player, card )) {
                            player.socket.emit("reneg", { "card": card });
                            return; // card was not allowed
                        }
                        this.emitToMembers("cardPlayed",
                            { 
                                "player": player.name, 
                                "card": card,
                                "winner": { "player": this.winning.player.name, "card": this.winning.card }
                            });
                        advanceTurn(this);

                        if (this.currentPlayerTurn === this.handLeader) {
                            console.log("hand over");
                            this.winning.player.currentRoundTricksTaken++;
                            this.emitToMembers("handOver", { "winner": this.winning.player.name, "card": this.winning.card });

                            if (this.handNumber == this.round) {
                                console.log("round over");
                                evaluateRoundScores( this );
                                this.emitToMembers("scoreUpdate", {
                                    round: this.round,
                                    scores: this.members.map(function(member) { return { "player": member.name, "score": member.score, "id" : member.socket.id }; })
                                });
                                if (isFinalRound( this )) {
                                    console.log("game over");
                                    var gameWinners = evaluateGameWinners(this);
                                    var winnerNames = [];
                                    for (var ii = 0; ii < gameWinners.length; ii++) {
                                        winnerNames.push(gameWinners[ii].name);
                                    }
                                    this.emitToMembers("gameOver", { winners: winnerNames });
                                } else {
                                    advanceDealer(this);
                                    this.startRound(++this.round);
                                }
                            } else {
                                this.handNumber++;
                                this.handLeader = this.winning.player;
                                this.handLeadSuit = null;
                                this.currentPlayerTurn = this.winning.player;
                                promptNextAction(this);
                            }
                            
                            this.winning.player = null;
                            this.winning.card = null;
                        } else {
                            console.log("hand not over, advancing to next player");
                            promptNextAction(this);
                        }
                    }
                }
            }
        };
    };

    Game.prototype = {
        isActive:false,
        maxPlayers: 6
    };

    Game.RoundState = {
        Bidding: 0,
        Playing: 1
    };

    var evaluateRoundScores = function( game ) {
        for (var i = 0; i < game.members.length; i++) {
            var player = game.members[i];
						if ( player.currentRoundBid == player.currentRoundTricksTaken ) {
                player.score += (2 + player.currentRoundTricksTaken);
								
            } else {
                player.score += -(Math.abs(player.currentRoundBid - player.currentRoundTricksTaken));
            }
        }
    };

    var evaluateGameWinners = function ( game ) {
        var highScore = game.members[0].score;
        var winners = [game.members[0]];
        for (var i = 1; i < game.members.length; i++){
            if (game.members[i].score > highScore) {
                highScore = game.members[i].score;
                winners = [game.members[i]];
            } else if (game.members[i].score == highScore) {
                winners.push(game.members[i]);
            }
        }
        return winners;
    };

    var getPlayerAfter = function(game, player) {
        var nextPosition = game.members.indexOf(player) + 1;
        if (nextPosition == game.members.length) {
            nextPosition = 0;
        }

        //console.log("WIZARD - " + "advancing to player " + game.members[nextPosition].name + " at position " + nextPosition);

        return game.members[nextPosition];
    };

    var advanceTurn = function(game) {
        game.currentPlayerTurn = getPlayerAfter(game, game.currentPlayerTurn);

        console.log("WIZARD - " + "advanced turn to " + game.currentPlayerTurn.name);
    };

    // Returns true if the card was a valid play. Modifies the game.winning object.
    var getCurrentWinner = function( game, player, card ) {
        if ( game.winning.player === null || game.winning.card === null ) {
            console.log("first hand of round, so this card wins");
            game.winning.player = player;
            game.winning.card = card;
            if (card.rank == 'W') {
                console.log("wizard played first, so no suit must be followed");
                game.handLeadSuit = 'W';
            } else if (card.rank != 'X') {
                console.log("set suit that must be followed: " + card.suit);
                game.handLeadSuit = card.suit;
            } else {
                console.log("jester played first, suit will be set by next non-jester");
            }
            return true;
        }

        //fun stuff here 
        //A = 14, J = 11, Q = 12, K = 13, W = 15, X = 1
        var nRank = getNumericRank(card.rank);
        var wRank = getNumericRank(game.winning.card.rank);

        // This should take care of wizards played after wizards and jesters played after jesters.
        // In both cases the currently winning player does not change.
        if (nRank == wRank && (nRank == 15 || nRank == 1)) {
            console.log("wizard after wizard or jester after jester");
            return true;
        }

        // ...otherwise wizards always win and previously played jesters always lose
        if (nRank == 15 || wRank == 1) {
            console.log("wizard played or jester was previous winner");
            game.winning.player = player;
            game.winning.card = card;
            if (!game.handLeadSuit && nRank == 15) {
                game.handLeadSuit = 'W';
                console.log("wizard played after starting jester(s), so no suit must be followed");
            }
            return true;
        }

        // corollary: previously played wizards keep winning, and currently-played jesters lose
        if (wRank == 15 || nRank == 1) {
            console.log("wizard was previous winner or jester played");
            return true;
        }

        // Now we're through any logic with wizards or jesters. Neither was winning or just got played.
        // So we can check for reneging
        if (game.handLeadSuit && game.handLeadSuit != 'W') {
            var playerHasSuitWithCard = null;
            for (var i = 0; i < player.cards.length; i++) {
                if (player.cards[i].suit == game.handLeadSuit && player.cards[i].rank != "W" && player.cards[i].rank != "J") {
                    playerHasSuitWithCard = player.cards[i].rank + player.cards[i].suit;
                    break;
                }
            }
            if (playerHasSuitWithCard && game.handLeadSuit != card.suit) {
                // Player is reneging!
                console.log("player regened! They could play " + playerHasSuitWithCard);
                return false;
            }
        }

        // This will get hit if the hand starts with jesters
        if (!game.handLeadSuit) {
            console.log("set hand suit (that must be followed) to " + card.suit);
            game.handLeadSuit = card.suit;
        }

        // If playing the same suit as the current winner, you just need to go higher
        if (card.suit == game.winning.card.suit) {
            console.log("same suit...");
            if (nRank > wRank) {
                console.log(" and higher!");
                game.winning.player = player;
                game.winning.card = card;
            }
            return true;
        }

        // You're playing a different suit, so you win if you trump
        if (game.handTrump && game.handTrump.rank != "X" && game.handTrump && card.suit == game.handTrump.suit){
            console.log("trumped!");
            game.winning.player = player;
            game.winning.card = card;
            return true;
        }

        return true;
    };

    var rankMap = {
        "W": 15,
        "A": 14,
        "K": 13,
        "Q": 12,
        "J": 11,
        "X": 1
    };

    var getNumericRank = function( rank ) {
        return parseInt(rankMap[rank] || rank, 10);
    };

    var advanceDealer = function(game) {
        game.dealer = getPlayerAfter(game, game.dealer);

        console.log("WIZARD - " + "advanced dealer to " + game.dealer.name);
    };

    var isFinalRound = function(game) {
        // For testing end-of-game logic easily
        //return game.round == 2;
        return 60 / game.members.length == game.round;
    };

    var promptNextAction = function(game) {
        if (game.roundState == Game.RoundState.Bidding) {
            console.log("WIZARD - " + "asked player " + game.currentPlayerTurn.name + " for bid");
            game.currentPlayerTurn.socket.emit("readyForBid");
            emitToEveryoneElse(game, game.currentPlayerTurn, "waitingForBid", { player: game.currentPlayerTurn.name });
        } else {
            console.log("WIZARD - " + "asked player " + game.currentPlayerTurn.name + " for card");
            game.currentPlayerTurn.socket.emit("readyForCard");
            emitToEveryoneElse(game, game.currentPlayerTurn, "waitingForCard", { player: game.currentPlayerTurn.name });
        }
    };

    var emitToEveryoneElse = function(game, player, eventName, data) {
        for (var ii = 0; ii < game.members.length; ii++) {
            if (game.members[ii] != player) {
                game.members[ii].socket.emit(eventName, data);
            }
        }
    };

    return Game;
}());

