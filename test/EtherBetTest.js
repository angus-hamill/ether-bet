const truffleAssert = require('truffle-assertions');
const EtherBet = artifacts.require('EtherBet');
const BN = web3.utils.BN;

const oneDay = 24 * 60 * 60;

contract('EtherBet', async () => {
    const betAmount = 1e5;
    const description = "Eth price in cents in 24 hours";
    let etherBet, accounts;

    before(async () => {
        etherBet = await EtherBet.deployed();
        accounts = await web3.eth.getAccounts();
    });

    context('openMarket()', async () => {
        it('succeeds and initialises values correctly', async () => {
            const betCloseTime = await now() + oneDay;
            await etherBet.openMarket(betCloseTime, betAmount, description);

            assert(new BN(betAmount).eq(await etherBet.betAmount()));
            assert(new BN(betCloseTime).eq(await etherBet.betCloseTime()));

            await advanceTimeDeclareResultAndCloseMarket();
        });

        context('fails', async () => {
            it('if closeTime is in the past', async () => {
                const closeTime = await now() - 1;
                await truffleAssert.reverts(
                    etherBet.openMarket(closeTime, betAmount, description),
                    'Function called too late'
                );
            });

            it('if not called by the owner', async () => {
                await truffleAssert.reverts(
                    etherBet.openMarket(await now() + oneDay, betAmount, description, {from: accounts[1]}),
                    'caller is not the owner'
                );
            });

            it('if a market already exists', async () => {
                await etherBet.openMarket(await now() + oneDay, betAmount, description);
                await truffleAssert.reverts(
                    etherBet.openMarket(await now() + oneDay, betAmount, description),
                    'Function called while in wrong state'
                );

                await advanceTimeDeclareResultAndCloseMarket();
            });
        });
    });

    context('declareResult()', async () => {
        beforeEach(async () => {
            await etherBet.openMarket(await now() + oneDay, betAmount, description);
            await advanceTime(oneDay);
        });

        afterEach(async () => {
            await advanceTimeAndCloseMarket();
        });

        it('succeeds and initialises values correctly', async () => {
            await etherBet.declareResult(30000);

            assert(new BN(30000).eq(await etherBet.result()));
        });

        context('fails', async () => {
            it('if not owner', async () => {
                await truffleAssert.reverts(
                    etherBet.declareResult(0, {from: accounts[1]}),
                    'caller is not the owner'
                );

                await etherBet.declareResult(0);
            });

            it('if already declared', async () => {
                await etherBet.declareResult(0);
                await truffleAssert.reverts(
                    etherBet.declareResult(0),
                    'Function called while in wrong state'
                );
            });
        });
    });

    context('bet()', async () => {
        let bet;

        beforeEach(async () => {
            await etherBet.openMarket(await now() + oneDay, betAmount, description);
            bet = web3.utils.soliditySha3(await createBet(100, accounts[0]));
        });

        it('succeeds', async () => {
            await etherBet.bet(bet, {value: betAmount});

            assert.strictEqual(await etherBet.bets(accounts[0]), bet);
            assert(new BN(betAmount).eq(await etherBet.bettingPool()));

            await advanceTimeDeclareResultAndCloseMarket();
        });

        context('fails', async () => {
            it('if a bet has already been placed', async () => {
                await etherBet.bet(bet, {value: betAmount});
                await truffleAssert.reverts(
                    etherBet.bet(bet, {value: betAmount}),
                    'You have already bet!'
                );

                await advanceTimeDeclareResultAndCloseMarket();
            });

            it('if the amount of eth sent is incorrect', async () => {
                await truffleAssert.reverts(
                    etherBet.bet(bet, {value: betAmount / 2}),
                    'Please place a bet for the correct amount'
                );

                await advanceTimeDeclareResultAndCloseMarket();
            });

            it('if betting has ended', async () => {
                await advanceTimeDeclareResultAndCloseMarket();

                await truffleAssert.reverts(
                    etherBet.bet(bet, {value: betAmount}),
                    'Function called too late'
                );
            });
        });
    });

    context('reveal()', async () => {
        const result = 300;

        beforeEach(async () => {
            await etherBet.openMarket(await now() + oneDay, betAmount, description);
        });

        context('succeeds and initialises values', async () => {
            afterEach(async () => {
                await advanceTimeAndCloseMarket();
            });

            it('with one winner', async () => {
                const bet0 = await createBet(result + 2, accounts[0]);
                await etherBet.bet(web3.utils.soliditySha3(bet0), {from: accounts[0], value: betAmount});
                const bet1 = await createBet(result - 1, accounts[1]);
                await etherBet.bet(web3.utils.soliditySha3(bet1), {from: accounts[1], value: betAmount});
                await advanceTime(oneDay);
                await etherBet.declareResult(result);

                await etherBet.reveal(result + 2, bet0, {from: accounts[0]});
                await etherBet.reveal(result - 1, bet1, {from: accounts[1]});

                assert.strictEqual(await etherBet.winners(0), accounts[1]);
                await truffleAssert.fails(etherBet.winners(1), 'invalid opcode');
            });

            it('with two winners', async () => {
                const bet0 = await createBet(result + 1, accounts[0]);
                await etherBet.bet(web3.utils.soliditySha3(bet0), {from: accounts[0], value: betAmount});
                const bet1 = await createBet(result + 1, accounts[1]);
                await etherBet.bet(web3.utils.soliditySha3(bet1), {from: accounts[1], value: betAmount});
                await advanceTime(oneDay);
                await etherBet.declareResult(result);

                await etherBet.reveal(result + 1, bet0, {from: accounts[0]});
                await etherBet.reveal(result + 1, bet1, {from: accounts[1]});

                assert.strictEqual(await etherBet.winners(0), accounts[0]); 
                assert.strictEqual(await etherBet.winners(1), accounts[1]);
            });
        });
    });

    // TODO: test remaining functions

    async function createBet(betValue, account) {
        const nonce = (await etherBet.nonce()).toNumber();
        const hash = web3.utils.soliditySha3(betValue, nonce);
        return web3.eth.sign(hash, account);
    }

    async function advanceTimeAndCloseMarket() {
        await advanceTime(oneDay);
        await etherBet.closeRevealing();
    }

    async function advanceTimeDeclareResultAndCloseMarket() {
        await advanceTime(oneDay);
        await etherBet.declareResult(0);
        await advanceTimeAndCloseMarket();
    }
});

async function now() {
    return (await web3.eth.getBlock('latest')).timestamp;
}

function advanceTime(_increment) {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_increaseTime',
      params: [_increment],
      id: 0
    }, (err) => {
      if (err != null) console.log(err);
    });
}