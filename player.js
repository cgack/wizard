exports.Player = (function(){

    var Player = function(socket) {
        this.socket = socket;
        this.currentGame = null;
        this.currentRoundBid = -1;
        this.currentRoundTricksTaken = 0;
        this.score = 0;
        this.currentCardPlayed = null;

        this.forClient = function() {
            return {
                "name": this.name,
                "id": this.socket.id
            };
        };
    };

    Player.prototype = {
        name: "",
        cards: []
        //other stuff
    };

    return Player;

}());

