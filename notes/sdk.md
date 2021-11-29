{
provider: SolanaProvider {
connection: Connection {
\_commitment: 'recent',
\_confirmTransactionInitialTimeout: undefined,
\_rpcEndpoint: 'http://localhost:8899',
\_rpcWsEndpoint: 'ws://localhost:8900/',
\_rpcClient: [ClientBrowser],
\_rpcRequest: [Function (anonymous)],
\_rpcBatchRequest: [Function (anonymous)],
\_rpcWebSocket: [Client],
\_rpcWebSocketConnected: false,
\_rpcWebSocketHeartbeat: null,
\_rpcWebSocketIdleTimeout: null,
\_disableBlockhashCaching: false,
\_pollingBlockhash: false,
\_blockhashInfo: [Object],
\_accountChangeSubscriptionCounter: 0,
\_accountChangeSubscriptions: {},
\_programAccountChangeSubscriptionCounter: 0,
\_programAccountChangeSubscriptions: {},
\_rootSubscriptionCounter: 0,
\_rootSubscriptions: {},
\_signatureSubscriptionCounter: 0,
\_signatureSubscriptions: {},
\_slotSubscriptionCounter: 0,
\_slotSubscriptions: {},
\_logsSubscriptionCounter: 0,
\_logsSubscriptions: {},
\_slotUpdateSubscriptionCounter: 0,
\_slotUpdateSubscriptions: {}
},∏
opts: { preflightCommitment: 'recent', commitment: 'recent' },
broadcaster: SingleConnectionBroadcaster {
sendConnection: [Connection],
opts: [Object]
},
wallet: NodeWallet { payer: [Keypair] },
signer: SolanaTransactionSigner {
wallet: [NodeWallet],
broadcaster: [SingleConnectionBroadcaster],
preflightCommitment: 'recent'
}
},
programs: {
MergeMine: Program {
\_idl: [Object],
\_provider: [Provider],
\_programId: [PublicKey],
\_coder: [Coder],
\_events: [EventManager],
rpc: [Object],
instruction: [Object],
transaction: [Object],
account: [Object],
simulate: [Object],
state: undefined
},
Mine: Program {
\_idl: [Object],
\_provider: [Provider],
\_programId: [PublicKey],
\_coder: [Coder],
\_events: [EventManager],
rpc: [Object],
instruction: [Object],
transaction: [Object],
account: [Object],
simulate: [Object],
state: undefined
},
MintWrapper: Program {
\_idl: [Object],
\_provider: [Provider],
\_programId: [PublicKey],
\_coder: [Coder],
\_events: [EventManager],
rpc: [Object],
instruction: [Object],
transaction: [Object],
account: [Object],
simulate: [Object],
state: undefined
},
Operator: Program {
\_idl: [Object],
\_provider: [Provider],
\_programId: [PublicKey],
\_coder: [Coder],
\_events: [EventManager],
rpc: [Object],
instruction: [Object],
transaction: [Object],
account: [Object],
simulate: [Object],
state: undefined
},
Redeemer: Program {
\_idl: [Object],
\_provider: [Provider],
\_programId: [PublicKey],
\_coder: [Coder],
\_events: [EventManager],
rpc: [Object],
instruction: [Object],
transaction: [Object],
account: [Object],
simulate: [Object],
state: undefined
},
Registry: Program {
\_idl: [Object],
\_provider: [Provider],
\_programId: [PublicKey],
\_coder: [Coder],
\_events: [EventManager],
rpc: [Object],
instruction: [Object],
transaction: [Object],
account: [Object],
simulate: [Object],
state: undefined
}
}
}
