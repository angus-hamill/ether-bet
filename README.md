# ETHER BET

'Closest guess wins' blind betting game.

Users bet ETH on a value that's revealed after a certain period.
Bets take the form of `sign(keccak256(betValue, nonce))` where `betValue` is the value you wish to bet on and `nonce` is a value emitted by the contract on creation of that betting market.