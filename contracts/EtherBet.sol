pragma solidity ^0.5.8;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./ECDSA.sol";

contract EtherBet is Ownable {

    enum State {
        Closed,
        Betting,
        Revealing
    }

    event MarketOpen(uint nonce, uint closeTime, uint betAmount, string description);

    event Result(uint result);

    event RevealingClosed(address[] winners);

    uint256 constant UINT256_MAX = ~uint256(0);

    uint public constant revealingPeriod = 1 days;

    uint public nonce;

    uint public betAmount;

    uint public betCloseTime;

    uint public revealCloseTime;

    mapping(address => bytes32) public bets;

    address[] betters;

    uint public bettingPool;

    uint public result;

    mapping(address => uint) public winnings;

    address[] public winners;

    uint public currentWinningBet;

    State public state = State.Closed;

    modifier onlyAfter(uint _time) {
        require(now >= _time, "Function called too early.");
        _;
    }
    
    modifier onlyBefore(uint _time) {
        require(now <= _time, "Function called too late.");
        _;
    }

    modifier onlyWithState(State _state) {
        require(_state == state, "Function called while in wrong state");
        _;
    }

    // TODO: put some sort of restriction on the max value of _closeTime - now
    function openMarket(uint _closeTime, uint _betAmount, string memory _description)
        public
        onlyOwner
        onlyBefore(_closeTime)
        onlyWithState(State.Closed)
    {
        betCloseTime = _closeTime;
        betAmount = _betAmount;
        state = State.Betting;
        nonce++;

        emit MarketOpen(nonce, betCloseTime, betAmount, _description);
    }

    // TODO: Use chainlink oracle to get result (possibly a way to avoid an owner refusing to call this)
    function declareResult(uint _result)
        public
        onlyOwner
        onlyAfter(betCloseTime)
        onlyWithState(State.Betting)
    {
        result = _result;
        currentWinningBet = UINT256_MAX;
        revealCloseTime = now + revealingPeriod;
        state = State.Revealing;
        emit Result(_result);

        // Make the owner temporarily the winner in case no-one reveals
        winners.push(owner());
        delete betAmount;
        delete betCloseTime;
    }

    function closeRevealing()
        public
        onlyAfter(revealCloseTime)
        onlyWithState(State.Revealing)
    {
        uint winAmount = bettingPool / winners.length;

        for (uint i = 0; i < winners.length; i++) {
            winnings[winners[i]] += winAmount;
        }

        emit RevealingClosed(winners);

        // Clean up
        state = State.Closed;
        for (uint i = 0; i < betters.length; i++) {
            delete bets[betters[i]];
        }
        delete betters;
        delete bettingPool;
        delete revealCloseTime;
        delete winners;
        delete currentWinningBet;
        delete result;
    }

    function bet(bytes32 _bet)
        public payable
        onlyBefore(betCloseTime)
        onlyWithState(State.Betting)
    {
        require(bets[msg.sender] == bytes32(0), "You have already bet!");
        require(msg.value == betAmount, "Please place a bet for the correct amount");

        bets[msg.sender] = _bet;
        betters.push(msg.sender);
        bettingPool += betAmount;
    }

    function reveal(uint _betValue, bytes memory _secret)
        public
        onlyWithState(State.Revealing)
    {
        require(keccak256(abi.encodePacked(_secret)) == bets[msg.sender], "Secret must match bet");
        bytes32 betHash = keccak256(abi.encodePacked(_betValue, nonce));
        require(ECDSA.recover(betHash, _secret) == msg.sender, "Sender must be signer");

        uint difference;
        if (_betValue < result) {
            difference = result - _betValue;
        } else {
            difference = _betValue - result;
        }

        require(difference <= currentWinningBet, "Bet must be better than current winner");
        if (difference < currentWinningBet) {
            delete winners;
        }

        currentWinningBet = difference;
        winners.push(msg.sender);
    }

    function withdraw() public {
        uint withdrawAmount = winnings[msg.sender];
        require(withdrawAmount > 0, "You do not have any winnings");

        winnings[msg.sender] = 0;
        msg.sender.transfer(withdrawAmount);
    }
}