exports.Deck = (function() {
    var Deck = function () {
        this.cards = [];
        this.suits = ['s','c', 'h', 'd'];
        this.rank = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','W','X'];
    };

    Deck.prototype = {
        // reset the deck to its full, ordered state
        renew: function() {
            var i, j, m;
            m = this.suits.length * this.rank.length;
            this.cards = new Array( m );
            for (i = 0; i < this.suits.length; i++) {
                for (j = 0; j < this.rank.length; j++) {
                    this.cards[i * this.rank.length + j] = new Card(this.rank[j], this.suits[i]);
                }
            }
        },
        shuffle: function(times) {
            var i, j, k;
            var temp;
            
            for (i = 0; i < times; i++) {
                for (j = 0; j < this.cards.length; j++) {
                  k = Math.floor(Math.random() * this.cards.length);
                  temp = this.cards[j];
                  this.cards[j] = this.cards[k];
                  this.cards[k] = temp;
                }
            }
        },
        deal: function(number) {

            if (this.cards.length >= number) {
                return this.cards.splice(0, number);
            } else {
                //overdrawn
            }
            
        }
    };

    return Deck;
}());

var Card = function(rank, suit) {
    this.rank = rank;
    this.suit = suit;
};
